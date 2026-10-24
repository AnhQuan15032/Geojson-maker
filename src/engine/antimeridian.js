// Antimeridian repair for "stitched" geometry.
//
// world-atlas (the TopoJSON this app loads for countries and the coastline)
// is built with d3's geostitch: polygons that Natural Earth cuts at the
// ±180° meridian are sewn back together, so a single ring can run
// … 179.87°E → −180° … and the renderer is expected to clip it on a sphere.
// Leaflet draws in a flat world, so that one edge becomes a line across the
// entire map and the fill between two such edges becomes a horizontal band
// (Russia at 65–69°N, Wrangel Island at 71°N, Fiji, Antarctica).
//
// `unstitchAntimeridian()` undoes the stitch: each ring is unwrapped into a
// continuous longitude range (adding ±360° after every jump), rings that
// encircle a pole are closed through the pole, and every polygon is then cut
// into the 360°-wide windows it spans and shifted back into [−180, 180].
// Pure functions, GeoJSON coordinate arrays in, coordinate arrays out.

const EPS = 1e-9;
const POLE_LAT = 90;

function isWrap(prevLng, lng) {
  return Math.abs(lng - prevLng) > 180;
}

// An edge that runs along the pole itself (both ends at |lat| ≈ 90, e.g. the
// bottom of Antarctica) spans 360° by nature — Natural Earth stores it that
// way too — and must not be mistaken for a stitched crossing.
function onPole(p) {
  return Math.abs(p[1]) >= POLE_LAT - 1e-6;
}

const onMeridian = (p) => Math.abs(Math.abs(p[0]) - 180) < 1e-6;

/**
 * True when consecutive vertices jump across the antimeridian or lie beyond
 * ±180°.
 *
 * `strict` is for geometry of unknown origin (user imports): a ring then only
 * qualifies when it is unmistakably geostitched — every jump edge has one end
 * exactly on ±180° (the merged cut vertex geostitch leaves behind) and the
 * unwrapped ring still has area. Longitudes beyond ±180° are left alone in
 * that mode: Leaflet lets you draw on the neighbouring world copy, and a
 * hand-drawn shape across the strait must not be cut in two. A world-wide
 * rectangle (−180 … 180 in one edge) unwraps to nothing, so it is kept too.
 */
export function ringNeedsRepair(ring, strict = false) {
  if (!ring || ring.length < 2) return false;
  let jumps = 0;
  let stitched = true;
  for (let i = 0; i < ring.length; i++) {
    const lng = ring[i][0];
    if (!strict && (lng > 180 + EPS || lng < -180 - EPS)) return true;
    if (i > 0 && isWrap(ring[i - 1][0], lng) && !(onPole(ring[i - 1]) && onPole(ring[i]))) {
      if (!strict) return true;
      jumps++;
      if (!onMeridian(ring[i - 1]) && !onMeridian(ring[i])) stitched = false;
    }
  }
  if (!jumps || !stitched) return false;
  return Math.abs(ringArea(unwrapRing(ring).ring)) > 1e-9;
}

/** True for any Polygon / MultiPolygon / LineString / MultiLineString that needs repair. */
export function geometryNeedsRepair(geometry, strict = false) {
  if (!geometry || !geometry.coordinates) return false;
  const c = geometry.coordinates;
  const test = (ring) => ringNeedsRepair(ring, strict);
  switch (geometry.type) {
    case 'LineString':
      return test(c);
    case 'Polygon':
    case 'MultiLineString':
      return c.some(test);
    case 'MultiPolygon':
      return c.some((poly) => poly.some(test));
    default:
      return false;
  }
}

/**
 * Add ±360° after every wrap so the ring is continuous in longitude.
 * Returns { ring, net } — `net` is the longitude offset of the last vertex
 * relative to the first: 0 for an ordinary ring, ±360 for a ring that goes
 * all the way round a pole.
 */
export function unwrapRing(ring) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    if (i > 0 && !(onPole(ring[i - 1]) && onPole(ring[i]))) {
      const prev = ring[i - 1][0];
      if (lng - prev > 180) offset -= 360;
      else if (lng - prev < -180) offset += 360;
    }
    out.push([lng + offset, lat]);
  }
  return { ring: out, net: offset };
}

function stripClosing(ring) {
  const r = ring.slice();
  while (r.length > 1 && Math.abs(r[0][0] - r[r.length - 1][0]) < EPS && Math.abs(r[0][1] - r[r.length - 1][1]) < EPS) r.pop();
  return r;
}

function closeRing(ring) {
  if (!ring.length) return ring;
  const f = ring[0];
  const l = ring[ring.length - 1];
  if (Math.abs(f[0] - l[0]) > EPS || Math.abs(f[1] - l[1]) > EPS) return ring.concat([[f[0], f[1]]]);
  return ring;
}

/** Shoelace area in degrees² (sign = winding). */
export function ringArea(ring) {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function pointInRing(pt, ring) {
  const x = pt[0];
  const y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * An unwrapped ring whose ends differ by ±360° encircles a pole. Close it as a
 * flat polygon by running along the pole: … last → (endLng, lastLat) →
 * (endLng, ±90) → (firstLng, ±90) → first, where endLng = firstLng ± 360. The
 * pole is the one on the ring's side of the equator (Antarctica is the only
 * such ring in the datasets this app loads).
 */
export function closePolarRing(unwrapped) {
  const open = unwrapped.slice();
  const first = open[0];
  const endLng = unwrapped[unwrapped.length - 1][0];
  let last = open[open.length - 1];
  // the stitched closing vertex sits 360° away from the first one — drop it
  if (Math.abs(last[1] - first[1]) < EPS && Math.abs(Math.abs(last[0] - first[0]) - 360) < EPS) {
    open.pop();
    last = open[open.length - 1];
  }
  let meanLat = 0;
  for (const p of open) meanLat += p[1];
  meanLat /= open.length;
  const pole = meanLat < 0 ? -POLE_LAT : POLE_LAT;
  const tail = [];
  if (Math.abs(last[0] - endLng) > EPS) tail.push([endLng, last[1]]);
  tail.push([endLng, pole], [first[0], pole]);
  return closeRing(open.concat(tail));
}

/** geostitch leaves a degenerate ring hugging the pole (every vertex at |lat| ≈ 90). */
function isPolarCap(ring) {
  return ring.every((p) => Math.abs(p[1]) > 89.9);
}

/** Sutherland–Hodgman clip of a closed ring against minLng ≤ lng ≤ maxLng. */
export function clipRingToLngRange(ring, minLng, maxLng) {
  let pts = stripClosing(ring);
  const clipOnce = (input, inside, intersect) => {
    const out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(intersect(prev, cur));
      }
    }
    return out;
  };
  const cross = (a, b, x) => {
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + (b[1] - a[1]) * t];
  };
  pts = clipOnce(pts, (p) => p[0] >= minLng - EPS, (a, b) => cross(a, b, minLng));
  if (pts.length < 3) return null;
  pts = clipOnce(pts, (p) => p[0] <= maxLng + EPS, (a, b) => cross(a, b, maxLng));
  if (pts.length < 3) return null;
  // drop consecutive duplicates the clipping may have produced
  const clean = [];
  for (const p of pts) {
    const l = clean[clean.length - 1];
    if (!l || Math.abs(l[0] - p[0]) > EPS || Math.abs(l[1] - p[1]) > EPS) clean.push([p[0], p[1]]);
  }
  while (clean.length > 1 && Math.abs(clean[0][0] - clean[clean.length - 1][0]) < EPS && Math.abs(clean[0][1] - clean[clean.length - 1][1]) < EPS) clean.pop();
  if (clean.length < 3 || Math.abs(ringArea(clean)) < 1e-12) return null;
  return closeRing(clean);
}

function prepareRing(ring) {
  const { ring: unwrapped, net } = unwrapRing(ring);
  if (Math.abs(net) < EPS) return closeRing(unwrapped);
  return closePolarRing(unwrapped);
}

/** Shift a prepared hole by a multiple of 360° so it sits inside the prepared outer ring. */
function alignHole(hole, outer) {
  for (const shift of [0, 360, -360, 720, -720]) {
    const probe = [hole[0][0] + shift, hole[0][1]];
    if (pointInRing(probe, outer)) {
      return shift === 0 ? hole : hole.map(([lng, lat]) => [lng + shift, lat]);
    }
  }
  return hole;
}

/** Cut one prepared (continuous-longitude) outer ring + holes into 360° windows, shifted back into [−180, 180]. */
function windowPieces(outer, holes) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng] of outer) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const kMin = Math.floor((minLng + 180 + EPS) / 360);
  const kMax = Math.floor((maxLng + 180 - EPS) / 360);
  const pieces = [];
  for (let k = kMin; k <= kMax; k++) {
    const lo = -180 + 360 * k;
    const hi = 180 + 360 * k;
    const outerPiece = clipRingToLngRange(outer, lo, hi);
    if (!outerPiece) continue;
    const shift = (ring) => (k === 0 ? ring : ring.map(([lng, lat]) => [lng - 360 * k, lat]));
    const poly = [shift(outerPiece)];
    // a hole inside the shell stays inside it after both are cut by the same strip
    for (const hole of holes) {
      const hp = clipRingToLngRange(hole, lo, hi);
      if (hp) poly.push(shift(hp));
    }
    pieces.push(poly);
  }
  return pieces;
}

/**
 * Split one polygon (outer ring + holes) into the pieces that fit inside
 * [−180, 180]. Returns an array of polygon coordinate arrays.
 *
 * The rings are re-evaluated after unwrapping: geostitch stores Antarctica as
 * a degenerate cap ring at the pole with the coastline as its "hole", so the
 * largest ring becomes the shell, rings inside it stay holes and anything
 * else becomes a polygon of its own.
 */
export function splitPolygonAtAntimeridian(polygon, strict = false) {
  if (!polygon || !polygon.length || !polygon.some((r) => ringNeedsRepair(r, strict))) return [polygon];
  const rings = polygon
    .map(prepareRing)
    .filter((r) => r.length >= 4 && !isPolarCap(r) && Math.abs(ringArea(r)) > 1e-12);
  if (!rings.length) return [];
  rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const outer = rings[0];
  const holes = [];
  const loose = [];
  for (const ring of rings.slice(1)) {
    const aligned = alignHole(ring, outer);
    if (pointInRing(aligned[0], outer)) holes.push(aligned);
    else loose.push(ring);
  }
  const pieces = windowPieces(outer, holes);
  for (const ring of loose) pieces.push(...windowPieces(ring, []));
  return pieces;
}

/** Split a LineString wherever it jumps across the antimeridian. */
export function splitLineAtAntimeridian(line, strict = false) {
  if (!ringNeedsRepair(line, strict)) return [line];
  const parts = [];
  let cur = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    if (i > 0 && isWrap(line[i - 1][0], p[0])) {
      if (cur.length >= 2) parts.push(cur);
      cur = [];
    }
    const lng = ((p[0] + 180) % 360 + 360) % 360 - 180;
    cur.push([lng, p[1]]);
  }
  if (cur.length >= 2) parts.push(cur);
  return parts;
}

/**
 * Repair a GeoJSON geometry. Returns the very same object when nothing needs
 * fixing, otherwise a new Polygon / MultiPolygon (or MultiLineString) whose
 * coordinates all lie within [−180, 180] with no antimeridian-spanning edges.
 * `opts.strict` — only touch rings that are unmistakably geostitched (see
 * `ringNeedsRepair`); use it for geometry that did not come from world-atlas.
 */
export function unstitchAntimeridian(geometry, opts) {
  const strict = !!(opts && opts.strict);
  if (!geometryNeedsRepair(geometry, strict)) return geometry;
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const out = [];
    for (const poly of polys) out.push(...splitPolygonAtAntimeridian(poly, strict));
    if (out.length === 0) return geometry;
    return out.length === 1
      ? { type: 'Polygon', coordinates: out[0] }
      : { type: 'MultiPolygon', coordinates: out };
  }
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    const out = [];
    for (const line of lines) out.push(...splitLineAtAntimeridian(line, strict));
    if (out.length === 0) return geometry;
    return out.length === 1
      ? { type: 'LineString', coordinates: out[0] }
      : { type: 'MultiLineString', coordinates: out };
  }
  return geometry;
}

/**
 * The inverse of the split, for one shape brought back together on a canvas:
 * polygons that touch along `meridian` (the straight cut edges the clipping
 * left behind, matching latitude for latitude) are sewn into one ring again,
 * holes pooled. Takes polygon coordinate arrays ([outer, …holes], rings open
 * or closed) whose longitudes have already been shifted so that both sides of
 * the cut sit next to each other (the far-west pieces moved by +360°), and
 * returns the same kind of arrays with closed rings. Pieces that share no cut
 * edge pass through untouched.
 */
export function rejoinAtMeridian(polygons, meridian = 180, tol = 1e-7) {
  const onM = (p) => Math.abs(p[0] - meridian) < tol;
  const same = (a, b) => Math.abs(a[1] - b[1]) < tol;
  const polys = polygons
    .filter((poly) => poly && poly.length && poly[0] && poly[0].length >= 3)
    .map(([outer, ...holes]) => {
      let ring = stripClosing(outer);
      if (ringArea(ring) < 0) ring = ring.slice().reverse();
      return { outer: ring, holes: holes.map(stripClosing) };
    });
  // Start each ring off the meridian so no run of cut vertices wraps the array.
  const normalise = (ring) => {
    const k = ring.findIndex((p) => !onM(p));
    return k <= 0 ? ring : ring.slice(k).concat(ring.slice(0, k));
  };
  // Maximal runs (≥ 2 vertices) lying on the meridian: [first index, last index].
  const runsOf = (ring) => {
    const runs = [];
    for (let i = 0; i < ring.length; i++) {
      if (!onM(ring[i])) continue;
      let j = i;
      while (j + 1 < ring.length && onM(ring[j + 1])) j++;
      if (j > i) runs.push([i, j]);
      i = j;
    }
    return runs;
  };
  for (let guard = 0; guard < polys.length * 2; guard++) {
    let merged = false;
    for (let a = 0; a < polys.length && !merged; a++) {
      const A = normalise(polys[a].outer);
      if (A.every(onM)) continue;
      const runsA = runsOf(A);
      for (let b = 0; b < polys.length && !merged; b++) {
        if (b === a) continue;
        const B = normalise(polys[b].outer);
        if (B.every(onM)) continue;
        const runsB = runsOf(B);
        for (const [i, j] of runsA) {
          const hit = runsB.find(([k, l]) => same(B[k], A[j]) && same(B[l], A[i]));
          if (!hit) continue;
          const [k, l] = hit;
          // B's coast from just after P′ (index l) round to just before Q′ (index k)
          const detour = [];
          for (let m = (l + 1) % B.length; m !== k; m = (m + 1) % B.length) detour.push(B[m]);
          const ring = A.slice(0, i + 1).concat(detour, A.slice(j));
          polys[a] = { outer: ring, holes: polys[a].holes.concat(polys[b].holes) };
          polys.splice(b, 1);
          merged = true;
          break;
        }
      }
    }
    if (!merged) break;
  }
  return polys.map(({ outer, holes }) => [closeRing(outer), ...holes.map(closeRing)]);
}

/** Repair a Feature in place (geometry replaced only when needed). Returns the feature. */
export function unstitchFeature(feature, opts) {
  if (feature && feature.geometry) {
    const fixed = unstitchAntimeridian(feature.geometry, opts);
    if (fixed !== feature.geometry) feature.geometry = fixed;
  }
  return feature;
}
