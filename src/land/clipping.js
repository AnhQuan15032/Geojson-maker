/**
 * "Cut sea": intersect a drawn geometry with a land mask.
 *
 * The intersection is computed on a raster grid rather than with polygon
 * booleans. Coastlines are the worst possible input for a Greiner–Hormann /
 * Weiler–Atherton style clipper: thousands of vertices, self-touching rings,
 * shared edges between neighbouring land polygons and near-degenerate islands.
 * A grid regularises all of that, so the result is predictable:
 *
 *   1. rasterise the drawn shape           (scanline, even-odd)
 *   2. rasterise every land polygon nearby (scanline, even-odd, unioned)
 *   3. optionally rasterise lakes and subtract them
 *   4. AND the two masks
 *   5. trace the boundary of the resulting cell set (crack tracing)
 *   6. Douglas–Peucker simplify, then nest holes into their outer rings
 *
 * Crack tracing walks cell borders with the interior on the left, so outer
 * rings come out counter-clockwise and holes clockwise for free — exactly what
 * RFC 7946 §3.5 asks for, and what the canvas non-zero fill rule needs to keep
 * a hole a hole. An edge is only ever a boundary edge when the cell on its left
 * is land and the cell on its right is not, which is what stops the walk from
 * cutting straight across a shape; and where two regions meet at a single
 * corner both a left and a right turn are legal, so straight-then-left is
 * preferred, keeping them two rings instead of one that pinches through itself.
 *
 * Pure maths, no DOM: everything here is unit-tested in tests/land.test.mjs.
 */

import {
  bboxOfGeometry, ringSignedArea, geometryArea, EARTH_CIRCUMFERENCE,
} from '../core/geo.js';

/**
 * Samples along the longest side of the grid, so the cell size on the ground
 * depends on how big a shape you are cutting: a bay gets a fine shore, a
 * whole continent cannot without an absurd amount of memory.
 */
export const PRECISION = {
  fast: { cells: 420, label: 'Fast' },
  balanced: { cells: 900, label: 'Balanced' },
  high: { cells: 1600, label: 'High' },
};

const METERS_PER_DEGREE = EARTH_CIRCUMFERENCE / 360;   // ≈ 111.32 km per degree
const DIR_INDEX = { '1,0': 0, '0,1': 1, '-1,0': 2, '0,-1': 3 };

/* ------------------------------------------------------------------ grids */

/** Expand a bbox by a fraction of its span (plus a floor) on every side. */
export function padBBox(bbox, fraction = 0.02, floorDegrees = 1e-4) {
  const spanLng = Math.max(bbox.maxLng - bbox.minLng, 0);
  const spanLat = Math.max(bbox.maxLat - bbox.minLat, 0);
  const padLng = Math.max(spanLng * fraction, floorDegrees);
  const padLat = Math.max(spanLat * fraction, floorDegrees);
  return {
    minLng: bbox.minLng - padLng,
    maxLng: bbox.maxLng + padLng,
    minLat: Math.max(-90, bbox.minLat - padLat),
    maxLat: Math.min(90, bbox.maxLat + padLat),
  };
}

export function rectFromBBox(bbox) {
  return { minX: bbox.minLng, maxX: bbox.maxLng, minY: bbox.minLat, maxY: bbox.maxLat };
}

export function rectsIntersect(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function rectContainsPoint(r, x, y) {
  return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
}

/**
 * Build a sampling grid over `rect`. Cells are square on the ground (longitude
 * steps are scaled by cos(latitude)), capped so the biggest axis has about
 * `maxCells` samples.
 */
export function makeGrid(rect, maxCells = 900) {
  const spanLng = Math.max(rect.maxX - rect.minX, 1e-9);
  const spanLat = Math.max(rect.maxY - rect.minY, 1e-9);
  const lat0 = (rect.minY + rect.maxY) / 2;
  const kx = Math.max(1e-6, Math.cos(lat0 * Math.PI / 180));

  const cellLat = Math.max(Math.max(spanLng * kx, spanLat) / Math.max(8, maxCells), 1e-9);
  const cellLng = cellLat / kx;

  const nx = Math.max(2, Math.ceil(spanLng / cellLng) + 1);
  const ny = Math.max(2, Math.ceil(spanLat / cellLat) + 1);

  return {
    minX: rect.minX, minY: rect.minY,
    cellLng, cellLat, nx, ny,
    W: nx - 1, H: ny - 1,
    lat0, kx,
    cellMeters: cellLat * METERS_PER_DEGREE,
    lngAt: (i) => rect.minX + i * cellLng,
    latAt: (j) => rect.minY + j * cellLat,
  };
}

/* ------------------------------------------------------- rasterisation */

/**
 * Scanline fill `rings` (a flat list of [lng,lat] rings; even-odd across all of
 * them) into `mask`, sampled at the grid's lattice points.
 */
export function fillRings(rings, grid, mask) {
  const { nx, ny, minX, minY, cellLng, cellLat } = grid;

  // Collect non-horizontal edges as flat arrays (no per-edge objects).
  const ex0 = [], ey0 = [], ex1 = [], ey1 = [];
  for (const ring of rings) {
    if (!ring || ring.length < 2) continue;
    for (let k = 0; k + 1 < ring.length; k++) {
      const x0 = ring[k][0], y0 = ring[k][1];
      const x1 = ring[k + 1][0], y1 = ring[k + 1][1];
      if (y0 === y1) continue;
      ex0.push(x0); ey0.push(y0); ex1.push(x1); ey1.push(y1);
    }
  }
  const edgeCount = ex0.length;
  if (!edgeCount) return mask;

  // Bucket edges by the lattice rows they can cross.
  const buckets = new Array(ny);
  for (let e = 0; e < edgeCount; e++) {
    const lo = Math.min(ey0[e], ey1[e]);
    const hi = Math.max(ey0[e], ey1[e]);
    let j0 = Math.floor((lo - minY) / cellLat);
    let j1 = Math.ceil((hi - minY) / cellLat);
    if (j0 < 0) j0 = 0;
    if (j1 > ny - 1) j1 = ny - 1;
    for (let j = j0; j <= j1; j++) {
      let bucket = buckets[j];
      if (!bucket) bucket = buckets[j] = [];
      bucket.push(e);
    }
  }

  const xs = [];
  for (let j = 0; j < ny; j++) {
    const bucket = buckets[j];
    if (!bucket) continue;
    const y = minY + j * cellLat;
    xs.length = 0;
    for (let b = 0; b < bucket.length; b++) {
      const e = bucket[b];
      const y0 = ey0[e], y1 = ey1[e];
      const lo = y0 < y1 ? y0 : y1;
      const hi = y0 < y1 ? y1 : y0;
      // Half-open so a vertex shared by two edges is counted exactly once.
      if (y < lo || y >= hi) continue;
      xs.push(ex0[e] + ((y - y0) / (y1 - y0)) * (ex1[e] - ex0[e]));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);

    const row = j * nx;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let i0 = Math.ceil((xs[k] - minX) / cellLng - 1e-9);
      let i1 = Math.ceil((xs[k + 1] - minX) / cellLng - 1e-9) - 1;
      if (i0 < 0) i0 = 0;
      if (i1 > nx - 1) i1 = nx - 1;
      for (let i = i0; i <= i1; i++) mask[row + i] = 1;
    }
  }
  return mask;
}

/* --------------------------------------------------------- crack tracing */

function edgeId(grid, fromI, fromJ, dx, dy) {
  return ((fromJ * grid.nx + fromI) * 4) + DIR_INDEX[`${dx},${dy}`];
}

/**
 * Trace the outline of the set of 1-cells. Returns closed loops of lattice
 * coordinates, interior on the left (outer rings CCW, holes CW).
 */
export function traceLoops(mask, grid) {
  const { nx, W, H } = grid;
  const cellAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : mask[j * nx + i]);

  const out = new Map();   // vertex key -> candidate directed edges
  const addEdge = (fi, fj, dx, dy) => {
    const key = fj * nx + fi;
    let list = out.get(key);
    if (!list) { list = []; out.set(key, list); }
    list.push({ fi, fj, ti: fi + dx, tj: fj + dy, dx, dy, id: edgeId(grid, fi, fj, dx, dy) });
  };

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!cellAt(i, j)) continue;
      if (!cellAt(i, j - 1)) addEdge(i, j, 1, 0);
      if (!cellAt(i + 1, j)) addEdge(i + 1, j, 0, 1);
      if (!cellAt(i, j + 1)) addEdge(i + 1, j + 1, -1, 0);
      if (!cellAt(i - 1, j)) addEdge(i, j + 1, 0, -1);
    }
  }

  const used = new Set();
  const loops = [];
  const maxSteps = 4 * (W + 1) * (H + 1) + 16;

  // Carry on straight, else hug the cell we came from (a left turn). That order
  // is what keeps two regions touching only at a corner as two separate loops
  // instead of one ring that pinches through itself.
  const turnOrder = (dx, dy) => [[dx, dy], [-dy, dx], [dy, -dx]];

  for (const candidates of out.values()) {
    for (const start of candidates) {
      if (used.has(start.id)) continue;
      const loop = [];
      let current = start;
      let steps = 0;

      while (current && steps++ < maxSteps) {
        if (used.has(current.id)) break;
        used.add(current.id);
        loop.push([current.fi, current.fj]);

        const next = out.get(current.tj * nx + current.ti);
        if (!next) break;
        let pick = null;
        for (const [dx, dy] of turnOrder(current.dx, current.dy)) {
          pick = next.find((c) => !used.has(c.id) && c.dx === dx && c.dy === dy);
          if (pick) break;
        }
        if (!pick) pick = next.find((c) => !used.has(c.id)) || null;
        current = pick;
      }

      if (loop.length >= 4) {
        loop.push([loop[0][0], loop[0][1]]);   // close
        loops.push(loop);
      }
    }
  }
  return loops;
}

/* ---------------------------------------------------------- simplification */

/** Douglas–Peucker on a closed ring, in a locally scaled (square) space. */
export function simplifyRing(ring, tolerance, kx = 1) {
  const n = ring.length;
  if (n < 4 || tolerance <= 0) return ring.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];

  while (stack.length) {
    const [a, b] = stack.pop();
    if (b <= a + 1) continue;
    const ax = ring[a][0] * kx, ay = ring[a][1];
    const bx = ring[b][0] * kx, by = ring[b][1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    const constant = bx * ay - by * ax;

    let maxDist = -1;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const px = ring[i][0] * kx, py = ring[i][1];
      const d = len === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + constant) / len;
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

function closeRing(ring) {
  if (!ring.length) return ring;
  const a = ring[0], b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
  return ring;
}

function pointInRingLngLat(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Nest traced loops into [outer, ...holes] polygons. */
export function nestRings(items) {
  const outers = items.filter((r) => !r.hole).sort((a, b) => b.areaAbs - a.areaAbs);
  const holes = items.filter((r) => r.hole).sort((a, b) => b.areaAbs - a.areaAbs);

  for (const hole of holes) {
    const probe = hole.positions[0];
    let best = null;
    for (const outer of outers) {
      if (outer.areaAbs <= hole.areaAbs) continue;
      if (!pointInRingLngLat(probe[0], probe[1], outer.positions)) continue;
      if (!best || outer.areaAbs < best.areaAbs) best = outer;
    }
    if (best) {
      best.holes.push(hole.positions);
      hole.parent = best;
    }
    // A hole with no parent is a tracing artefact at the grid edge: dropped.
  }

  return outers
    .map((outer) => [outer.positions, ...outer.holes])
    .filter((rings) => rings[0].length >= 4);
}

/* ------------------------------------------------------------ land access */

/** Flat list of every ring in a geometry (holes included). */
export function ringsOfGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates || [];
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flat();
  return [];
}

export function linesOfGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates || [];
  return [];
}

/** Uniform grid index over land features, plus a list of the oversized ones. */
export function buildIndex(features, cellDeg = 5) {
  const index = { cellDeg, buckets: new Map(), big: [], features };
  features.forEach((feature, id) => {
    const b = feature.bbox;
    const i0 = Math.floor(b.minLng / cellDeg), i1 = Math.floor(b.maxLng / cellDeg);
    const j0 = Math.floor(b.minLat / cellDeg), j1 = Math.floor(b.maxLat / cellDeg);
    const cells = (i1 - i0 + 1) * (j1 - j0 + 1);
    if (cells > 400) { index.big.push(id); return; }
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const key = `${i}:${j}`;
        let list = index.buckets.get(key);
        if (!list) { list = []; index.buckets.set(key, list); }
        list.push(id);
      }
    }
  });
  return index;
}

export function queryIndex(index, rect) {
  if (!index) return [];
  const { cellDeg, buckets, big, features } = index;
  const found = new Set(big);
  const i0 = Math.floor(rect.minX / cellDeg), i1 = Math.floor(rect.maxX / cellDeg);
  const j0 = Math.floor(rect.minY / cellDeg), j1 = Math.floor(rect.maxY / cellDeg);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const list = buckets.get(`${i}:${j}`);
      if (list) for (const id of list) found.add(id);
    }
  }
  const out = [];
  for (const id of found) {
    const feature = features[id];
    if (feature && rectsIntersect(feature.rect, rect)) out.push(feature);
  }
  return out;
}

/** Even-odd point test against the whole land mask. */
export function isLandPoint(land, lng, lat) {
  if (!land || !land.features || !land.features.length) return false;
  const point = { minX: lng, maxX: lng, minY: lat, maxY: lat };
  for (const feature of queryIndex(land.index, point)) {
    if (!rectContainsPoint(feature.rect, lng, lat)) continue;
    let inside = false;
    for (const ring of feature.rings) {
      if (pointInRingLngLat(lng, lat, ring)) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

/** Intersection parameter t along a→b, or null when the two segments miss. */
function segmentCrossT(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-18) return null;          // parallel or degenerate
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

function segmentRect(a, b) {
  return {
    minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
  };
}

/**
 * Which parts of the segment a→b lie on land, as [t0, t1] intervals of the
 * segment. Every coastline crossing is found exactly — so a line that starts
 * and ends at sea but runs over an island still keeps its middle — then
 * inside/outside alternates between crossings. Crossings that land on a shared
 * vertex arrive in pairs and cancel, which is what a grazing touch should do.
 */
export function onLandIntervals(a, b, land) {
  const inside = isLandPoint(land, a[0], a[1]);
  if (!land || !land.features || !land.features.length) return [];

  const rect = segmentRect(a, b);
  const crossings = [];
  let tested = 0;
  for (const feature of queryIndex(land.index, rect)) {
    if (!rectsIntersect(feature.rect, rect)) continue;
    for (const ring of feature.rings) {
      for (let i = 0; i + 1 < ring.length; i++) {
        if (++tested > MAX_EDGE_TESTS) return inside ? [[0, 1]] : [];
        const t = segmentCrossT(a, b, ring[i], ring[i + 1]);
        if (t !== null && t > 0 && t < 1) crossings.push(t);
      }
    }
  }
  if (!crossings.length) return inside ? [[0, 1]] : [];

  crossings.sort((x, y) => x - y);

  const intervals = [];
  let state = inside;
  let start = 0;
  let i = 0;
  while (i < crossings.length) {
    // Group crossings that are effectively at the same place.
    let j = i + 1;
    while (j < crossings.length && crossings[j] - crossings[j - 1] < 1e-9) j++;
    const t = crossings[(i + j - 1) >> 1];
    if ((j - i) % 2 === 1) {                    // an odd number really crosses
      if (state) intervals.push([start, t]);
      else start = t;
      state = !state;
    }
    i = j;
  }
  if (state) intervals.push([start, 1]);
  return intervals.filter(([t0, t1]) => t1 - t0 > 1e-12);
}

/** Safety valve: never test more coastline edges than this for one segment. */
const MAX_EDGE_TESTS = 4e6;

function along(a, b, t) {
  return t <= 0 ? [a[0], a[1]] : t >= 1 ? [b[0], b[1]] : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Keep only the stretches of a polyline that are on land, returning one array
 * of positions per stretch. Coast crossings are placed exactly on the shore.
 */
export function clipPolylineToLand(positions, land) {
  const runs = [];
  if (!Array.isArray(positions) || positions.length < 2) return runs;

  let run = null;
  const push = (point) => {
    const last = run && run.length ? run[run.length - 1] : null;
    if (last && last[0] === point[0] && last[1] === point[1]) return;
    run.push(point);
  };

  for (let i = 0; i + 1 < positions.length; i++) {
    const a = positions[i];
    const b = positions[i + 1];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;

    const intervals = onLandIntervals(a, b, land);
    if (!intervals.length) { run = null; continue; }

    for (const [t0, t1] of intervals) {
      if (!(t0 === 0 && run && run.length)) {
        run = [along(a, b, t0)];
        runs.push(run);
      }
      push(along(a, b, t1));
      if (t1 < 1) run = null;
    }
  }

  return runs.filter((r) => r.length >= 2);
}

/* ------------------------------------------------------------------- clip */

/**
 * Intersect a geometry with the land mask.
 *
 * @param {object} geometry  GeoJSON geometry
 * @param {object} land      { features, index, lakes?, lakeIndex? } from landmask.js
 * @param {object} [options] { precision:'balanced', cutLakes:false, maxPositions:20000 }
 * @returns {{geometry:object|null, empty:boolean, stats:object}}
 */
export function clipGeometryToLand(geometry, land, options = {}) {
  const precision = PRECISION[options.precision] ? options.precision : 'balanced';
  const maxCells = PRECISION[precision].cells;
  const cutLakes = !!options.cutLakes && !!(land.lakes && land.lakes.length);
  const maxPositions = options.maxPositions || 20000;

  const stats = {
    precision, maxCells, cutLakes,
    cellMeters: 0, grid: [0, 0], candidates: 0,
    loops: 0, rings: 0, holes: 0, positions: 0,
    areaBefore: 0, areaAfter: 0, kept: 0, empty: true, kind: geometry ? geometry.type : null,
  };

  if (!geometry || !land || !land.features || !land.features.length) {
    return { geometry: null, empty: true, stats, error: land && land.features ? null : 'no-land-data' };
  }

  const type = geometry.type;

  /* ---- points ------------------------------------------------------- */
  if (type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    const onLand = isLandPoint(land, lng, lat);
    stats.empty = !onLand;
    stats.kind = 'Point';
    return { geometry: onLand ? { type: 'Point', coordinates: [lng, lat] } : null, empty: !onLand, stats };
  }
  if (type === 'MultiPoint') {
    const kept = (geometry.coordinates || []).filter((p) => isLandPoint(land, p[0], p[1]));
    stats.empty = kept.length === 0;
    if (!kept.length) return { geometry: null, empty: true, stats };
    return {
      geometry: kept.length === 1 ? { type: 'Point', coordinates: kept[0] } : { type: 'MultiPoint', coordinates: kept },
      empty: false, stats,
    };
  }

  /* ---- lines -------------------------------------------------------- */
  if (type === 'LineString' || type === 'MultiLineString') {
    const runs = [];
    for (const line of linesOfGeometry(geometry)) {
      for (const run of clipPolylineToLand(line, land)) runs.push(run);
    }
    stats.empty = runs.length === 0;
    stats.loops = runs.length;
    stats.positions = runs.reduce((s, r) => s + r.length, 0);
    if (!runs.length) return { geometry: null, empty: true, stats };
    return {
      geometry: runs.length === 1
        ? { type: 'LineString', coordinates: runs[0] }
        : { type: 'MultiLineString', coordinates: runs },
      empty: false, stats,
    };
  }

  /* ---- areas -------------------------------------------------------- */
  if (type !== 'Polygon' && type !== 'MultiPolygon') {
    return { geometry: null, empty: true, stats, error: 'unsupported' };
  }

  const bbox = bboxOfGeometry(geometry);
  if (!bbox) return { geometry: null, empty: true, stats, error: 'empty-geometry' };

  const rect = rectFromBBox(padBBox(bbox, 0.02, 1e-4));
  const grid = makeGrid(rect, maxCells);
  stats.cellMeters = grid.cellMeters;
  stats.grid = [grid.W, grid.H];

  const size = grid.nx * grid.ny;
  const drawnMask = new Uint8Array(size);
  fillRings(ringsOfGeometry(geometry), grid, drawnMask);

  const landCandidates = queryIndex(land.index, rect);
  stats.candidates = landCandidates.length;
  const landMask = new Uint8Array(size);
  for (const feature of landCandidates) fillRings(feature.rings, grid, landMask);

  let lakeMask = null;
  if (cutLakes) {
    lakeMask = new Uint8Array(size);
    for (const feature of queryIndex(land.lakeIndex, rect)) fillRings(feature.rings, grid, lakeMask);
  }

  const mask = new Uint8Array(size);
  let filled = 0;
  for (let i = 0; i < size; i++) {
    const value = drawnMask[i] & landMask[i] & (lakeMask ? 1 - lakeMask[i] : 1);
    mask[i] = value;
    if (value) filled++;
  }
  if (!filled) return { geometry: null, empty: true, stats };

  const loops = traceLoops(mask, grid);
  stats.loops = loops.length;
  if (!loops.length) return { geometry: null, empty: true, stats };

  // Lattice coordinates → lng/lat, with a simplification tolerance tied to the
  // cell size so the staircase disappears without eating real coastline.
  const toleranceLat = grid.cellLat * 0.9;
  const rings = [];
  for (const loop of loops) {
    const positions = loop.map(([i, j]) => [grid.lngAt(i), grid.latAt(j)]);
    const area = ringSignedArea(positions);
    if (Math.abs(area) < 1e-14) continue;
    rings.push({ raw: positions, area, areaAbs: Math.abs(area), hole: area < 0, holes: [] });
  }
  if (!rings.length) return { geometry: null, empty: true, stats };

  let tolerance = toleranceLat;
  let simplified = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    simplified = rings.map((ring) => {
      const positions = closeRing(simplifyRing(ring.raw, tolerance, grid.kx));
      const area = ringSignedArea(positions);
      return {
        positions, area, areaAbs: Math.abs(area),
        hole: area < 0, holes: [], raw: ring.raw,
      };
    }).filter((ring) => ring.positions.length >= 4 && ring.areaAbs > 0);
    const total = simplified.reduce((s, r) => s + r.positions.length, 0);
    if (total <= maxPositions) break;
    tolerance *= 1.8;    // too many vertices: coarsen and try again
  }
  stats.positions = simplified.reduce((s, r) => s + r.positions.length, 0);
  stats.tolerance = tolerance;

  const polygons = nestRings(simplified);
  if (!polygons.length) return { geometry: null, empty: true, stats };

  stats.holes = polygons.reduce((s, p) => s + p.length - 1, 0);
  stats.rings = polygons.length;

  const out = polygons.length === 1
    ? { type: 'Polygon', coordinates: roundRings(polygons[0]) }
    : { type: 'MultiPolygon', coordinates: polygons.map(roundRings) };

  stats.areaBefore = geometryArea(geometry);
  stats.areaAfter = geometryArea(out);
  stats.kept = stats.areaBefore > 0 ? stats.areaAfter / stats.areaBefore : 0;
  stats.empty = false;
  return { geometry: out, empty: false, stats };
}

function roundRings(rings) {
  return rings.map((ring) => ring.map((p) => [
    Math.round(p[0] * 1e7) / 1e7,
    Math.round(p[1] * 1e7) / 1e7,
  ]));
}

