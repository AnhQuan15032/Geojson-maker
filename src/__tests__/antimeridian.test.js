// Antimeridian repair — world-atlas rings are geostitched across ±180° and
// used to render as horizontal bands across the whole map (Russia at 65–69°N).
import { describe, it, expect } from 'vitest';
import {
  clipRingToLngRange,
  geometryNeedsRepair,
  ringArea,
  ringNeedsRepair,
  splitLineAtAntimeridian,
  splitPolygonAtAntimeridian,
  unstitchAntimeridian,
  unstitchFeature,
  unwrapRing,
} from '../engine/antimeridian.js';
import { repairGeoDataObject } from '../engine/geojsonLoader.js';

// Wrangel Island exactly as world-atlas countries-50m stores it (Russia part 28, 3 dp).
const WRANGEL = [[-180,71.538],[-179.845,71.552],[-179.69,71.578],[-179.546,71.583],[-179.402,71.567],[-179.255,71.571],[-179.111,71.597],[-178.996,71.593],[-178.877,71.578],[-178.438,71.541],[-178.355,71.529],[-178.214,71.482],[-178.135,71.465],[-178.056,71.437],[-177.973,71.39],[-177.818,71.34],[-177.584,71.281],[-177.534,71.264],[-177.498,71.218],[-177.523,71.166],[-177.822,71.067],[-178.063,71.041],[-178.528,71.015],[-179.158,70.941],[-179.417,70.92],[-179.507,70.923],[-179.734,70.972],[-180,70.993],[179.881,70.975],[179.647,70.899],[179.154,70.88],[178.862,70.826],[178.794,70.823],[178.65,71.001],[178.628,71.047],[178.682,71.106],[178.83,71.179],[178.891,71.231],[179.237,71.324],[179.546,71.448],[179.716,71.467],[179.885,71.524],[-180,71.538]];
// Fiji part 15 (countries-50m): includes a degenerate 180 → −180 edge at the same latitude.
const FIJI = [[180,-16.54],[179.986,-16.542],[179.986,-16.523],[-180,-16.49],[-179.942,-16.441],[-179.899,-16.432],[-179.928,-16.479],[-179.928,-16.504],[-180,-16.54],[180,-16.54]];

const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const allPoints = (g) => polys(g).flat().flat();
const totalArea = (g) => polys(g).reduce((sum, poly) => sum + Math.abs(ringArea(poly[0])) - poly.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0), 0);
const maxJump = (g) => {
  let m = 0;
  for (const poly of polys(g)) for (const ring of poly) for (let i = 1; i < ring.length; i++) m = Math.max(m, Math.abs(ring[i][0] - ring[i - 1][0]));
  return m;
};
const expectClean = (g) => {
  expect(geometryNeedsRepair(g)).toBe(false);
  for (const [lng] of allPoints(g)) {
    expect(lng).toBeGreaterThanOrEqual(-180);
    expect(lng).toBeLessThanOrEqual(180);
  }
  for (const poly of polys(g)) for (const ring of poly) {
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  }
};

describe('antimeridian detection', () => {
  it('flags stitched rings and leaves ordinary rings alone', () => {
    expect(ringNeedsRepair([[170, 10], [-170, 10], [-170, -10], [170, -10], [170, 10]])).toBe(true);
    expect(ringNeedsRepair([[170, 10], [179, 10], [179, -10], [170, -10], [170, 10]])).toBe(false);
    expect(ringNeedsRepair([[0, 0], [190, 0], [190, 5], [0, 0]])).toBe(true); // beyond +180
    expect(ringNeedsRepair(WRANGEL)).toBe(true);
    expect(ringNeedsRepair(FIJI)).toBe(true);
  });

  it('does not treat the 360° edge along the pole (Natural Earth Antarctica) as a crossing', () => {
    const ring = [[-180, -84], [0, -70], [180, -84], [180, -90], [-180, -90], [-180, -84]];
    expect(ringNeedsRepair(ring)).toBe(false);
    const geom = { type: 'Polygon', coordinates: [ring] };
    expect(unstitchAntimeridian(geom)).toBe(geom);
  });

  it('returns clean geometry by reference', () => {
    const g = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[10, 10], [11, 10], [11, 11], [10, 10]]]] };
    expect(unstitchAntimeridian(g)).toBe(g);
    const f = { type: 'Feature', properties: {}, geometry: g };
    expect(unstitchFeature(f).geometry).toBe(g);
  });
});

describe('ring helpers', () => {
  it('unwraps a stitched ring into a continuous longitude range', () => {
    const { ring, net } = unwrapRing([[170, 10], [-170, 10], [-170, -10], [170, -10], [170, 10]]);
    expect(net).toBe(0);
    expect(ring.map((p) => p[0])).toEqual([170, 190, 190, 170, 170]);
  });

  it('reports a ±360° net offset for a ring that circles the pole', () => {
    const stitched = [];
    for (let lng = -180; lng < 180; lng += 30) stitched.push([lng, -70]);
    stitched.push([-180, -70]);
    const { net } = unwrapRing(stitched);
    expect(Math.abs(net)).toBe(360);
  });

  it('clips a ring to a longitude strip', () => {
    const square = [[170, 10], [190, 10], [190, -10], [170, -10], [170, 10]];
    const left = clipRingToLngRange(square, -180, 180);
    expect(Math.abs(ringArea(left))).toBeCloseTo(200, 6);
    for (const [lng] of left) expect(lng).toBeLessThanOrEqual(180);
    expect(clipRingToLngRange(square, 200, 300)).toBeNull();
  });
});

describe('unstitchAntimeridian', () => {
  it('splits a square straddling 180° into two halves of equal area', () => {
    const g = { type: 'Polygon', coordinates: [[[170, 10], [-170, 10], [-170, -10], [170, -10], [170, 10]]] };
    const out = unstitchAntimeridian(g);
    expect(out.type).toBe('MultiPolygon');
    expect(out.coordinates.length).toBe(2);
    expectClean(out);
    expect(totalArea(out)).toBeCloseTo(400, 6);
    const ranges = out.coordinates.map((poly) => poly[0].map((p) => p[0])).map((l) => [Math.min(...l), Math.max(...l)]);
    expect(ranges).toContainEqual([170, 180]);
    expect(ranges).toContainEqual([-180, -170]);
  });

  it('clips holes that straddle the line along with their shell', () => {
    const g = {
      type: 'Polygon',
      coordinates: [
        [[170, 10], [-170, 10], [-170, -10], [170, -10], [170, 10]],
        [[175, 5], [175, -5], [-175, -5], [-175, 5], [175, 5]],
      ],
    };
    const out = unstitchAntimeridian(g);
    expectClean(out);
    expect(out.coordinates.length).toBe(2);
    for (const poly of out.coordinates) expect(poly.length).toBe(2);
    expect(totalArea(out)).toBeCloseTo(400 - 100, 6);
  });

  it('keeps a hole that lies entirely on one side', () => {
    const g = {
      type: 'Polygon',
      coordinates: [
        [[170, 10], [-170, 10], [-170, -10], [170, -10], [170, 10]],
        [[-178, 2], [-178, -2], [-172, -2], [-172, 2], [-178, 2]],
      ],
    };
    const out = unstitchAntimeridian(g);
    expectClean(out);
    expect(totalArea(out)).toBeCloseTo(400 - 24, 6);
    const withHole = out.coordinates.filter((poly) => poly.length === 2);
    expect(withHole.length).toBe(1);
    expect(withHole[0][0].every(([lng]) => lng <= -170)).toBe(true);
  });

  it('repairs Wrangel Island (world-atlas Russia) into two coast pieces with no map-wide edge', () => {
    const before = { type: 'Polygon', coordinates: [WRANGEL] };
    expect(maxJump(before)).toBeGreaterThan(359);
    const out = unstitchAntimeridian(before);
    expectClean(out);
    expect(out.type).toBe('MultiPolygon');
    expect(out.coordinates.length).toBe(2);
    expect(maxJump(out)).toBeLessThan(1);
    // ~1.9 deg² of island (7 600 km² at 71°N), not a 360°-wide band
    expect(totalArea(out)).toBeGreaterThan(1);
    expect(totalArea(out)).toBeLessThan(3);
    const east = out.coordinates.find((poly) => poly[0].every(([lng]) => lng >= 178));
    const west = out.coordinates.find((poly) => poly[0].every(([lng]) => lng <= -177));
    expect(east && west).toBeTruthy();
  });

  it('handles Fiji including its degenerate 180 → −180 edge', () => {
    const out = unstitchAntimeridian({ type: 'Polygon', coordinates: [FIJI] });
    expectClean(out);
    expect(totalArea(out)).toBeGreaterThan(0);
    expect(totalArea(out)).toBeLessThan(0.1);
  });

  it('closes a stitched ring that circles the South Pole (Antarctica) through the pole', () => {
    const stitched = [];
    for (let lng = -180; lng < 180; lng += 10) stitched.push([lng, -70 + 3 * Math.sin((lng * Math.PI) / 180)]);
    stitched.push([-180, -70]);
    const out = unstitchAntimeridian({ type: 'Polygon', coordinates: [stitched] });
    expectClean(out);
    expect(out.type).toBe('Polygon');
    const ring = out.coordinates[0];
    expect(ring.some(([lng, lat]) => lng === 180 && lat === -90)).toBe(true);
    expect(ring.some(([lng, lat]) => lng === -180 && lat === -90)).toBe(true);
    // everything south of the coast, nothing north of it (sine wobble averages out)
    expect(Math.abs(ringArea(ring))).toBeCloseTo(360 * 20, -1);
  });

  it('drops the degenerate pole cap and promotes the coastline (world-atlas 50m Antarctica layout)', () => {
    const cap = [];
    for (let lng = -180; lng < 180; lng += 10) cap.push([lng, -89.999]);
    cap.push([-180, -89.999]);
    const coast = [];
    for (let lng = -180; lng < 180; lng += 10) coast.push([lng, -70]);
    coast.push([-180, -70]);
    const out = unstitchAntimeridian({ type: 'Polygon', coordinates: [cap, coast] });
    expectClean(out);
    expect(out.type).toBe('Polygon');
    expect(out.coordinates.length).toBe(1);
    expect(Math.abs(ringArea(out.coordinates[0]))).toBeCloseTo(360 * 20, 6);
  });

  it('only touches the parts of a MultiPolygon that need it', () => {
    const clean = [[[10, 10], [11, 10], [11, 11], [10, 10]]];
    const g = { type: 'MultiPolygon', coordinates: [clean, [WRANGEL]] };
    const out = unstitchAntimeridian(g);
    expectClean(out);
    expect(out.coordinates.length).toBe(3);
    expect(out.coordinates[0]).toBe(clean);
  });

  it('is idempotent', () => {
    const once = unstitchAntimeridian({ type: 'MultiPolygon', coordinates: [[WRANGEL], [FIJI]] });
    expect(unstitchAntimeridian(once)).toBe(once);
  });

  it('splitPolygonAtAntimeridian returns the input polygon untouched when clean', () => {
    const poly = [[[0, 0], [1, 0], [1, 1], [0, 0]]];
    expect(splitPolygonAtAntimeridian(poly)).toEqual([poly]);
    expect(splitPolygonAtAntimeridian(poly)[0]).toBe(poly);
  });
});

describe('lines', () => {
  it('breaks a border line where it jumps across ±180°', () => {
    const parts = splitLineAtAntimeridian([[178, 60], [179.5, 61], [-179.5, 61.5], [-178, 62]]);
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(2);
    expect(parts[1].length).toBe(2);
    const ms = { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[178, 0], [179, 0], [-179, 0], [-178, 0]]] };
    const out = unstitchAntimeridian(ms);
    expect(out.coordinates.length).toBe(3);
    expect(geometryNeedsRepair(out)).toBe(false);
    // a lone 2-point seam edge has nothing left on either side and is dropped
    expect(splitLineAtAntimeridian([[179, 0], [-179, 0]])).toEqual([]);
  });

  it('leaves clean lines alone', () => {
    const line = [[0, 0], [1, 1]];
    expect(splitLineAtAntimeridian(line)[0]).toBe(line);
  });
});

describe('strict mode (geometry of unknown origin)', () => {
  it('still repairs unmistakably stitched rings', () => {
    expect(ringNeedsRepair(WRANGEL, true)).toBe(true);
    expect(ringNeedsRepair(FIJI, true)).toBe(true);
    const out = unstitchAntimeridian({ type: 'Polygon', coordinates: [WRANGEL] }, { strict: true });
    expectClean(out);
    expect(out.coordinates.length).toBe(2);
  });

  it('keeps a world-wide background rectangle (−180 … 180 in one edge)', () => {
    const world = { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] };
    expect(ringNeedsRepair(world.coordinates[0], true)).toBe(false);
    expect(unstitchAntimeridian(world, { strict: true })).toBe(world);
  });

  it('keeps a shape drawn across the dateline on the next world copy (lng beyond 180)', () => {
    const drawn = { type: 'Polygon', coordinates: [[[170, 60], [190, 60], [190, 70], [170, 70], [170, 60]]] };
    expect(unstitchAntimeridian(drawn, { strict: true })).toBe(drawn);
    // …whereas the loaders' default mode normalises it into two pieces
    const out = unstitchAntimeridian(drawn);
    expectClean(out);
    expect(out.coordinates.length).toBe(2);
    expect(totalArea(out)).toBeCloseTo(200, 6);
  });

  it('keeps a wide hand-drawn edge whose ends are not on ±180°', () => {
    const wide = { type: 'Polygon', coordinates: [[[-170, 10], [170, 10], [170, 20], [-170, 20], [-170, 10]]] };
    expect(unstitchAntimeridian(wide, { strict: true })).toBe(wide);
  });
});

describe('GeoJSON import repair', () => {
  it('repairs features in a FeatureCollection in place', () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'W' }, geometry: { type: 'Polygon', coordinates: [WRANGEL] } }] };
    const out = repairGeoDataObject(fc);
    expect(out).toBe(fc);
    expect(fc.features[0].geometry.type).toBe('MultiPolygon');
    expectClean(fc.features[0].geometry);
  });

  it('repairs a bare geometry object', () => {
    const out = repairGeoDataObject({ type: 'Polygon', coordinates: [WRANGEL] });
    expect(out.type).toBe('MultiPolygon');
    expectClean(out);
  });

  it('is strict: a saved world background and a cross-dateline drawing load unchanged', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[170, 60], [190, 60], [190, 70], [170, 70], [170, 60]]] } },
      ],
    };
    const before = JSON.stringify(fc);
    repairGeoDataObject(fc);
    expect(JSON.stringify(fc)).toBe(before);
  });
});
