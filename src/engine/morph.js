// Vector auto-animator — shape morphing geometry.
//
// Given two closed rings (the shape you drew first and the shape you drew
// second) this builds a 1:1 vertex correspondence so that every point of the
// start shape travels to exactly one point of the end shape:
//
//   1. both rings are cleaned (closing duplicate dropped, zero-length edges
//      removed) and wound the same way, so the fill never turns inside-out;
//   2. a ring with *too many* points is thinned (Visvalingam–Whyatt) down to the
//      point budget, removing the vertices that change the outline least;
//   3. the ring with *fewer* points gets extra vertices inserted along its
//      perimeter, in proportion to edge length and without moving any existing
//      vertex — so the shape still looks exactly as drawn at its keyframe;
//   4. the end ring is rotated (its start vertex is re-chosen) to the offset that
//      minimises the total travel distance, and the best few offsets are checked
//      at intermediate frames for self-intersections ("tangles"). The one with no
//      tangles and the least travel wins.
//
// Everything here is pure: points are [x, y] arrays in a flat canvas space and
// nothing touches Leaflet or the DOM, so it can be unit-tested in isolation and
// reused by both the on-map preview and the Alight Motion exporter.

const EPS = 1e-9;

/** Squared distance between two points. */
function d2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/**
 * Drop the closing duplicate vertex and any consecutive duplicates.
 * Returns a fresh array of fresh [x, y] pairs.
 */
export function cleanRing(ring) {
  const out = [];
  for (const p of ring || []) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const q = [p[0], p[1]];
    if (out.length && d2(out[out.length - 1], q) < EPS) continue;
    out.push(q);
  }
  while (out.length > 1 && d2(out[0], out[out.length - 1]) < EPS) out.pop();
  return out;
}

/** Shoelace signed area (positive = counter-clockwise in a y-up frame). */
export function signedArea(ring) {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Perimeter length of a closed ring. */
export function ringLength(ring) {
  let len = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) len += Math.sqrt(d2(ring[i], ring[(i + 1) % n]));
  return len;
}

/**
 * Insert `count` extra vertices along the ring's edges without moving any of
 * the existing ones. Points are distributed in proportion to edge length
 * (largest-remainder rounding), then spread evenly along each edge, so the
 * result is as close to uniform arc-length spacing as the original vertices
 * allow.
 */
export function addPoints(ring, count) {
  const n = ring.length;
  if (count <= 0 || n < 2) return ring.map((p) => [p[0], p[1]]);

  const lengths = new Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    lengths[i] = Math.sqrt(d2(ring[i], ring[(i + 1) % n]));
    total += lengths[i];
  }

  // Ideal (fractional) share per edge, floor it, then hand the remaining
  // points to the edges with the largest fractional remainder.
  const alloc = new Array(n).fill(0);
  let used = 0;
  const remainders = [];
  for (let i = 0; i < n; i++) {
    const ideal = total > 0 ? (lengths[i] / total) * count : count / n;
    alloc[i] = Math.floor(ideal);
    used += alloc[i];
    remainders.push({ i, r: ideal - alloc[i], len: lengths[i] });
  }
  remainders.sort((a, b) => b.r - a.r || b.len - a.len);
  for (let k = 0; used < count; k = (k + 1) % n) {
    alloc[remainders[k].i]++;
    used++;
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    out.push([p[0], p[1]]);
    const m = alloc[i];
    for (let j = 1; j <= m; j++) {
      const f = j / (m + 1);
      out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
    }
  }
  return out;
}

/**
 * Visvalingam–Whyatt simplification down to `maxPoints` vertices: repeatedly
 * removes the vertex whose triangle with its neighbours has the smallest area,
 * i.e. the one whose removal changes the outline the least. Never goes below
 * 3 vertices.
 */
export function simplifyRing(ring, maxPoints) {
  const target = Math.max(3, maxPoints | 0);
  if (ring.length <= target) return ring.map((p) => [p[0], p[1]]);

  const pts = ring.map((p) => [p[0], p[1]]);
  const alive = new Array(pts.length).fill(true);
  let aliveCount = pts.length;
  const prevOf = (i) => {
    let j = i;
    do j = (j - 1 + pts.length) % pts.length; while (!alive[j]);
    return j;
  };
  const nextOf = (i) => {
    let j = i;
    do j = (j + 1) % pts.length; while (!alive[j]);
    return j;
  };
  const triArea = (i) => {
    const a = pts[prevOf(i)];
    const b = pts[i];
    const c = pts[nextOf(i)];
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  };

  const area = pts.map((_, i) => triArea(i));
  while (aliveCount > target) {
    let best = -1;
    let bestArea = Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (alive[i] && area[i] < bestArea) {
        bestArea = area[i];
        best = i;
      }
    }
    if (best < 0) break;
    alive[best] = false;
    aliveCount--;
    const p = prevOf(best);
    const q = nextOf(best);
    area[p] = triArea(p);
    area[q] = triArea(q);
  }
  return pts.filter((_, i) => alive[i]);
}

/** Ring re-indexed to start at `offset`. */
export function rotateRing(ring, offset) {
  const n = ring.length;
  const k = ((offset % n) + n) % n;
  return ring.slice(k).concat(ring.slice(0, k));
}

/**
 * Score every cyclic offset of `b` against `a` (same length) by total squared
 * travel distance. Returns offsets sorted best-first.
 */
export function rankRotations(a, b) {
  const n = a.length;
  const scores = [];
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d2(a[i], b[(i + k) % n]);
    scores.push({ offset: k, score: s });
  }
  scores.sort((x, y) => x.score - y.score || x.offset - y.offset);
  return scores;
}

/** Best cyclic offset of `b` for `a` (least total travel). */
export function bestRotation(a, b) {
  return rankRotations(a, b)[0];
}

/** Linear blend of two equal-length rings. */
export function interpolateRing(a, b, t) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = [a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t];
  }
  return out;
}

function orient(p, q, r) {
  const v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(v) < EPS) return 0;
  return v > 0 ? 1 : 2;
}

function onSegment(p, q, r) {
  return (
    q[0] <= Math.max(p[0], r[0]) + EPS && q[0] >= Math.min(p[0], r[0]) - EPS &&
    q[1] <= Math.max(p[1], r[1]) + EPS && q[1] >= Math.min(p[1], r[1]) - EPS
  );
}

/** Proper or touching intersection test between segments p1p2 and p3p4. */
export function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

/**
 * Number of crossing (non-adjacent) edge pairs in a closed ring. Edges are
 * swept along x so only pairs whose boxes overlap are tested; counting stops
 * at `limit` so a hopeless candidate is rejected quickly.
 */
export function selfIntersections(ring, limit = Infinity) {
  const n = ring.length;
  if (n < 4) return 0;
  const minX = new Float64Array(n);
  const maxX = new Float64Array(n);
  const minY = new Float64Array(n);
  const maxY = new Float64Array(n);
  const order = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    minX[i] = Math.min(a[0], b[0]);
    maxX[i] = Math.max(a[0], b[0]);
    minY[i] = Math.min(a[1], b[1]);
    maxY[i] = Math.max(a[1], b[1]);
    order[i] = i;
  }
  order.sort((p, q) => minX[p] - minX[q]);
  let count = 0;
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi];
    const iMaxX = maxX[i];
    for (let oj = oi + 1; oj < n; oj++) {
      const j = order[oj];
      if (minX[j] > iMaxX) break; // sorted by minX: nothing further can overlap
      // adjacent edges share a vertex and never count as a crossing
      const d = Math.abs(i - j);
      if (d === 1 || d === n - 1) continue;
      if (minY[j] > maxY[i] || maxY[j] < minY[i]) continue;
      if (segmentsIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) {
        count++;
        if (count >= limit) return count;
      }
    }
  }
  return count;
}

/**
 * Tangles a candidate correspondence produces mid-animation: the worst
 * self-intersection count over a few sampled frames, minus the intersections
 * the drawn shapes already have on their own (a hand-drawn bow-tie is not the
 * animator's fault).
 */
export const TANGLE_SAMPLES = [0.05, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.95];

export function tangleScore(from, to, baseline = 0, samples = TANGLE_SAMPLES) {
  let worst = 0;
  for (const t of samples) {
    const n = selfIntersections(interpolateRing(from, to, t));
    if (n > worst) worst = n;
  }
  return Math.max(0, worst - baseline);
}

/**
 * Build the morph plan for two rings.
 *
 * @param {number[][]} ringA  start outline, [[x, y], …]
 * @param {number[][]} ringB  end outline
 * @param {object} [opts]
 * @param {number} [opts.maxPoints=400]  point budget — denser rings are thinned first
 * @param {number} [opts.minPoints=32]   both rings are densified at least this far
 * @param {boolean} [opts.tangleCheck=true]  test the best offsets for mid-animation crossings
 * @param {number} [opts.candidates]     how many offsets to tangle-test (default: adaptive —
 *                                       every offset for rings up to ~600 points, fewer beyond)
 * @returns {{from:number[][], to:number[][], pointCount:number, offset:number,
 *           addedA:number, addedB:number, removedA:number, removedB:number,
 *           reversed:boolean, tangles:number, travel:number}}
 */
export function prepareMorph(ringA, ringB, opts = {}) {
  const maxPoints = Math.max(3, opts.maxPoints ?? 400);
  const minPoints = Math.max(3, Math.min(opts.minPoints ?? 32, maxPoints));
  const tangleCheck = opts.tangleCheck !== false;

  let a = cleanRing(ringA);
  let b = cleanRing(ringB);
  if (a.length < 3) throw new Error('Start shape needs at least 3 distinct points');
  if (b.length < 3) throw new Error('End shape needs at least 3 distinct points');

  // Same winding, or the fill would flip through itself half-way.
  const areaA = signedArea(a);
  const areaB = signedArea(b);
  let reversed = false;
  if (areaA !== 0 && areaB !== 0 && Math.sign(areaA) !== Math.sign(areaB)) {
    b = b.slice().reverse();
    reversed = true;
  }

  // Thin whichever ring is over budget, then bring both to the same count.
  const origA = a.length;
  const origB = b.length;
  if (a.length > maxPoints) a = simplifyRing(a, maxPoints);
  if (b.length > maxPoints) b = simplifyRing(b, maxPoints);
  const removedA = origA - a.length;
  const removedB = origB - b.length;

  const target = Math.max(a.length, b.length, minPoints);
  const addedA = target - a.length;
  const addedB = target - b.length;
  if (addedA > 0) a = addPoints(a, addedA);
  if (addedB > 0) b = addPoints(b, addedB);

  // Pick the start vertex of B that keeps every point's journey short, then
  // make sure that choice does not cross itself on the way.
  const ranked = rankRotations(a, b);
  let chosen = ranked[0];
  let tangles = 0;
  if (tangleCheck) {
    const n = a.length;
    // Work budget: every offset for small/medium rings, the best few hundred
    // (by travel) for very dense ones. Ranked best-first + early exit means the
    // common case stops after the first clean candidate anyway.
    const candidates = Math.max(1, Math.min(n, opts.candidates ?? Math.max(16, Math.floor(4e8 / (n * n * TANGLE_SAMPLES.length)))));
    const baseline = Math.max(selfIntersections(a), selfIntersections(b));
    let best = null;
    for (const cand of ranked.slice(0, candidates)) {
      const to = rotateRing(b, cand.offset);
      const score = tangleScore(a, to, baseline);
      if (!best || score < best.tangles || (score === best.tangles && cand.score < best.score)) {
        best = { ...cand, tangles: score };
        if (score === 0) break; // ranked best-first, so the first clean one wins
      }
    }
    chosen = best;
    tangles = best.tangles;
  }

  return {
    from: a,
    to: rotateRing(b, chosen.offset),
    pointCount: a.length,
    offset: chosen.offset,
    addedA,
    addedB,
    removedA,
    removedB,
    reversed,
    tangles,
    travel: Math.sqrt(chosen.score / a.length),
  };
}

/**
 * Evaluate a CSS-style cubic-bezier easing (x1 y1 x2 y2) at progress x∈[0,1].
 * Mirrors how Alight Motion applies the `cubicBezier` keyframe easing, so the
 * on-map preview moves the way the exported project will.
 */
export function cubicBezierEase(x1, y1, x2, y2, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bez = (t, p1, p2) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  // Solve bezX(t) = x by bisection — monotone because 0 ≤ x1, x2 ≤ 1.
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 40; i++) {
    const bx = bez(t, x1, x2);
    if (Math.abs(bx - x) < 1e-7) break;
    if (bx < x) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return bez(t, y1, y2);
}
