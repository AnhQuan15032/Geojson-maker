// Regression for the "Russia draws as bands across the map" bug: the real
// country-index → Load path and the Cut Sea landmass loader, fed a world-atlas
// style TopoJSON whose rings are stitched across ±180°.
import { describe, it, expect, beforeAll, vi } from 'vitest';

global.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import './setup.js';
import './dom-stubs.js';
import App from '../App.jsx';
import { startEngine } from '../engine/bootstrap.js';
import { S } from '../engine/state.js';
import { ensureCountryIndex, loadCountryFeature } from '../engine/countries.js';
import { loadGlobalLandmass } from '../engine/merge.js';
import { geometryNeedsRepair } from '../engine/antimeridian.js';

// Wrangel Island exactly as world-atlas countries-50m stores it (stitched at 71°N).
const WRANGEL = [[-180,71.538],[-179.845,71.552],[-179.69,71.578],[-179.546,71.583],[-179.402,71.567],[-179.255,71.571],[-179.111,71.597],[-178.996,71.593],[-178.877,71.578],[-178.438,71.541],[-178.355,71.529],[-178.214,71.482],[-178.135,71.465],[-178.056,71.437],[-177.973,71.39],[-177.818,71.34],[-177.584,71.281],[-177.534,71.264],[-177.498,71.218],[-177.523,71.166],[-177.822,71.067],[-178.063,71.041],[-178.528,71.015],[-179.158,70.941],[-179.417,70.92],[-179.507,70.923],[-179.734,70.972],[-180,70.993],[179.881,70.975],[179.647,70.899],[179.154,70.88],[178.862,70.826],[178.794,70.823],[178.65,71.001],[178.628,71.047],[178.682,71.106],[178.83,71.179],[178.891,71.231],[179.237,71.324],[179.546,71.448],[179.716,71.467],[179.885,71.524],[-180,71.538]];
// A "mainland" ring stitched the same way Russia's is (east tip past 180°).
const MAINLAND = [[150, 60], [170, 60], [179.9, 66], [-180, 66], [-175, 66], [-175, 69], [-180, 69], [179.9, 69], [170, 72], [150, 72], [150, 60]];
const ISLAND = [[20, 40], [30, 40], [30, 45], [20, 45], [20, 40]];

// Un-quantised TopoJSON (no transform ⇒ arcs are absolute coordinates).
function topology(objects) {
  const arcs = [];
  const ring = (coords) => { arcs.push(coords); return [arcs.length - 1]; };
  const built = {};
  for (const [name, geoms] of Object.entries(objects)) {
    built[name] = {
      type: 'GeometryCollection',
      geometries: geoms.map((g) => ({
        type: 'MultiPolygon',
        id: g.id,
        properties: g.properties,
        arcs: g.rings.map((r) => [ring(r)]),
      })),
    };
  }
  return { type: 'Topology', objects: built, arcs };
}

const COUNTRIES = topology({
  countries: [
    { id: '643', properties: { name: 'Russia' }, rings: [MAINLAND, WRANGEL] },
    { id: '380', properties: { name: 'Italy' }, rings: [ISLAND] },
  ],
});
const LAND = topology({ land: [{ properties: {}, rings: [MAINLAND, WRANGEL, ISLAND] }] });

const json = (obj) => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(obj))) });

const jumps = (geojson) => {
  const polys = geojson.type === 'Polygon' ? [geojson.coordinates] : geojson.coordinates;
  let m = 0;
  for (const poly of polys) for (const ring of poly) for (let i = 1; i < ring.length; i++) m = Math.max(m, Math.abs(ring[i][0] - ring[i - 1][0]));
  return m;
};

beforeAll(() => {
  global.fetch = vi.fn((url) => {
    if (/countries-\d+m\.json/.test(url)) return json(COUNTRIES);
    if (/land-\d+m\.json/.test(url)) return json(LAND);
    return Promise.reject(new Error('offline in test: ' + url));
  });
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
});

describe('countries crossing the antimeridian', () => {
  it('index → Load gives a shape with no map-wide edge; Cut Sea landmass is split too', async () => {
    const host = document.createElement('div');
    host.id = 'root';
    document.body.appendChild(host);
    act(() => { createRoot(host).render(<App />); });
    act(() => { startEngine(); });

    const list = await ensureCountryIndex();
    expect(Array.isArray(list)).toBe(true);
    const russia = list.find((e) => e.name === 'Russia');
    const italy = list.find((e) => e.name === 'Italy');
    expect(russia && italy).toBeTruthy();

    // stitched input really did span the world …
    expect(jumps({ type: 'MultiPolygon', coordinates: [[MAINLAND], [WRANGEL]] })).toBeGreaterThan(359);
    // … the indexed feature no longer does
    expect(geometryNeedsRepair(russia.feature.geometry)).toBe(false);
    expect(jumps(russia.feature.geometry)).toBeLessThan(180);
    expect(russia.feature.geometry.type).toBe('MultiPolygon');
    expect(russia.feature.geometry.coordinates.length).toBe(4); // 2 rings → 4 pieces (one per side each)
    expect(russia.bbox[0]).toBe(-180);
    expect(russia.bbox[2]).toBe(180);
    // a country that never crosses the line is untouched
    expect(italy.feature.geometry.coordinates).toEqual([[ISLAND]]);

    // Load it the way the Map panel does
    loadCountryFeature(russia);
    const layer = S.countryLayerById['643'];
    expect(layer).toBeTruthy();
    expect(S.drawnItems.hasLayer(layer)).toBe(true);
    const gj = layer.toGeoJSON().geometry;
    expect(gj.type).toBe('MultiPolygon');
    expect(jumps(gj)).toBeLessThan(180);
    for (const poly of gj.coordinates) for (const [lng] of poly[0]) {
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
    // the pieces east of the line really sit against −180 … and the west ones against +180
    const west = gj.coordinates.filter((p) => p[0].every(([lng]) => lng <= -175));
    const east = gj.coordinates.filter((p) => p[0].every(([lng]) => lng >= 150));
    expect(west.length).toBe(2);
    expect(east.length).toBe(2);

    // Cut Sea landmass goes through the same repair
    await loadGlobalLandmass('low');
    const land = S.landCache.low;
    expect(land.length).toBe(5); // mainland ×2 + Wrangel ×2 + island
    for (const f of land) {
      expect(f.geometry.type).toBe('Polygon');
      expect(geometryNeedsRepair(f.geometry)).toBe(false);
      expect(f.bbox[2] - f.bbox[0]).toBeLessThan(180);
    }
  });
});
