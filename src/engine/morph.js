// Vector auto-animator — shape morphing geometry.
//
// Given two closed rings (the shape you drew first and the shape you drew
// second) this builds a vertex correspondence so that every point of the start
// shape travels to a point of the end shape:
//
//   1. both rings are cleaned (closing duplicate dropped, zero-length edges
//      removed) and wound the same way, so the fill never turns inside-out;
//   2. a ring with *too many* points is thinned (Visvalingam–Whyatt) down to the
//      point budget, removing the vertices that change the outline least;
//   3. the two rings are aligned by dynamic time warping (`alignRings`): the
//      vertices are paired up in order so that the summed travel is minimal.
//      Whatever is identical in both shapes pairs with itself and does not move
//      at all; where one shape has more detail, the other gets extra vertices
//      inserted along its own outline — never moving a drawn vertex — so both
//      keyframes look exactly like what was drawn;
//   4. a few alignment seeds (start-vertex pairs) are tried and checked at
//      intermediate frames for self-intersections ("tangles"); the one with the
//      least travel and the fewest tangles wins (a crossing costs TANGLE_COST px
//      of travel). The older uniform arc-length matching is kept as a fallback
//      for pairs where every warp tangles badly.
//
// Multi-part shapes (mainland + islands, holes) are first turned into ONE ring
// by `prepareShape`: the bridges are planned on the full-resolution rings so
// every bridge starts exactly on the drawn coast, the rings are then thinned
// with per-ring detail thresholds (which two shapes can share through
// `shareThinning`, so coastline they have in common keeps identical vertices),
// and the result is validated — an island the thinned coast cuts through is
// dropped rather than drawn across, and a coast that folds over itself when
// thinned is straightened (`untangleRing`).
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
 * Visvalingam–Whyatt "effective area" of every vertex: the area of the
 * triangle it forms with its neighbours at the moment it would be removed,
 * made monotone (a vertex never scores below the one removed just before it).
 * Keeping the vertices whose effective area is ≥ ε is therefore the same as
 * running the classic remove-the-smallest-triangle loop until the smallest
 * remaining triangle is ε — and because removals only ever change the two
 * neighbours' triangles, identical stretches of two different rings get
 * identical scores. Protected vertices (and the last three survivors) score
 * +Infinity.
 *
 * @param {number[][]} ring
 * @param {(index:number, point:number[]) => boolean} [protect]
 * @returns {Float64Array}
 */
export function effectiveAreas(ring, protect) {
  const n = ring.length;
  const out = new Float64Array(n).fill(Infinity);
  if (n <= 3) return out;
  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    prev[i] = (i - 1 + n) % n;
    next[i] = (i + 1) % n;
  }
  const tri = (i) => {
    const a = ring[prev[i]];
    const b = ring[i];
    const c = ring[next[i]];
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  };
  const locked = new Uint8Array(n);
  if (protect) for (let i = 0; i < n; i++) if (protect(i, ring[i])) locked[i] = 1;

  // binary min-heap of (area, index, version) with lazy invalidation
  const area = new Float64Array(n);
  const version = new Int32Array(n);
  const removed = new Uint8Array(n);
  let heapA = new Float64Array(n * 2 + 8);
  let heapI = new Int32Array(n * 2 + 8);
  let heapV = new Int32Array(n * 2 + 8);
  let size = 0;
  const grow = () => {
    const A = new Float64Array(heapA.length * 2);
    const I = new Int32Array(heapI.length * 2);
    const V = new Int32Array(heapV.length * 2);
    A.set(heapA); I.set(heapI); V.set(heapV);
    heapA = A; heapI = I; heapV = V;
  };
  const less = (x, y) => heapA[x] < heapA[y] || (heapA[x] === heapA[y] && heapI[x] < heapI[y]);
  const swap = (x, y) => {
    const a = heapA[x]; heapA[x] = heapA[y]; heapA[y] = a;
    const i = heapI[x]; heapI[x] = heapI[y]; heapI[y] = i;
    const v = heapV[x]; heapV[x] = heapV[y]; heapV[y] = v;
  };
  const push = (a, i, v) => {
    if (size >= heapA.length) grow();
    let k = size++;
    heapA[k] = a; heapI[k] = i; heapV[k] = v;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (!less(k, parent)) break;
      swap(k, parent);
      k = parent;
    }
  };
  const pop = () => {
    const a = heapA[0];
    const i = heapI[0];
    const v = heapV[0];
    size--;
    if (size > 0) {
      heapA[0] = heapA[size]; heapI[0] = heapI[size]; heapV[0] = heapV[size];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < size && less(l, m)) m = l;
        if (r < size && less(r, m)) m = r;
        if (m === k) break;
        swap(k, m);
        k = m;
      }
    }
    return [a, i, v];
  };

  for (let i = 0; i < n; i++) {
    area[i] = tri(i);
    if (!locked[i]) push(area[i], i, 0);
  }
  let alive = n;
  let floor = 0;
  while (size > 0 && alive > 3) {
    const [a, i, v] = pop();
    if (removed[i] || v !== version[i]) continue;
    const eff = Math.max(a, floor);
    floor = eff;
    out[i] = eff;
    removed[i] = 1;
    alive--;
    const p = prev[i];
    const q = next[i];
    next[p] = q;
    prev[q] = p;
    for (const j of [p, q]) {
      if (removed[j] || locked[j]) continue;
      area[j] = tri(j);
      version[j]++;
      push(area[j], j, version[j]);
    }
  }
  return out;
}

/**
 * Indices of the `count` vertices to keep, by effective area (ties broken by
 * index so the result is stable). Always keeps every protected vertex.
 */
function keepByArea(areas, count) {
  const n = areas.length;
  const idx = [];
  const keep = new Uint8Array(n);
  let kept = 0;
  for (let i = 0; i < n; i++) {
    if (areas[i] === Infinity) { keep[i] = 1; kept++; } else idx.push(i);
  }
  idx.sort((i, j) => areas[j] - areas[i] || i - j);
  for (let k = 0; k < idx.length && kept < count; k++) { keep[idx[k]] = 1; kept++; }
  return keep;
}

/**
 * Visvalingam–Whyatt simplification down to `maxPoints` vertices: repeatedly
 * removes the vertex whose triangle with its neighbours has the smallest area,
 * i.e. the one whose removal changes the outline the least. Never goes below
 * 3 vertices. `opts.protect(index, point)` marks vertices that must survive.
 */
export function simplifyRing(ring, maxPoints, opts = {}) {
  const target = Math.max(3, maxPoints | 0);
  if (ring.length <= target) return ring.map((p) => [p[0], p[1]]);
  const keep = keepByArea(effectiveAreas(ring, opts.protect), target);
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push([ring[i][0], ring[i][1]]);
  return out;
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
/** Pixels of RMS travel one mid-morph self-crossing is deemed to cost when ranking matches. */
export const TANGLE_COST = 20;

export const TANGLE_SAMPLES = [0.05, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.95];

export function tangleScore(from, to, baseline = 0, samples = TANGLE_SAMPLES) {
  let worst = 0;
  for (const t of samples) {
    const n = selfIntersections(interpolateRing(from, to, t));
    if (n > worst) worst = n;
  }
  return Math.max(0, worst - baseline);
}

/** Prefix arc lengths of a ring in index order: arc[i] = length from vertex 0 to vertex i, arc[n] = perimeter. */
function prefixArcs(ring) {
  const n = ring.length;
  const arc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) arc[i + 1] = arc[i] + Math.sqrt(d2(ring[i], ring[(i + 1) % n]));
  return arc;
}

/**
 * Least-motion correspondence between two rings by dynamic time warping over
 * their vertex sequences, starting from the pair (a[startA], b[startB]).
 *
 * Every vertex of A is paired, in order, with one or more vertices of B and
 * vice versa so that the summed distance is minimal. Stretches that are the
 * same in both shapes pair with themselves (zero travel); where one shape has
 * more vertices, the other one gets extra points — spread along its own edge
 * towards the next vertex, in proportion to the partner's arc length — so no
 * drawn vertex ever moves and both keyframes look exactly as drawn.
 *
 * @returns {{from:number[][], to:number[][], cost:number}} equal-length point lists
 */
export function alignRings(a, b, startA = 0, startB = 0) {
  const n = a.length;
  const m = b.length;
  const A = rotateRing(a, startA);
  const B = rotateRing(b, startB);

  // DP over the n×m grid, two rows at a time + a step matrix for the backtrack
  const step = new Uint8Array(n * m); // 0 diagonal, 1 from (i-1, j), 2 from (i, j-1)
  let prevRow = new Float64Array(m);
  let row = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const ai = A[i];
    const base = i * m;
    for (let j = 0; j < m; j++) {
      const c = Math.sqrt(d2(ai, B[j]));
      if (i === 0 && j === 0) {
        row[j] = c;
      } else if (i === 0) {
        row[j] = row[j - 1] + c;
        step[base + j] = 2;
      } else if (j === 0) {
        row[j] = prevRow[j] + c;
        step[base + j] = 1;
      } else {
        let best = prevRow[j - 1];
        let s = 0;
        if (prevRow[j] < best) { best = prevRow[j]; s = 1; }
        if (row[j - 1] < best) { best = row[j - 1]; s = 2; }
        row[j] = best + c;
        step[base + j] = s;
      }
    }
    const t = prevRow; prevRow = row; row = t;
  }
  const cost = prevRow[m - 1];

  // backtrack → monotone path from (0,0) to (n-1,m-1)
  const path = [];
  let i = n - 1;
  let j = m - 1;
  for (;;) {
    path.push([i, j]);
    if (i === 0 && j === 0) break;
    const s = step[i * m + j];
    if (s === 0) { i--; j--; } else if (s === 1) i--; else j--;
  }
  path.reverse();

  // first appearance of every vertex along the path
  const jFirst = new Int32Array(n).fill(-1);
  const iFirst = new Int32Array(m).fill(-1);
  for (const [pi, pj] of path) {
    if (jFirst[pi] < 0) jFirst[pi] = pj;
    if (iFirst[pj] < 0) iFirst[pj] = pi;
  }
  const arcA = prefixArcs(A);
  const arcB = prefixArcs(B);
  const from = [];
  const to = [];
  for (let k = 0; k < path.length; k++) {
    const [pi, pj] = path[k];
    const ai = A[pi];
    const bj = B[pj];
    if (k > 0 && path[k - 1][0] === pi) {
      // a[pi] pairs again: slide along its edge towards the next A vertex
      const j0 = jFirst[pi];
      const j1 = pi + 1 < n ? jFirst[pi + 1] : m;
      const f = (arcB[pj] - arcB[j0]) / (arcB[j1] - arcB[j0] || 1);
      if (f >= 1 - 1e-9) continue; // same pair as the next vertex's first one
      const an = A[(pi + 1) % n];
      from.push([ai[0] + (an[0] - ai[0]) * f, ai[1] + (an[1] - ai[1]) * f]);
      to.push([bj[0], bj[1]]);
    } else if (k > 0 && path[k - 1][1] === pj) {
      const i0 = iFirst[pj];
      const i1 = pj + 1 < m ? iFirst[pj + 1] : n;
      const g = (arcA[pi] - arcA[i0]) / (arcA[i1] - arcA[i0] || 1);
      if (g >= 1 - 1e-9) continue;
      const bn = B[(pj + 1) % m];
      from.push([ai[0], ai[1]]);
      to.push([bj[0] + (bn[0] - bj[0]) * g, bj[1] + (bn[1] - bj[1]) * g]);
    } else {
      from.push([ai[0], ai[1]]);
      to.push([bj[0], bj[1]]);
    }
  }
  return { from, to, cost };
}

/**
 * Seed pairs for the alignment: vertices of A with the closest partner in B,
 * spread around the ring so that different starting regions get a try.
 */
export function alignmentSeeds(a, b, count = 4) {
  const n = a.length;
  const m = b.length;
  const nearest = new Int32Array(n);
  const dist = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    let bj = 0;
    for (let j = 0; j < m; j++) {
      const d = d2(a[i], b[j]);
      if (d < best) { best = d; bj = j; }
    }
    nearest[i] = bj;
    dist[i] = best;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => dist[i] - dist[j] || i - j);
  const minGap = Math.max(1, Math.floor(n / (count + 1)));
  const seeds = [];
  for (const i of order) {
    if (seeds.length >= count) break;
    const far = seeds.every(([p]) => {
      const d = Math.abs(p - i);
      return Math.min(d, n - d) >= minGap;
    });
    if (far) seeds.push([i, nearest[i]]);
  }
  return seeds;
}

/**
 * Insert `count` extra pairs along the matched edges (same fraction on both
 * rings, so the correspondence is kept), distributed by the longer of the two
 * edges. Used to bring tiny shapes up to a smooth minimum point count.
 */
export function densifyPairs(from, to, count) {
  const n = from.length;
  if (count <= 0 || n < 2) return { from: from.map((p) => [p[0], p[1]]), to: to.map((p) => [p[0], p[1]]) };
  const lengths = new Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    lengths[i] = Math.max(Math.sqrt(d2(from[i], from[k])), Math.sqrt(d2(to[i], to[k])));
    total += lengths[i];
  }
  const alloc = new Array(n).fill(0);
  let used = 0;
  const remainders = [];
  for (let i = 0; i < n; i++) {
    const ideal = total > 0 ? (lengths[i] / total) * count : count / n;
    alloc[i] = Math.floor(ideal);
    used += alloc[i];
    remainders.push({ i, r: ideal - alloc[i], len: lengths[i] });
  }
  remainders.sort((x, y) => y.r - x.r || y.len - x.len || x.i - y.i);
  for (let k = 0; used < count; k = (k + 1) % n) {
    alloc[remainders[k].i]++;
    used++;
  }
  const outA = [];
  const outB = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    outA.push([from[i][0], from[i][1]]);
    outB.push([to[i][0], to[i][1]]);
    for (let j = 1; j <= alloc[i]; j++) {
      const f = j / (alloc[i] + 1);
      outA.push([from[i][0] + (from[k][0] - from[i][0]) * f, from[i][1] + (from[k][1] - from[i][1]) * f]);
      outB.push([to[i][0] + (to[k][0] - to[i][0]) * f, to[i][1] + (to[k][1] - to[i][1]) * f]);
    }
  }
  return { from: outA, to: outB };
}

/** Root-mean-square travel of a correspondence (canvas px). */
function rmsTravel(from, to) {
  let s = 0;
  for (let i = 0; i < from.length; i++) s += d2(from[i], to[i]);
  return Math.sqrt(s / Math.max(1, from.length));
}

/**
 * Build the morph plan for two rings.
 *
 * @param {number[][]} ringA  start outline, [[x, y], …]
 * @param {number[][]} ringB  end outline
 * @param {object} [opts]
 * @param {number} [opts.maxPoints=400]  point budget per ring — denser rings are thinned first
 * @param {number} [opts.minPoints=32]   both rings are densified at least this far
 * @param {boolean} [opts.tangleCheck=true]  test the candidates for mid-animation crossings
 * @param {number} [opts.seeds=4]        how many alignment seeds to try
 * @param {'warp'|'uniform'} [opts.matching='warp']  least-motion warp (default) or the
 *                                       uniform arc-length matching only
 * @param {number} [opts.candidates]     uniform offsets to tangle-test (fallback path)
 * @returns {{from:number[][], to:number[][], pointCount:number, offset:number,
 *           addedA:number, addedB:number, removedA:number, removedB:number,
 *           reversed:boolean, tangles:number, travel:number, matching:string}}
 */
export function prepareMorph(ringA, ringB, opts = {}) {
  const maxPoints = Math.max(3, opts.maxPoints ?? 400);
  const minPoints = Math.max(3, Math.min(opts.minPoints ?? 32, maxPoints));
  const tangleCheck = opts.tangleCheck !== false;
  const matching = opts.matching === 'uniform' ? 'uniform' : 'warp';

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

  // Thin whichever ring is over budget.
  const origA = a.length;
  const origB = b.length;
  if (a.length > maxPoints) a = simplifyRing(a, maxPoints);
  if (b.length > maxPoints) b = simplifyRing(b, maxPoints);
  const removedA = origA - a.length;
  const removedB = origB - b.length;
  const baseline = tangleCheck ? Math.max(selfIntersections(a), selfIntersections(b)) : 0;

  const finish = (from, to) => {
    const extra = Math.max(0, minPoints - from.length);
    return extra > 0 ? densifyPairs(from, to, extra) : { from, to };
  };
  // One mid-morph crossing is a momentary sliver; sliding the whole outline
  // round is a lot more visible. Trade them at TANGLE_COST px of average
  // travel per crossing, so a least-motion warp with a crossing or two still
  // beats a tangle-free match that moves everything.
  const cost = (c) => c.tangles * TANGLE_COST + c.travel;
  const better = (x, y) => !y || cost(x) < cost(y);
  let best = null;

  // 1. least-motion warp from a few seed pairs
  if (matching === 'warp') {
    for (const [sa, sb] of alignmentSeeds(a, b, Math.max(1, opts.seeds ?? 4))) {
      const al = alignRings(a, b, sa, sb);
      const { from, to } = finish(al.from, al.to);
      const cand = {
        from, to,
        offset: sb,
        rotation: sa,
        tangles: tangleCheck ? tangleScore(from, to, baseline) : 0,
        travel: rmsTravel(from, to),
        matching: 'warp',
      };
      if (better(cand, best)) best = cand;
    }
  }

  // 2. uniform arc-length matching: the only path in 'uniform' mode, otherwise
  //    a fallback when every warp crosses itself somewhere
  if (!best || best.tangles > 0) {
    const target = Math.max(a.length, b.length, minPoints);
    const ua = a.length < target ? addPoints(a, target - a.length) : a;
    const ub = b.length < target ? addPoints(b, target - b.length) : b;
    const ranked = rankRotations(ua, ub);
    const n = ua.length;
    const candidates = tangleCheck
      ? Math.max(1, Math.min(n, opts.candidates ?? Math.max(16, Math.floor(4e8 / (n * n * TANGLE_SAMPLES.length)))))
      : 1;
    for (const cand of ranked.slice(0, candidates)) {
      const to = rotateRing(ub, cand.offset);
      const score = tangleCheck ? tangleScore(ua, to, baseline) : 0;
      const c = {
        from: ua, to,
        offset: cand.offset,
        rotation: 0,
        tangles: score,
        travel: Math.sqrt(cand.score / n),
        matching: 'uniform',
      };
      if (better(c, best)) best = c;
      if (best.tangles === 0 && best.matching === 'uniform') break; // ranked best-first
    }
  }

  // Start the result at A's first drawn vertex again (purely cosmetic: keeps
  // the knot order stable for the export and the tests).
  let from = best.from;
  let to = best.to;
  if (best.rotation) {
    const start = from.findIndex((p) => d2(p, a[0]) < EPS);
    if (start > 0) {
      from = rotateRing(from, start);
      to = rotateRing(to, start);
    }
  }
  return {
    from,
    to,
    pointCount: from.length,
    offset: best.offset,
    addedA: from.length - a.length,
    addedB: to.length - b.length,
    removedA,
    removedB,
    reversed,
    tangles: best.tangles,
    travel: best.travel,
    matching: best.matching,
  };
}

// ---- multi-part shapes: islands and holes joined by hair-thin bridges -------
//
// Alight Motion can only keyframe ONE contour per layer, so a country made of a
// mainland plus islands (or with a hole) is turned into a single ring the way
// Age of History 2 draws its provinces: a hair-thin corridor runs from the
// nearest point of the already-connected outline to the nearest point of the
// next island, the island is traced, and the corridor is followed back. The
// two sides of the corridor are BRIDGE_GAP canvas pixels apart (0.02 px — far
// below anything that renders), so the fill looks like separate pieces while
// the outline is still one simple, closed polygon. Holes are traced with the
// opposite winding so the fill rule leaves them empty.
//
// Bridges are planned on the FULL-resolution rings, so a corridor always leaves
// the real coast at the point nearest to the island; those two foot points are
// then protected while the rings are thinned to the point budget.

export const BRIDGE_GAP = 0.02;

/** Copy of `ring` wound positively (counter-clockwise in the shoelace sense) or negatively. */
export function orientRing(ring, positive = true) {
  const a = signedArea(ring);
  const copy = ring.map((p) => [p[0], p[1]]);
  return (a < 0) === positive ? copy.reverse() : copy;
}

/** Squared distance from point p to segment ab plus the foot of the perpendicular. */
function pointSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  const q = [a[0] + vx * t, a[1] + vy * t];
  return { d2: d2(p, q), q };
}

function bboxOf(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

/** Lower bound on the distance between two rings from their bounding boxes. */
function bboxDistance(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

/** Bounding boxes of runs of `size` consecutive edges, so distance scans can skip far-away stretches. */
function edgeChunks(ring, size = 32) {
  const n = ring.length;
  const chunks = [];
  for (let start = 0; start < n; start += size) {
    const end = Math.min(n, start + size);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = start; i <= end; i++) {
      const p = ring[i % n];
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    chunks.push({ start, end, minX, minY, maxX, maxY });
  }
  return chunks;
}

/**
 * Closest approach between the boundaries of two rings: the nearest
 * vertex-to-edge pair in either direction. Returns { dist, onA, onB }.
 */
export function closestApproach(ringA, ringB) {
  let best = { d2: Infinity, onA: null, onB: null };
  const scan = (from, to, swap) => {
    const m = to.length;
    const chunks = edgeChunks(to);
    for (const p of from) {
      for (const c of chunks) {
        const dx = p[0] < c.minX ? c.minX - p[0] : p[0] > c.maxX ? p[0] - c.maxX : 0;
        const dy = p[1] < c.minY ? c.minY - p[1] : p[1] > c.maxY ? p[1] - c.maxY : 0;
        if (dx * dx + dy * dy >= best.d2) continue;
        for (let j = c.start; j < c.end; j++) {
          const r = pointSegment(p, to[j], to[(j + 1) % m]);
          if (r.d2 < best.d2) best = swap ? { d2: r.d2, onA: r.q, onB: [p[0], p[1]] } : { d2: r.d2, onA: [p[0], p[1]], onB: r.q };
        }
      }
    }
  };
  scan(ringA, ringB, false);
  scan(ringB, ringA, true);
  return { dist: Math.sqrt(best.d2), onA: best.onA, onB: best.onB };
}

/**
 * Make `pt` a vertex of `ring` (mutates): returns the existing vertex when `pt`
 * already sits on one, otherwise splices a new vertex into the nearest edge.
 */
export function insertPointOnRing(ring, pt) {
  const n = ring.length;
  let bestEdge = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    if (d2(a, pt) < EPS) return a;
    const r = pointSegment(pt, a, ring[(i + 1) % n]);
    if (r.d2 < bestD2) {
      bestD2 = r.d2;
      bestEdge = i;
    }
  }
  const b = ring[(bestEdge + 1) % n];
  if (d2(b, pt) < EPS) return b;
  const v = [pt[0], pt[1]];
  ring.splice(bestEdge + 1, 0, v);
  return v;
}

/** Ray-casting point-in-ring test. */
function pointInRing(p, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Clean + orient the rings of `parts` into records; holes remember their outer ring. */
function ringRecords(parts) {
  const recs = [];
  let dropped = 0;
  (parts || []).forEach((part, partIndex) => {
    const outer = cleanRing(part.outer);
    if (outer.length < 3) {
      dropped += 1 + ((part.holes && part.holes.length) || 0);
      return;
    }
    const rec = { pts: orientRing(outer, true), positive: true, parent: null, partIndex, key: `${partIndex}:o` };
    rec.area = Math.abs(signedArea(rec.pts));
    rec.drawn = rec.pts.length;
    recs.push(rec);
    (part.holes || []).forEach((h, holeIndex) => {
      const hole = cleanRing(h);
      if (hole.length < 3) { dropped++; return; }
      const hr = { pts: orientRing(hole, false), positive: false, parent: rec, partIndex, key: `${partIndex}:h${holeIndex}` };
      hr.area = Math.abs(signedArea(hr.pts));
      hr.drawn = hr.pts.length;
      recs.push(hr);
    });
  });
  return { recs, dropped };
}

/**
 * Plan the bridges: the largest part is the trunk; everything else hangs off
 * the connected set at its closest approach, nearest first (a hole only once
 * its own part is in). The foot points are spliced into the rings as vertices
 * (mutates `rec.pts`) and returned in `feet` so thinning can protect them.
 */
function attachRings(recs, cache) {
  const outers = recs.filter((r) => r.positive);
  let trunk = outers[0];
  for (const r of outers) if (r.area > trunk.area) trunk = r;
  for (const r of recs) {
    r.connected = r === trunk;
    r.depth = r === trunk ? 0 : Infinity;
    r.bbox = bboxOf(r.pts);
    r.feet = 0;
  }
  const attachments = new Map(); // parent vertex -> [{ child, entry }]
  const feet = new Set();
  const best = new Map(); // unconnected rec -> { dist, target, onTarget, onSelf }
  const consider = (rec, target) => {
    const cur = best.get(rec);
    if (cur && bboxDistance(rec.bbox, target.bbox) >= cur.dist) return;
    const key = `${target.key}|${rec.key}`;
    let c = cache ? cache.get(key) : undefined;
    if (!c) {
      c = closestApproach(target.pts, rec.pts);
      if (cache) cache.set(key, c);
    }
    if (!cur || c.dist < cur.dist) best.set(rec, { dist: c.dist, target, onTarget: c.onA, onSelf: c.onB });
  };
  let pending = recs.filter((r) => r !== trunk);
  for (const r of pending) consider(r, trunk);
  let bridges = 0;
  while (pending.length) {
    let pick = null;
    for (const r of pending) {
      if (!r.positive && !r.parent.connected) continue;
      const b = best.get(r);
      if (b && (!pick || b.dist < best.get(pick).dist)) pick = r;
    }
    if (!pick) break; // cannot happen: a hole's parent is always an outer that gets connected
    const b = best.get(pick);
    const u = insertPointOnRing(b.target.pts, b.onTarget);
    const v = insertPointOnRing(pick.pts, b.onSelf);
    feet.add(u);
    feet.add(v);
    b.target.feet++;
    pick.feet++;
    if (!attachments.has(u)) attachments.set(u, []);
    attachments.get(u).push({ child: pick, entry: v });
    pick.connected = true;
    pick.depth = b.target.depth + 1;
    pick.attachedTo = b.target;
    bridges++;
    pending = pending.filter((r) => r !== pick);
    for (const r of pending) consider(r, pick);
  }
  return { trunk, attachments, feet, bridges };
}

/**
 * Walk the bridge tree into one ring. A vertex that carries bridges is replaced
 * by its two corridor-side copies, so the path never doubles back on itself.
 * Returns the ring and, per vertex, the record it belongs to.
 */
function walkBridged(trunk, attachments, half) {
  const ring = [];
  const owner = [];
  const emit = (p, rec) => { ring.push(p); owner.push(rec); };
  const visit = (rec, startIdx, skipFirst) => {
    const pts = rec.pts;
    const n = pts.length;
    for (let k = skipFirst ? 1 : 0; k < n; k++) {
      const p = pts[(startIdx + k) % n];
      const kids = attachments.get(p);
      if (!kids) {
        emit([p[0], p[1]], rec);
        continue;
      }
      for (const kid of kids) detour(p, rec, kid);
    }
  };
  const detour = (u, parentRec, { child, entry: v }) => {
    const dx = v[0] - u[0];
    const dy = v[1] - u[1];
    const len = Math.hypot(dx, dy) || 1;
    // offset to the right of u→v for an island, to the left for a hole
    const s = child.positive ? 1 : -1;
    const nx = (s * dy / len) * half;
    const ny = (-s * dx / len) * half;
    emit([u[0] + nx, u[1] + ny], parentRec); // leave the parent
    emit([v[0] + nx, v[1] + ny], child); // arrive on the child
    const grand = attachments.get(v);
    if (grand) for (const g of grand) detour(v, child, g);
    visit(child, child.pts.indexOf(v), true);
    emit([v[0] - nx, v[1] - ny], child); // back on the child's entry point
    emit([u[0] - nx, u[1] - ny], parentRec); // back on the parent
  };
  visit(trunk, 0, false);
  return { ring, owner };
}

/**
 * Remove self-crossings from a ring in place by 2-opt moves: when edges
 * (p[i], p[i+1]) and (p[j], p[j+1]) cross, reversing p[i+1 … j] replaces them
 * with (p[i], p[j]) and (p[i+1], p[j+1]), which do not. No vertex moves or is
 * lost — this is what heavy thinning of a convoluted coast occasionally needs.
 * Returns the number of moves made.
 */
export function untangleRing(pts, maxMoves = 64) {
  let moves = 0;
  while (moves < maxMoves) {
    const pairs = crossingEdges(pts);
    if (!pairs.length) break;
    const [i, j] = pairs[0]; // i < j by construction of the sweep? not guaranteed — order them
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    let a = lo + 1;
    let b = hi;
    while (a < b) {
      const t = pts[a];
      pts[a] = pts[b];
      pts[b] = t;
      a++;
      b--;
    }
    moves++;
  }
  return moves;
}

/** Edge pairs of `ring` that cross (same sweep as selfIntersections). */
function crossingEdges(ring) {
  const out = [];
  const n = ring.length;
  if (n < 4) return out;
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
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi];
    for (let oj = oi + 1; oj < n; oj++) {
      const j = order[oj];
      if (minX[j] > maxX[i]) break;
      const d = Math.abs(i - j);
      if (d === 1 || d === n - 1) continue;
      if (minY[j] > maxY[i] || maxY[j] < minY[i]) continue;
      if (segmentsIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) out.push([i, j]);
    }
  }
  return out;
}

/**
 * Join the parts of a (multi)polygon — and their holes — into ONE closed ring
 * with hair-thin bridges (no thinning; see prepareShape for the budgeted version).
 *
 * @param {{outer:number[][], holes?:number[][][]}[]} parts  rings in canvas space
 * @param {object} [opts]
 * @param {number} [opts.gap=BRIDGE_GAP]  corridor width in canvas px
 * @returns {{ring:number[][], bridges:number, parts:number, holes:number, dropped:number}}
 */
export function bridgeRings(parts, opts = {}) {
  const half = (opts.gap ?? BRIDGE_GAP) / 2;
  const { recs, dropped } = ringRecords(parts);
  if (!recs.length) throw new Error('Shape needs at least 3 distinct points');
  const outers = recs.filter((r) => r.positive).length;
  if (recs.length === 1) {
    return { ring: recs[0].pts, bridges: 0, parts: 1, holes: 0, dropped };
  }
  const plan = attachRings(recs);
  const { ring } = walkBridged(plan.trunk, plan.attachments, half);
  return { ring, bridges: plan.bridges, parts: outers, holes: recs.length - outers, dropped };
}

/** Public description of a ring record (what `minAreaFor` receives and `rings` reports). */
function ringInfo(rec, trunk) {
  return {
    key: rec.key,
    trunk: rec === trunk,
    positive: rec.positive,
    area: rec.area,
    bbox: rec.bbox || (rec.bbox = bboxOf(rec.pts)),
    threshold: rec.threshold || 0,
    points: rec.pts.length,
  };
}

/**
 * Thin ring records to a shared point budget. Each ring gets a share in
 * proportion to its perimeter (never below `minRing`, never more than it has),
 * then drops its vertices with the smallest Visvalingam–Whyatt effective area
 * until it fits. Bridge feet always survive. The detail threshold a ring ends
 * up with is a plain number in canvas units, so `minAreaFor(info)` can hand a
 * ring the threshold its twin in another shape used — identical coastline in
 * both shapes then keeps identical vertices.
 */
function thinRecords(recs, budget, minRing, feet, minAreaFor, trunk) {
  const need = (r) => Math.min(minRing, r.pts.length);
  const weight = (r) => Math.max(1e-9, ringLength(r.pts));
  const weightSum = recs.reduce((n, r) => n + weight(r), 0);
  const total = Math.max(recs.reduce((n, r) => n + need(r), 0), budget);
  const share = recs.map((r) => (total * weight(r)) / weightSum);
  const alloc = recs.map((r, i) => Math.min(r.pts.length, Math.max(need(r), Math.floor(share[i]))));
  let left = total - alloc.reduce((a, b) => a + b, 0);
  const order = share.map((v, i) => i).sort((i, j) => (share[j] % 1) - (share[i] % 1) || i - j);
  for (let pass = 0; left > 0 && pass < recs.length * 2; pass++) {
    const i = order[pass % order.length];
    if (alloc[i] < recs[i].pts.length) { alloc[i]++; left--; }
  }

  let removed = 0;
  recs.forEach((rec, ri) => {
    const pts = rec.pts;
    const floor = minAreaFor ? Number(minAreaFor(ringInfo(rec, trunk))) || 0 : 0;
    if (pts.length <= alloc[ri] && floor <= 0) {
      rec.threshold = 0;
      return;
    }
    const areas = effectiveAreas(pts, (i, p) => feet.has(p));
    const keep = new Uint8Array(pts.length);
    let forcedCount = 0;
    const finite = [];
    for (let i = 0; i < pts.length; i++) {
      if (areas[i] === Infinity) { keep[i] = 1; forcedCount++; } else finite.push(i);
    }
    finite.sort((i, j) => areas[j] - areas[i] || i - j);
    // each ring keeps at least its `minRing` most important vertices
    for (let k = 0; k < finite.length && forcedCount < need(rec); k++) {
      keep[finite[k]] = 1;
      forcedCount++;
    }
    const rest = finite.filter((i) => !keep[i]);
    const cap = Math.max(0, alloc[ri] - forcedCount);
    const tOwn = cap >= rest.length ? 0 : cap === 0 ? Infinity : areas[rest[cap - 1]];
    const threshold = Math.max(tOwn, floor);
    rest.forEach((i, rank) => {
      if (areas[i] > threshold || (areas[i] === threshold && (threshold > tOwn || rank < cap))) keep[i] = 1;
    });
    rec.threshold = threshold === Infinity ? (rest.length ? areas[rest[0]] * 1.000001 : 0) : threshold;
    const before = pts.length;
    rec.pts = pts.filter((_, i) => keep[i]);
    removed += before - rec.pts.length;
  });
  return { removed };
}

/**
 * Prepare one shape (any number of parts and holes) for morphing:
 *
 *   1. admit rings largest first: everything, while the shape fits the budget
 *      as drawn; otherwise only rings whose share of the coast still earns
 *      them `minRingPoints` (so tiny islets go before the mainland loses detail);
 *   2. plan the bridges on the full-resolution rings — a corridor leaves the
 *      real coast exactly at the point nearest to the island;
 *   3. thin every ring to its share of the budget, keeping the bridge feet;
 *      each ring reports the detail threshold it used, and `share.minAreaFor`
 *      lets another shape's thresholds be reused so identical coastline keeps
 *      identical vertices (see `shareThinning`); a ring that folds over itself
 *      when thinned is straightened with `untangleRing` (`untangled` counts
 *      the moves);
 *   4. walk the bridges into a single ring. A ring that the thinned outline
 *      cuts through (or swallows) at this detail level is dropped and the
 *      shape is rebuilt without it, so the result is always one simple ring
 *      (`crossings` reports anything left, which is 0 unless the trunk itself
 *      could not be untangled).
 *
 * @param {{outer:number[][], holes?:number[][][]}[]} parts
 * @param {object} [opts]
 * @param {number} [opts.maxPoints=400]
 * @param {number} [opts.minRingPoints=4]
 * @param {number} [opts.gap=BRIDGE_GAP]
 * @param {Map} [opts.cache]  closest-approach cache to share between calls on the same shape
 * @param {{minAreaFor?:Function, keepRing?:Function}} [opts.share]  from `shareThinning(other, own)`:
 *        reuse another prepared shape's detail thresholds and island choices so shared
 *        coastline thins identically (and therefore stays put during the morph)
 * @returns {{ring:number[][], parts:number, holes:number, bridges:number, dropped:number,
 *           removed:number, original:number, threshold:number, crossings:number, untangled:number,
 *           rings:{key:string,trunk:boolean,positive:boolean,area:number,bbox:object,threshold:number,points:number}[]}}
 */
export function prepareShape(parts, opts = {}) {
  const maxPoints = Math.max(3, opts.maxPoints ?? 400);
  const minRing = Math.max(3, opts.minRingPoints ?? 4);
  const half = (opts.gap ?? BRIDGE_GAP) / 2;
  const BRIDGE_COST = 4; // two corridor copies at each end

  const base = ringRecords(parts);
  if (!base.recs.length) throw new Error('Shape needs at least 3 distinct points');
  const original = base.recs.reduce((n, r) => n + r.drawn, 0);
  const excluded = new Set(); // keys of rings dropped because the thinned outline cuts through them
  const cache = opts.cache || new Map(); // closest approaches, reused across attempts (and calls, if given)
  const share = opts.share || null;

  for (let attempt = 0; attempt < 8; attempt++) {
    // fresh copies each attempt (feet insertion and thinning mutate the records)
    const rings = ringRecords(parts).recs.filter((r) => !excluded.has(r.key) && (r.positive || !excluded.has(r.parent.key)));
    if (!rings.length) throw new Error('Shape needs at least 3 distinct points');

    // 1. admission, largest area first, perimeter-weighted shares. Rings the
    //    twin shape kept (share.keepRing) are admitted first so both shapes
    //    animate the same islands.
    const byArea = rings.slice().sort((a, b) => b.area - a.area);
    const need = (r) => Math.min(minRing, r.pts.length);
    const weight = (r) => Math.max(1e-9, ringLength(r.pts));
    const trunkRec = byArea.find((r) => r.positive);
    const keepRing = share && share.keepRing ? share.keepRing : null;
    const keptParts = new Set();
    const kept = [];
    let weightSum = 0;
    let floorCost = 0;
    let rawCost = 0; // every vertex as drawn, plus a bridge (corridor copies + feet) per extra ring
    const admit = (r) => {
      kept.push(r);
      weightSum += weight(r);
      floorCost += need(r) + (kept.length > 1 ? BRIDGE_COST : 0);
      rawCost += r.pts.length + (kept.length > 1 ? BRIDGE_COST + 2 : 0);
      if (r.positive) keptParts.add(r.partIndex);
    };
    admit(trunkRec);
    if (keepRing) {
      for (const r of byArea) {
        if (r === trunkRec || (!r.positive && !keptParts.has(r.partIndex))) continue;
        if (floorCost + need(r) + BRIDGE_COST <= maxPoints && keepRing(ringInfo(r, trunkRec))) admit(r);
      }
    }
    for (const r of byArea) {
      if (kept.includes(r)) continue;
      if (!r.positive && !keptParts.has(r.partIndex)) continue;
      const k = kept.length + 1;
      const budgetK = maxPoints - (k - 1) * BRIDGE_COST;
      const sum = weightSum + weight(r);
      // everything still fits as drawn → nothing needs thinning, so keep it;
      // otherwise a ring must earn at least its minimum from its share of the coast
      const fits = budgetK > 0 && (
        rawCost + r.pts.length + BRIDGE_COST + 2 <= maxPoints
        || [...kept, r].every((q) => (budgetK * weight(q)) / sum >= need(q)));
      if (!fits) break;
      admit(r);
    }
    const ordered = rings.filter((r) => kept.includes(r)); // original order for determinism

    // 2. bridges on the full-resolution rings
    const plan = ordered.length > 1 ? attachRings(ordered, cache) : null;
    const feet = plan ? plan.feet : new Set();
    const bridges = plan ? plan.bridges : 0;

    // 3. thin to the budget (perimeter-weighted shares, shared detail thresholds)
    const trunk = plan ? plan.trunk : ordered[0];
    const budget = Math.max(ordered.reduce((n, r) => n + need(r), 0), maxPoints - bridges * BRIDGE_COST);
    const totalNow = ordered.reduce((n, r) => n + r.pts.length, 0);
    let removed = 0;
    let untangled = 0;
    if (totalNow > budget || (share && share.minAreaFor)) {
      removed = thinRecords(ordered, budget, minRing, feet, share && share.minAreaFor, trunk).removed;
      // thinning a convoluted coast can fold an inlet over itself — straighten that out
      for (const r of ordered) if (r.pts.length > 3) untangled += untangleRing(r.pts);
    } else {
      for (const r of ordered) r.threshold = 0;
    }

    // 4. assemble and validate
    let ring;
    let owner;
    if (plan) {
      ({ ring, owner } = walkBridged(plan.trunk, plan.attachments, half));
    } else {
      ring = ordered[0].pts.map((p) => [p[0], p[1]]);
      owner = ring.map(() => ordered[0]);
    }
    const offenders = new Set();
    const blame = (edgeIndex) => {
      // a corridor edge belongs to the deeper (child) ring
      const a = owner[edgeIndex];
      const b = owner[(edgeIndex + 1) % owner.length];
      return a === b ? a : (a.depth > b.depth ? a : b);
    };
    for (const [i, j] of crossingEdges(ring)) {
      const ra = blame(i);
      const rb = blame(j);
      let drop;
      if (ra === rb) drop = ra;
      else if (ra === trunk) drop = rb;
      else if (rb === trunk) drop = ra;
      else drop = ra.area <= rb.area ? ra : rb;
      if (drop !== trunk) offenders.add(drop);
    }
    // an island swallowed by the thinned mainland (unless it sits in one of the
    // mainland's lakes) / a hole pushed outside its own thinned part
    if (plan) {
      const trunkHoles = ordered.filter((r) => !r.positive && r.parent === trunk);
      for (const r of ordered) {
        if (r === trunk || offenders.has(r)) continue;
        const p = r.pts[0];
        if (r.positive && pointInRing(p, trunk.pts) && !trunkHoles.some((h) => pointInRing(p, h.pts))) offenders.add(r);
        if (!r.positive && !pointInRing(p, r.parent.pts)) offenders.add(r);
      }
    }
    if (offenders.size && attempt < 7) {
      for (const r of offenders) excluded.add(r.key); // a dropped outer takes its holes along (see filter above)
      continue;
    }
    const outers = ordered.filter((r) => r.positive).length;
    return {
      ring,
      parts: outers,
      holes: ordered.length - outers,
      bridges,
      dropped: base.recs.length - ordered.length + base.dropped,
      removed,
      original,
      rings: ordered.map((r) => ringInfo(r, trunk)),
      threshold: trunk.threshold || 0,
      untangled,
      crossings: offenders.size ? selfIntersections(ring) : 0,
    };
  }
  throw new Error('Shape could not be bridged');
}

/**
 * Build the `share` option that makes `prepareShape` of one shape follow
 * another prepared shape: the same detail threshold for the trunk and for
 * every island / hole that is the same ring in both (identical bounding box),
 * and the same choice of which islands to keep. Used by the animator so that
 * the coastline two shapes have in common keeps exactly the same vertices —
 * and therefore does not move at all during the morph.
 *
 * @param {object} other  prepared twin shape (its `rings` are consulted)
 * @param {object} [own]  this shape's own first pass (thresholds are never lowered)
 */
export function shareThinning(other, own) {
  if (!other || !other.rings) return undefined;
  const same = (a, b) => Math.abs(a.minX - b.minX) < 1e-9 && Math.abs(a.minY - b.minY) < 1e-9
    && Math.abs(a.maxX - b.maxX) < 1e-9 && Math.abs(a.maxY - b.maxY) < 1e-9;
  const twinOf = (info) => (info.trunk
    ? other.rings.find((r) => r.trunk)
    : other.rings.find((r) => !r.trunk && r.positive === info.positive && same(r.bbox, info.bbox)));
  return {
    minAreaFor(info) {
      const ownRing = own && own.rings ? own.rings.find((r) => r.key === info.key) : null;
      const twin = twinOf(info);
      return Math.max(ownRing ? ownRing.threshold : 0, twin ? twin.threshold : 0);
    },
    keepRing(info) {
      return !!twinOf(info) || !!(own && own.rings && own.rings.some((r) => r.key === info.key));
    },
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
