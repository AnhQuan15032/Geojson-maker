/**
 * Tests for the "Cut sea" clipping engine: rasterisation, boundary tracing,
 * simplification, ring nesting, line/point clipping and the land index.
 *
 * Run with:  node tests/land.test.mjs
 */

import assert from 'node:assert/strict';

import {
  makeGrid, fillRings, traceLoops, simplifyRing, nestRings, buildIndex, queryIndex,
  clipGeometryToLand, isLandPoint, clipPolylineToLand, ringsOfGeometry,
  padBBox, rectFromBBox, rectsIntersect, PRECISION,
} from '../src/land/clipping.js';
import { buildLand, collectPolygons, prepareFeatures, LandService } from '../src/land/landmask.js';
import { ringSignedArea, bboxOfGeometry, isCounterClockwise } from '../src/core/geo.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') return result.then(() => { passed++; }, (err) => { failures.push({ name, err }); });
    passed++;
  } catch (err) { failures.push({ name, err }); }
  return null;
}

/* ------------------------------------------------------------- fixtures */

/** A closed rectangular ring. */
const ring = (minLng, minLat, maxLng, maxLat) => [
  [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
];
/** A land polygon: a list of rings (outer first, then holes). */
const landPolygon = (...rings) => rings;
const landBox = (minLng, minLat, maxLng, maxLat) => [ring(minLng, minLat, maxLng, maxLat)];

/** GeoJSON geometries. */
const polygon = (...rings) => ({ type: 'Polygon', coordinates: rings });
const multiPolygon = (...polys) => ({ type: 'MultiPolygon', coordinates: polys });

/** Build a land object from raw polygons (and optional lakes). */
const landFrom = (polygons, lakes = []) => buildLand(prepareFeatures(polygons), prepareFeatures(lakes));

// The left half of the world is land; everything east of 10°E is sea.
const HALF_WORLD = landFrom([landBox(-180, -85, 10, 85)]);
// One square island.
const ISLAND = landFrom([landBox(40, 40, 50, 50)]);
// Two islands.
const ARCHIPELAGO = landFrom([landBox(0, 0, 5, 5), landBox(20, 20, 30, 30)]);
// Land with a lake inside it, expressed as a hole in the land polygon.
const LAND_WITH_HOLE = landFrom([landPolygon(ring(0, 0, 30, 30), ring(10, 10, 20, 20))]);

const degreesToM2 = (deg2, lat = 0) => deg2 * (111319.49 ** 2) * Math.cos(lat * Math.PI / 180);

/* ------------------------------------------------------------ primitives */

const pending = [];

pending.push(test('padBBox grows every side and stays inside the world', () => {
  const padded = padBBox({ minLng: -10, minLat: -10, maxLng: 10, maxLat: 10 }, 0.1, 0.01);
  assert.ok(Math.abs(padded.minLng + 12) < 1e-9, `minLng ${padded.minLng}`);
  assert.ok(Math.abs(padded.maxLng - 12) < 1e-9);
  assert.ok(padded.minLat < -10 && padded.maxLat > 10);
  const polar = padBBox({ minLng: 0, minLat: -90, maxLng: 1, maxLat: 90 }, 0.5, 1);
  assert.ok(polar.minLat >= -90 && polar.maxLat <= 90, 'clamped to the poles');
}));

pending.push(test('rectsIntersect and rectFromBBox', () => {
  const a = rectFromBBox({ minLng: 0, minLat: 0, maxLng: 10, maxLat: 10 });
  const b = rectFromBBox({ minLng: 5, minLat: 5, maxLng: 15, maxLat: 15 });
  const c = rectFromBBox({ minLng: 20, minLat: 20, maxLng: 30, maxLat: 30 });
  assert.equal(rectsIntersect(a, b), true);
  assert.equal(rectsIntersect(a, c), false);
  assert.equal(rectsIntersect(c, a), false);
}));

pending.push(test('makeGrid builds a lattice with square ground cells', () => {
  const grid = makeGrid(rectFromBBox({ minLng: 0, minLat: 0, maxLng: 10, maxLat: 10 }), 100);
  assert.equal(grid.nx, grid.W + 1);
  assert.equal(grid.ny, grid.H + 1);
  assert.ok(grid.W >= 99 && grid.W <= 102, `W=${grid.W}`);
  assert.ok(Math.abs(grid.lngAt(0)) < 1e-12);
  assert.ok(grid.lngAt(grid.nx - 1) >= 10);
  assert.ok(grid.kx > 0, 'x is scaled so cells are square on the ground');
  const widthM = grid.cellLng * 111319.49 * grid.kx;
  const heightM = grid.cellLat * 111319.49;
  assert.ok(Math.abs(widthM - heightM) / heightM < 1e-6, `${widthM} vs ${heightM}`);
}));

pending.push(test('grid resolution follows the precision setting', () => {
  const rect = rectFromBBox({ minLng: 0, minLat: 0, maxLng: 10, maxLat: 10 });
  const fast = makeGrid(rect, PRECISION.fast.cells);
  const high = makeGrid(rect, PRECISION.high.cells);
  assert.ok(high.cellMeters < fast.cellMeters);
  assert.ok(high.W > fast.W);
}));

const sample = (grid, mask, lng, lat) => {
  const i = Math.round((lng - grid.minX) / grid.cellLng);
  const j = Math.round((lat - grid.minY) / grid.cellLat);
  return mask[j * grid.nx + i];
};

pending.push(test('fillRings paints the inside of a square and leaves the outside alone', () => {
  const grid = makeGrid(rectFromBBox({ minLng: 0, minLat: 0, maxLng: 10, maxLat: 10 }), 20);
  const mask = new Uint8Array(grid.nx * grid.ny);
  fillRings([ring(2, 2, 8, 8)], grid, mask);
  assert.equal(sample(grid, mask, 5, 5), 1, 'centre should be filled');
  assert.equal(sample(grid, mask, 1, 1), 0, 'outside should be empty');
  assert.equal(sample(grid, mask, 9, 9), 0, 'outside should be empty');
  let filled = 0;
  for (let i = 0; i < mask.length; i++) filled += mask[i];
  const expected = (6 / 10) ** 2 * mask.length;
  assert.ok(Math.abs(filled - expected) / expected < 0.12, `filled ${filled}, expected ~${expected}`);
}));

pending.push(test('fillRings honours holes with even-odd parity', () => {
  const grid = makeGrid(rectFromBBox({ minLng: 0, minLat: 0, maxLng: 10, maxLat: 10 }), 40);
  const mask = new Uint8Array(grid.nx * grid.ny);
  fillRings([ring(1, 1, 9, 9), ring(4, 4, 6, 6)], grid, mask);
  assert.equal(sample(grid, mask, 2, 2), 1, 'land between the hole and the edge');
  assert.equal(sample(grid, mask, 5, 5), 0, 'the hole must be empty');
}));

const lattice = (n) => ({ nx: n, ny: n, W: n - 1, H: n - 1, minX: 0, minY: 0, cellLng: 1, cellLat: 1, kx: 1, lngAt: (i) => i, latAt: (j) => j });

pending.push(test('traceLoops walks a block of cells into one closed loop', () => {
  const grid = lattice(5);
  const mask = new Uint8Array(25);
  for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) mask[j * 5 + i] = 1;
  const loops = traceLoops(mask, grid);
  assert.equal(loops.length, 1);
  const loop = loops[0];
  assert.deepEqual(loop[0], loop[loop.length - 1], 'loop must be closed');
  // The raw walk follows cell edges, so it includes collinear waypoints…
  assert.equal(loop.length, 9, `got ${loop.length}`);
  assert.ok(ringSignedArea(loop) > 0, 'interior on the left ⇒ counter-clockwise');
  // …which simplification removes, leaving the four corners.
  const simplified = simplifyRing(loop, 0.2);
  assert.equal(simplified.length, 5, `simplified to ${simplified.length}`);
  assert.equal(Math.abs(ringSignedArea(simplified)), 4, 'a 2×2 block covers four cells');
}));

pending.push(test('traceLoops keeps corner-touching regions as separate loops', () => {
  const grid = lattice(6);
  const mask = new Uint8Array(36);
  mask[1 * 6 + 1] = 1;   // cell (1,1)
  mask[2 * 6 + 2] = 1;   // cell (2,2) — touches only at a corner
  const loops = traceLoops(mask, grid);
  assert.equal(loops.length, 2, `expected two separate loops, got ${loops.length}`);
  for (const loop of loops) {
    assert.deepEqual(loop[0], loop[loop.length - 1]);
    assert.equal(loop.length, 5, 'one cell has four corners');
  }
}));

pending.push(test('traceLoops returns an outer loop CCW and a hole loop CW', () => {
  const grid = lattice(9);
  const mask = new Uint8Array(81);
  for (let j = 1; j <= 6; j++) for (let i = 1; i <= 6; i++) mask[j * 9 + i] = 1;
  for (let j = 3; j <= 4; j++) for (let i = 3; i <= 4; i++) mask[j * 9 + i] = 0;
  const loops = traceLoops(mask, grid);
  assert.equal(loops.length, 2);
  const areas = loops.map((l) => ringSignedArea(l));
  assert.equal(areas.filter((a) => a > 0).length, 1, 'one counter-clockwise outer ring');
  assert.equal(areas.filter((a) => a < 0).length, 1, 'one clockwise hole');
  assert.ok(Math.abs(Math.abs(areas[1]) - 4) < 1e-9, 'the hole covers four cells');
}));

pending.push(test('traceLoops handles an empty mask', () => {
  assert.deepEqual(traceLoops(new Uint8Array(25), lattice(5)), []);
}));

pending.push(test('simplifyRing collapses a staircase but keeps the corners', () => {
  const staircase = [];
  for (let i = 0; i <= 20; i++) staircase.push([i, i % 2 === 0 ? 0 : 0.05]);
  staircase.push([20, 10], [0, 10], [0, 0]);
  const simplified = simplifyRing(staircase, 0.2, 1);
  assert.ok(simplified.length < staircase.length / 2, `${simplified.length} vs ${staircase.length}`);
  assert.deepEqual(simplified[0], staircase[0]);
  assert.deepEqual(simplified[simplified.length - 1], staircase[staircase.length - 1]);
  assert.deepEqual(simplifyRing([[0, 0], [1, 1], [0, 0]], 5), [[0, 0], [1, 1], [0, 0]], 'tiny rings pass through');
  assert.deepEqual(simplifyRing([[0, 0], [1, 0], [1, 1], [0, 0]], 0), [[0, 0], [1, 0], [1, 1], [0, 0]], 'zero tolerance keeps everything');
}));

pending.push(test('nestRings puts holes inside their outer ring', () => {
  const outer = { positions: ring(0, 0, 30, 30), areaAbs: 900, hole: false, holes: [] };
  const hole = { positions: ring(10, 10, 20, 20), areaAbs: 100, hole: true, holes: [] };
  const stray = { positions: ring(100, 100, 110, 110), areaAbs: 100, hole: true, holes: [] };
  const polys = nestRings([hole, outer, stray]);
  assert.equal(polys.length, 1);
  assert.equal(polys[0].length, 2, 'outer + its hole');
  assert.deepEqual(polys[0][1], hole.positions);
  assert.deepEqual(polys[0][0], outer.positions);
}));

/* ------------------------------------------------------------ land index */

pending.push(test('prepareFeatures flattens rings and records bounds', () => {
  const features = prepareFeatures([landBox(0, 0, 10, 10), landBox(20, 20, 30, 30)]);
  assert.equal(features.length, 2);
  assert.deepEqual(features[0].bbox, { minLng: 0, minLat: 0, maxLng: 10, maxLat: 10 });
  assert.equal(features[0].rings[0].length, 5);
  assert.deepEqual(features[0].rect, { minX: 0, maxX: 10, minY: 0, maxY: 10 });
}));

pending.push(test('prepareFeatures keeps holes and drops degenerate rings', () => {
  const withHole = prepareFeatures([landPolygon(ring(0, 0, 10, 10), ring(2, 2, 4, 4))]);
  assert.equal(withHole[0].rings.length, 2);
  assert.equal(prepareFeatures([[[0, 0], [1, 1]]]).length, 0, 'too few positions');
  assert.equal(prepareFeatures([null, []]).length, 0);
  assert.equal(prepareFeatures([]).length, 0);
}));

pending.push(test('collectPolygons understands FeatureCollections, MultiPolygons and bare geometries', () => {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: multiPolygon([ring(0, 0, 1, 1)], [ring(2, 2, 3, 3)]) }] };
  assert.equal(collectPolygons(fc).length, 2);
  assert.equal(collectPolygons(polygon(ring(0, 0, 1, 1))).length, 1);
  assert.equal(collectPolygons({ type: 'GeometryCollection', geometries: [polygon(ring(0, 0, 1, 1))] }).length, 1);
  assert.equal(collectPolygons({ type: 'Feature', geometry: polygon(ring(0, 0, 1, 1)) }).length, 1);
  assert.equal(collectPolygons({ type: 'Point', coordinates: [0, 0] }).length, 0);
  assert.equal(collectPolygons(null).length, 0);
}));

pending.push(test('the spatial index only returns nearby land', () => {
  const features = prepareFeatures([landBox(0, 0, 4, 4), landBox(50, 50, 60, 60), landBox(-120, -60, 120, 70)]);
  const index = buildIndex(features, 5);
  const near = queryIndex(index, rectFromBBox({ minLng: 1, minLat: 1, maxLng: 2, maxLat: 2 }));
  assert.ok(near.includes(features[0]), 'the local island should be a candidate');
  assert.ok(!near.includes(features[1]), 'a far away island should be rejected');
  assert.ok(near.includes(features[2]), 'an oversized landmass is always a candidate');
  assert.equal(queryIndex(index, rectFromBBox({ minLng: 100, minLat: -80, maxLng: 101, maxLat: -79 })).includes(features[1]), false);
}));

pending.push(test('isLandPoint answers for land, sea and lakes', () => {
  assert.equal(isLandPoint(HALF_WORLD, 0, 0), true);
  assert.equal(isLandPoint(HALF_WORLD, 50, 0), false);
  assert.equal(isLandPoint(LAND_WITH_HOLE, 5, 5), true);
  assert.equal(isLandPoint(LAND_WITH_HOLE, 15, 15), false, 'inside the lake hole');
  assert.equal(isLandPoint(null, 0, 0), false);
}));

/* --------------------------------------------------------- polygon cutting */

pending.push(test('a shape half on land and half at sea is cut back to the coast', () => {
  const drawn = polygon(ring(0, 0, 20, 10));
  const { geometry, empty, stats } = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'high' });
  assert.equal(empty, false);
  assert.equal(geometry.type, 'Polygon');

  const bbox = bboxOfGeometry(geometry);
  assert.ok(Math.abs(bbox.maxLng - 10) < 0.4, `coast should be at 10°E, got ${bbox.maxLng}`);
  assert.ok(Math.abs(bbox.minLng - 0) < 0.4, `western edge should stay at 0°, got ${bbox.minLng}`);
  assert.ok(Math.abs(bbox.maxLat - 10) < 0.4 && Math.abs(bbox.minLat - 0) < 0.4);
  assert.ok(Math.abs(stats.kept - 0.5) < 0.06, `kept ${stats.kept}`);
  assert.equal(stats.candidates, 1);
}));

pending.push(test('a shape drawn entirely at sea leaves nothing', () => {
  const { geometry, empty, stats } = clipGeometryToLand(polygon(ring(40, 40, 60, 60)), HALF_WORLD);
  assert.equal(empty, true);
  assert.equal(geometry, null);
  assert.equal(stats.areaAfter, 0);
}));

pending.push(test('a shape drawn entirely on land is preserved', () => {
  const drawn = polygon(ring(-20, -20, 0, 0));
  const { geometry, stats } = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'high' });
  assert.ok(geometry);
  assert.ok(stats.kept > 0.9, `kept ${stats.kept}`);
}));

pending.push(test('a shape over an island is cut down to the island', () => {
  const drawn = polygon(ring(30, 30, 60, 60));
  const { geometry, stats } = clipGeometryToLand(drawn, ISLAND, { precision: 'high' });
  assert.equal(geometry.type, 'Polygon');
  const bbox = bboxOfGeometry(geometry);
  assert.ok(Math.abs(bbox.minLng - 40) < 0.6 && Math.abs(bbox.maxLng - 50) < 0.6, JSON.stringify(bbox));
  assert.ok(Math.abs(bbox.minLat - 40) < 0.6 && Math.abs(bbox.maxLat - 50) < 0.6, JSON.stringify(bbox));
  const expected = degreesToM2(100, 45);
  assert.ok(Math.abs(stats.areaAfter - expected) / expected < 0.08, `${stats.areaAfter} vs ${expected}`);
}));

pending.push(test('a shape over two islands becomes a MultiPolygon', () => {
  const drawn = polygon(ring(-10, -10, 40, 40));
  const { geometry, stats } = clipGeometryToLand(drawn, ARCHIPELAGO, { precision: 'high' });
  assert.equal(geometry.type, 'MultiPolygon');
  assert.equal(geometry.coordinates.length, 2);
  assert.equal(stats.rings, 2);
}));

pending.push(test('only the part over one of two islands survives', () => {
  const drawn = polygon(ring(-5, -5, 8, 8));
  const { geometry } = clipGeometryToLand(drawn, ARCHIPELAGO, { precision: 'high' });
  assert.equal(geometry.type, 'Polygon', 'the second island is not under the shape');
  const bbox = bboxOfGeometry(geometry);
  assert.ok(Math.abs(bbox.maxLng - 5) < 0.6 && Math.abs(bbox.minLng - 0) < 0.6, JSON.stringify(bbox));
}));

pending.push(test('a lake inside the land stays a hole', () => {
  const drawn = polygon(ring(0, 0, 30, 30));
  const { geometry, stats } = clipGeometryToLand(drawn, LAND_WITH_HOLE, { precision: 'high' });
  assert.equal(geometry.type, 'Polygon');
  assert.equal(geometry.coordinates.length, 2, 'outer ring + lake hole');
  assert.equal(stats.holes, 1);
  const holeArea = Math.abs(ringSignedArea(geometry.coordinates[1]));
  assert.ok(Math.abs(holeArea - 100) < 12, `hole should be ~100 deg², got ${holeArea}`);
}));

pending.push(test('cutLakes removes a separate lakes layer', () => {
  const land = landFrom([landBox(0, 0, 30, 30)], [landBox(10, 10, 20, 20)]);
  const drawn = polygon(ring(0, 0, 30, 30));

  const withLakes = clipGeometryToLand(drawn, land, { precision: 'high', cutLakes: true });
  assert.equal(withLakes.geometry.coordinates.length, 2, 'the lake should be cut out');
  assert.equal(withLakes.stats.holes, 1);

  const without = clipGeometryToLand(drawn, land, { precision: 'high', cutLakes: false });
  assert.equal(without.geometry.coordinates.length, 1, 'lakes stay land by default');
}));

pending.push(test('output rings are closed and correctly wound (RFC 7946 §3.5)', () => {
  const drawn = polygon(ring(0, 0, 30, 30));
  const { geometry } = clipGeometryToLand(drawn, LAND_WITH_HOLE, { precision: 'balanced' });
  for (const ringPositions of geometry.coordinates) {
    assert.deepEqual(ringPositions[0], ringPositions[ringPositions.length - 1], 'ring must be closed');
    assert.ok(ringPositions.length >= 4);
  }
  assert.ok(isCounterClockwise(geometry.coordinates[0]), 'exterior counter-clockwise');
  assert.ok(ringSignedArea(geometry.coordinates[1]) < 0, 'hole clockwise');
}));

function segmentsIntersect([p1, p2], [p3, p4]) {
  const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

pending.push(test('no ring crosses itself, even over awkward land', () => {
  const land = landFrom([
    landBox(0, 0, 20, 20),
    landPolygon([[0, 0], [12, 0], [6, 14], [0, 0]]),
    landPolygon([[14, 2], [18, 2], [16, 18], [14, 2]]),
    landPolygon([[24, 24], [30, 26], [26, 30], [24, 24]]),
  ]);
  const { geometry } = clipGeometryToLand(polygon(ring(-5, -5, 32, 32)), land, { precision: 'balanced' });
  assert.ok(geometry, 'expected a result');
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    for (const ringPositions of poly) {
      const segments = [];
      for (let i = 0; i + 1 < ringPositions.length; i++) segments.push([ringPositions[i], ringPositions[i + 1]]);
      for (let a = 0; a < segments.length; a++) {
        for (let b = a + 1; b < segments.length; b++) {
          if (b === a + 1 || (a === 0 && b === segments.length - 1)) continue;
          assert.equal(segmentsIntersect(segments[a], segments[b]), false, `segments ${a} and ${b} cross`);
        }
      }
    }
  }
}));

pending.push(test('a MultiPolygon input is cut as well', () => {
  const drawn = multiPolygon([ring(0, 0, 20, 10)], [ring(0, 20, 20, 30)]);
  const { geometry, stats } = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'balanced' });
  assert.equal(geometry.type, 'MultiPolygon');
  assert.equal(geometry.coordinates.length, 2);
  assert.ok(Math.abs(stats.kept - 0.5) < 0.08, `kept ${stats.kept}`);
}));

pending.push(test('a concave drawn shape is cut correctly', () => {
  // An L-shaped region straddling the coast at 10°E: a 20×5 arm and a 5×20 leg.
  const drawn = polygon([[0, 0], [20, 0], [20, 5], [5, 5], [5, 20], [0, 20], [0, 0]]);
  const { geometry, stats } = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'high' });
  assert.equal(geometry.type, 'Polygon');
  const bbox = bboxOfGeometry(geometry);
  assert.ok(Math.abs(bbox.maxLng - 10) < 0.6, `coast at 10°E, got ${bbox.maxLng}`);
  // Land part: 10×5 arm + 5×15 leg = 125 deg² of the 175 deg² drawn.
  assert.ok(Math.abs(stats.kept - 125 / 175) < 0.09, `kept ${stats.kept}, expected ~${125 / 175}`);
}));

pending.push(test('higher precision gives a finer grid', () => {
  const drawn = polygon(ring(0, 0, 20, 20));
  const fast = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'fast' });
  const high = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'high' });
  assert.ok(high.stats.cellMeters < fast.stats.cellMeters, `${high.stats.cellMeters} vs ${fast.stats.cellMeters}`);
  assert.ok(high.stats.grid[0] > fast.stats.grid[0]);
  assert.ok(Math.abs(high.stats.kept - 0.5) < 0.05);
}));

pending.push(test('an unknown precision falls back to balanced', () => {
  const { stats } = clipGeometryToLand(polygon(ring(0, 0, 20, 10)), HALF_WORLD, { precision: 'ultra' });
  assert.equal(stats.precision, 'balanced');
}));

pending.push(test('the result is deterministic', () => {
  const drawn = polygon(ring(0, 0, 20, 10));
  const a = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'balanced' });
  const b = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'balanced' });
  assert.deepEqual(a.geometry, b.geometry);
}));

pending.push(test('the input geometry is never mutated', () => {
  const drawn = polygon(ring(0, 0, 20, 10));
  const before = JSON.stringify(drawn);
  clipGeometryToLand(drawn, HALF_WORLD, { precision: 'balanced' });
  assert.equal(JSON.stringify(drawn), before);
}));

pending.push(test('clipping without land data reports it instead of guessing', () => {
  const result = clipGeometryToLand(polygon(ring(0, 0, 1, 1)), null);
  assert.equal(result.error, 'no-land-data');
  assert.equal(result.geometry, null);
  assert.equal(result.empty, true);
}));

pending.push(test('unsupported geometry types are rejected politely', () => {
  const result = clipGeometryToLand({ type: 'GeometryCollection', geometries: [] }, HALF_WORLD);
  assert.equal(result.empty, true);
  assert.equal(result.error, 'unsupported');
}));

pending.push(test('coordinates stay finite and inside sensible bounds', () => {
  const drawn = polygon(ring(0, 0, 20, 10));
  const { geometry } = clipGeometryToLand(drawn, HALF_WORLD, { precision: 'high' });
  const bbox = bboxOfGeometry(geometry);
  assert.ok(bbox.minLng >= -0.5 && bbox.maxLng <= 20.5);
  assert.ok(bbox.minLat >= -0.5 && bbox.maxLat <= 10.5);
  for (const ringPositions of geometry.coordinates) {
    for (const [lng, lat] of ringPositions) {
      assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
      assert.ok(Math.abs(lng) <= 180 && Math.abs(lat) <= 90);
      assert.equal(lng, Math.round(lng * 1e7) / 1e7, 'rounded to 1e-7');
    }
  }
}));

pending.push(test('a vertex budget is respected by coarsening', () => {
  const coast = [[-10, -30]];
  for (let i = 0; i <= 120; i++) coast.push([10 + (i % 2 === 0 ? 0 : 1.5), -30 + i * 0.5]);
  coast.push([-10, 31], [-10, -30]);
  const land = landFrom([landPolygon(coast)]);
  const { geometry, stats } = clipGeometryToLand(polygon(ring(0, -20, 20, 20)), land, { precision: 'high', maxPositions: 200 });
  assert.ok(geometry, 'expected a result');
  assert.ok(stats.positions <= 200, `positions ${stats.positions} over the budget`);
}));

pending.push(test('a jagged coastline produces a sane vertex count quickly', () => {
  const coast = [[-10, -30]];
  for (let i = 0; i <= 60; i++) coast.push([10 + (i % 2 === 0 ? 0 : 1.5), -30 + i]);
  coast.push([-10, 31], [-10, -30]);
  const land = landFrom([landPolygon(coast)]);
  const started = Date.now();
  const { geometry, stats } = clipGeometryToLand(polygon(ring(0, -20, 20, 20)), land, { precision: 'high' });
  const elapsed = Date.now() - started;
  assert.ok(geometry, 'expected a result');
  assert.ok(stats.positions < 4000, `too many vertices: ${stats.positions}`);
  assert.ok(elapsed < 5000, `too slow: ${elapsed}ms`);
  assert.ok(Math.abs(stats.kept - 0.5) < 0.1, `kept ${stats.kept}`);
}));

pending.push(test('a Natural-Earth-scale coastline stays responsive', () => {
  // 700 wiggly islands plus one continent, ~30k positions: the size of a real
  // 1:50m land layer. The budget is generous; the point is to catch a
  // regression that turns one click into a frozen tab.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const blob = (cx, cy, r, n) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.75 + rnd() * 0.5);
      pts.push([cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr]);
    }
    pts.push([pts[0][0], pts[0][1]]);
    return pts;
  };
  const polygons = [landPolygon(blob(10, 30, 22, 900))];
  for (let i = 0; i < 700; i++) {
    polygons.push(landPolygon(blob(-170 + (i % 40) * 8.5, -60 + Math.floor(i / 40) * 7, 0.6 + (i % 5) * 0.35, 40)));
  }
  const land = landFrom(polygons);
  assert.ok(land.features.length > 700);

  const drawn = (() => {
    const pts = [];
    for (let i = 0; i < 300; i++) {
      const a = (i / 300) * Math.PI * 2;
      pts.push([10 + Math.cos(a) * 24, 30 + Math.sin(a) * 18]);
    }
    pts.push([pts[0][0], pts[0][1]]);
    return polygon(pts);
  })();

  const started = Date.now();
  const { geometry, stats } = clipGeometryToLand(drawn, land, { precision: 'high' });
  const elapsed = Date.now() - started;
  assert.ok(geometry, 'expected a result');
  assert.ok(stats.kept > 0.5, `kept ${stats.kept}`);
  assert.ok(stats.positions < 20000, `vertices ${stats.positions}`);
  assert.ok(elapsed < 3000, `took ${elapsed}ms`);
}));

/* ------------------------------------------------------------ line cutting */

pending.push(test('a line crossing the coast is trimmed to the land part', () => {
  const runs = clipPolylineToLand([[0, 0], [20, 0]], HALF_WORLD);
  assert.equal(runs.length, 1);
  const first = runs[0][0];
  const last = runs[0][runs[0].length - 1];
  assert.ok(Math.abs(first[0] - 0) < 1e-6);
  assert.ok(Math.abs(last[0] - 10) < 0.02, `coast crossing at ${last[0]}`);
}));

pending.push(test('a line crossing an island keeps only the middle stretch', () => {
  const runs = clipPolylineToLand([[0, 45], [100, 45]], ISLAND);
  assert.equal(runs.length, 1);
  assert.ok(Math.abs(runs[0][0][0] - 40) < 0.02, `entry at ${runs[0][0][0]}`);
  assert.ok(Math.abs(runs[0][1][0] - 50) < 0.02, `exit at ${runs[0][1][0]}`);
}));

pending.push(test('a line over two islands becomes two runs', () => {
  const runs = clipPolylineToLand([[-5, 2], [35, 25]], ARCHIPELAGO);
  assert.equal(runs.length, 2);
}));

pending.push(test('a line entirely at sea leaves nothing', () => {
  assert.equal(clipPolylineToLand([[40, 0], [60, 0]], HALF_WORLD).length, 0);
  assert.equal(clipPolylineToLand([], HALF_WORLD).length, 0);
  assert.equal(clipPolylineToLand([[5, 5]], HALF_WORLD).length, 0, 'a single position is not a line');
}));

pending.push(test('clipGeometryToLand handles LineString and MultiLineString', () => {
  const line = clipGeometryToLand({ type: 'LineString', coordinates: [[0, 0], [20, 0]] }, HALF_WORLD);
  assert.equal(line.geometry.type, 'LineString');
  assert.equal(line.geometry.coordinates.length, 2);

  const multi = clipGeometryToLand({ type: 'MultiLineString', coordinates: [[[0, 0], [20, 0]], [[40, 0], [60, 0]]] }, HALF_WORLD);
  assert.equal(multi.geometry.type, 'LineString', 'the sea-only line drops out');

  const both = clipGeometryToLand({ type: 'MultiLineString', coordinates: [[[-5, 2], [35, 25]]] }, ARCHIPELAGO);
  assert.equal(both.geometry.type, 'MultiLineString');
  assert.equal(both.geometry.coordinates.length, 2);

  const none = clipGeometryToLand({ type: 'LineString', coordinates: [[40, 0], [60, 0]] }, HALF_WORLD);
  assert.equal(none.empty, true);
}));

pending.push(test('clipGeometryToLand handles points', () => {
  const onLand = clipGeometryToLand({ type: 'Point', coordinates: [0, 0] }, HALF_WORLD);
  assert.equal(onLand.empty, false);
  assert.deepEqual(onLand.geometry.coordinates, [0, 0]);

  const atSea = clipGeometryToLand({ type: 'Point', coordinates: [50, 0] }, HALF_WORLD);
  assert.equal(atSea.empty, true);
  assert.equal(atSea.geometry, null);

  const multi = clipGeometryToLand({ type: 'MultiPoint', coordinates: [[0, 0], [50, 0], [5, 5]] }, HALF_WORLD);
  assert.equal(multi.geometry.type, 'MultiPoint');
  assert.equal(multi.geometry.coordinates.length, 2);

  const single = clipGeometryToLand({ type: 'MultiPoint', coordinates: [[0, 0], [50, 0]] }, HALF_WORLD);
  assert.equal(single.geometry.type, 'Point', 'one survivor collapses to a Point');
}));

pending.push(test('ringsOfGeometry flattens polygons and multipolygons', () => {
  assert.equal(ringsOfGeometry(polygon(ring(0, 0, 1, 1), ring(0.2, 0.2, 0.4, 0.4))).length, 2);
  assert.equal(ringsOfGeometry(multiPolygon([ring(0, 0, 1, 1)], [ring(2, 2, 3, 3)])).length, 2);
  assert.equal(ringsOfGeometry({ type: 'Point', coordinates: [0, 0] }).length, 0);
  assert.equal(ringsOfGeometry(null).length, 0);
}));

/* ------------------------------------------------------------- the service */

pending.push(test('LandService refuses to clip before data is loaded', () => {
  const service = new LandService();
  assert.equal(service.isReady, false);
  assert.equal(service.isLoading, false);
  const result = service.clip(polygon(ring(0, 0, 1, 1)));
  assert.equal(result.error, 'no-land-data');
}));

pending.push(test('LandService adopts a custom land document', async () => {
  const service = new LandService();
  const states = [];
  service.on('state', (s) => states.push(s.status));
  const text = JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: polygon(ring(0, 0, 10, 10)) }],
  });
  const ok = await service.loadFromText(text, 'test.geojson');
  assert.equal(ok, true);
  assert.equal(service.isReady, true);
  assert.equal(service.state.features, 1);
  assert.equal(service.state.source, 'custom');
  assert.equal(service.state.label, 'test.geojson');
  assert.ok(states.includes('ready'));
  const { geometry } = service.clip(polygon(ring(5, 5, 15, 15)));
  assert.ok(geometry);
  const bbox = bboxOfGeometry(geometry);
  assert.ok(Math.abs(bbox.maxLng - 10) < 0.5, JSON.stringify(bbox));
}));

pending.push(test('LandService rejects a file with no polygons', async () => {
  const service = new LandService();
  const ok = await service.loadFromText(JSON.stringify({ type: 'Point', coordinates: [0, 0] }));
  assert.equal(ok, false);
  assert.equal(service.state.status, 'error');
  assert.match(service.state.error, /no polygons/i);
}));

pending.push(test('LandService rejects invalid JSON', async () => {
  const service = new LandService();
  const ok = await service.loadFromText('this is not json');
  assert.equal(ok, false);
  assert.equal(service.state.status, 'error');
}));

pending.push(test('LandService clears back to empty', async () => {
  const service = new LandService();
  await service.loadFromText(JSON.stringify(polygon(ring(0, 0, 1, 1))), 'x.geojson');
  assert.equal(service.isReady, true);
  service.clear();
  assert.equal(service.isReady, false);
  assert.equal(service.state.status, 'empty');
  assert.equal(service.land, null);
}));

pending.push(test('LandService turns off cutLakes when no lakes were loaded', async () => {
  const service = new LandService();
  await service.loadFromText(JSON.stringify(polygon(ring(0, 0, 10, 10))), 'x.geojson');
  const result = service.clip(polygon(ring(0, 0, 10, 10)), { cutLakes: true });
  assert.equal(result.stats.cutLakes, false);
}));

/* ------------------------------------------------------------------ report */

await Promise.all(pending.filter(Boolean));

if (failures.length) {
  console.error(`\n${failures.length} of ${passed + failures.length} land tests failed:\n`);
  for (const { name, err } of failures) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${String(err && err.message || err).split('\n').slice(0, 5).join('\n    ')}`);
  }
  process.exit(1);
}
console.log(`\n✓ ${passed} land tests passed (raster clip, tracing, nesting, lines, points)\n`);
