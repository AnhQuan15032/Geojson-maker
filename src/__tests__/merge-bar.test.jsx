// Merge mode: the floating Merge toolbar appears as soon as merge mode is
// switched on, counts the picked regions and runs the fusion from the map;
// the merged shape keeps every outline point of its inputs and is rendered
// at the same fidelity (no coarser smoothFactor), and "Dissolve" only drops
// the thin little gap holes between mismatched borders without moving a
// single vertex. Real component tree, real engine, real Leaflet + Turf.
import { describe, it, expect, beforeAll, vi } from 'vitest';

global.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import './setup.js';
import './dom-stubs.js';
import L from 'leaflet';
import App from '../App.jsx';
import { startEngine } from '../engine/bootstrap.js';
import { S } from '../engine/state.js';
import { setupLayerProperties } from '../engine/colors.js';
import { removeMergeGaps } from '../engine/merge.js';
import { ensureHeavyLibs } from '../engine/heavyLibs.js';
import { restoreHistoryState } from '../engine/history.js';

beforeAll(() => {
  global.fetch = vi.fn(() => Promise.reject(new Error('offline in test')));
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  HTMLAnchorElement.prototype.click = function () { this.dataset.clicked = '1'; };
  localStorage.setItem('gjs_tutorial_seen', '1');
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (c) => `${Math.round(c[0] * 1e9)},${Math.round(c[1] * 1e9)}`;
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
const vertexKeys = (g) => new Set(ringsOf(g).flat().map(key));

const feature = (rings, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } });
function addShape(f) {
  const layer = L.geoJSON(f, { style: { color: '#10b981', fillColor: '#10b981', fillOpacity: 1, weight: 0 } }).getLayers()[0];
  setupLayerProperties(layer);
  Object.assign(layer.feature.properties, f.properties);
  S.drawnItems.addLayer(layer);
  return layer;
}

// West block with a small inlet on its (outer) west coast and a wavy east
// border …
const westRing = [[100, 10], [100, 10.03], [99.98, 10.04], [100, 10.05], [100, 10.1], [100.5, 10.1], [100.5, 10.05], [100.52, 10.04], [100.5, 10.03], [100.52, 10.02], [100.5, 10], [100, 10]];
// … and an east block whose west border follows that wavy border exactly
// except for one thin wedge (0.002° ≈ 200 m at its widest, ~2 km long) —
// the kind of hairline gap two mismatched datasets leave behind.
const eastRing = [[100.5, 10], [100.52, 10.02], [100.5, 10.03], [100.522, 10.04], [100.5, 10.05], [100.5, 10.1], [101, 10.1], [101, 10], [100.5, 10]];
const wedge = [[100.5, 10.03], [100.52, 10.04], [100.5, 10.05], [100.522, 10.04]];
// what is left once the shared border is fused and the wedge dissolved:
// the four corners plus the untouched west inlet
const expectedOutline = [[100, 10], [100, 10.03], [99.98, 10.04], [100, 10.05], [100, 10.1], [101, 10.1], [101, 10]];

describe('merge mode — floating Merge toolbar + lossless merge', () => {
  it('shows the Merge bar when merge mode is on, merges from it at full fidelity, hides it again', async () => {
    const host = document.createElement('div');
    host.id = 'root';
    document.body.appendChild(host);
    act(() => { createRoot(host).render(<App />); });
    act(() => { startEngine(); });

    const bar = document.getElementById('merge-bar');
    const run = document.getElementById('btn-merge-bar-run');
    expect(bar, 'the toolbar is part of the static markup').toBeTruthy();
    expect(bar.classList.contains('visible'), 'hidden while merge mode is off').toBe(false);
    expect(document.getElementById('merge-dissolve').checked, 'Dissolve is a real toggle, on by default').toBe(true);

    const west = addShape(feature([westRing], { name: 'West' }));
    const east = addShape(feature([eastRing], { name: 'East' }));
    expect(S.drawnItems.getLayers().length).toBe(2);

    // switch merge mode on from the header toggle → the bar appears, Merge still disabled
    document.getElementById('btn-merge-header').click();
    expect(S.mergeMode).toBe(true);
    expect(bar.classList.contains('visible')).toBe(true);
    expect(document.body.classList.contains('merge-mode')).toBe(true);
    expect(run.disabled, 'nothing picked yet').toBe(true);
    expect(document.getElementById('merge-bar-title').textContent).toBe('Merge mode');

    // tap the two regions on the map (Leaflet propagates the clicks to the feature group)
    west.fire('click', {}, true);
    expect(document.getElementById('merge-bar-title').textContent).toBe('1 region picked');
    expect(run.disabled).toBe(true);
    east.fire('click', {}, true);
    expect(S.mergeSelection.length).toBe(2);
    expect(document.getElementById('merge-bar-title').textContent).toBe('2 regions picked');
    expect(document.getElementById('merge-bar-run-label').textContent).toBe('Merge 2');
    expect(run.disabled, 'two picked → Merge is live').toBe(false);

    // Merge from the floating bar
    run.click();
    for (let i = 0; i < 100 && S.drawnItems.getLayers().length !== 1; i++) await sleep(50);
    const layers = S.drawnItems.getLayers();
    expect(layers.length, 'the two regions became one shape').toBe(1);
    const merged = layers[0];
    expect(merged.feature.properties.merged).toBe(2);
    expect(merged.feature.properties.name).toBe('West (merged 2)');
    expect(merged.options.smoothFactor, 'rendered like the originals, not coarser').toBe(1);

    const geom = merged.toGeoJSON(false).geometry;
    expect(geom.type).toBe('Polygon');
    expect(geom.coordinates.length, 'the hairline gap was dissolved, no hole left').toBe(1);
    // nothing was moved, smoothed or re-sampled: the outline is exactly the
    // corners + the west inlet (the fused border, its two collinear end points
    // on the straight top/bottom edges and the wedge are gone)
    expect([...vertexKeys(geom)].sort()).toEqual(expectedOutline.map(key).sort());

    // still in merge mode, bar says so, ready for the next pick
    expect(bar.classList.contains('visible')).toBe(true);
    expect(document.getElementById('merge-bar-hint').textContent).toContain('merged 2');
    expect(run.disabled).toBe(true);

    // Esc leaves merge mode → the bar disappears
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(S.mergeMode).toBe(false);
    expect(bar.classList.contains('visible')).toBe(false);
    expect(document.body.classList.contains('merge-mode')).toBe(false);

    // and the ✓ button leaves it too
    document.getElementById('btn-merge-rail').click();
    expect(bar.classList.contains('visible')).toBe(true);
    document.getElementById('btn-merge-bar-done').click();
    expect(S.mergeMode).toBe(false);
    expect(bar.classList.contains('visible')).toBe(false);

    // undo/redo restores shapes at the default fidelity as well
    const snapshot = JSON.stringify({ type: 'FeatureCollection', features: [merged.toGeoJSON(false)] });
    restoreHistoryState(snapshot);
    const restored = S.drawnItems.getLayers()[0];
    expect(restored.options.smoothFactor).toBe(1);
  }, 20000);

  it('Enter runs the merge; with Dissolve off the union is the plain, lossless one (gap kept as a hole)', async () => {
    S.drawnItems.clearLayers();
    S.mergeSelection = [];
    const dissolve = document.getElementById('merge-dissolve');
    dissolve.click();
    expect(dissolve.checked, 'the checkbox can be switched off').toBe(false);
    const west = addShape(feature([westRing], { name: 'West' }));
    const east = addShape(feature([eastRing], { name: 'East' }));
    if (!S.mergeMode) document.getElementById('btn-merge-header').click();
    west.fire('click', {}, true);
    east.fire('click', {}, true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 100 && S.drawnItems.getLayers().length !== 1; i++) await sleep(50);
    expect(S.drawnItems.getLayers().length).toBe(1);
    const geom = S.drawnItems.getLayers()[0].toGeoJSON(false).geometry;
    expect(geom.type).toBe('Polygon');
    expect(geom.coordinates.length, 'the hairline gap stays as a hole').toBe(2);
    expect([...vertexKeys({ type: 'Polygon', coordinates: [geom.coordinates[0]] })].sort()).toEqual(expectedOutline.map(key).sort());
    expect([...vertexKeys({ type: 'Polygon', coordinates: [geom.coordinates[1]] })].sort()).toEqual(wedge.map(key).sort());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(S.mergeMode).toBe(false);
    dissolve.click();
    expect(dissolve.checked).toBe(true);
  }, 20000);
});

describe('removeMergeGaps — dissolve without moving a vertex', () => {
  beforeAll(() => ensureHeavyLibs());

  const polyRings = (f) => f.geometry.coordinates;

  it('drops a thin new gap hole, keeps the inputs\' own holes and any sizeable enclosed area', () => {
    // a square with its own compact hole (an enclave) — must survive a merge
    const donut = feature([
      [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]],
      [[0.4, 0.4], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4], [0.4, 0.4]],
    ]);
    const neighbour = feature([[[1, 0], [1, 1], [2, 1], [2, 0], [1, 0]]]);
    // the union as polygon-clipping would return it, plus one hairline wedge
    // between the two blocks (~1 km long, 10 m wide) and one big open court
    // enclosed by both blocks (must stay: it is not a sliver)
    const merged = feature([
      [[0, 0], [0, 1], [2, 1], [2, 0], [0, 0]],
      [[0.4, 0.4], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4], [0.4, 0.4]], // donut's own hole
      [[1, 0.2], [1.0001, 0.205], [1, 0.21], [0.9999, 0.205], [1, 0.2]], // wedge: both inputs + fresh points
      [[0.8, 0.7], [0.8, 0.9], [1.2, 0.9], [1.2, 0.7], [0.8, 0.7]], // court bounded by both inputs, compact
    ]);
    // make the wedge/court rings "belong" to the inputs like a real union would
    const inputs = [
      feature([...polyRings(donut), [[1, 0.2], [1, 0.21], [0.9999, 0.205], [1, 0.2]], [[0.8, 0.7], [0.8, 0.9], [1, 0.9], [1, 0.7], [0.8, 0.7]]]),
      feature([...polyRings(neighbour), [[1, 0.2], [1.0001, 0.205], [1, 0.21], [1, 0.2]], [[1, 0.7], [1, 0.9], [1.2, 0.9], [1.2, 0.7], [1, 0.7]]]),
    ];
    const out = removeMergeGaps(merged, inputs);
    const rings = out.geometry.coordinates;
    expect(rings.length, 'only the wedge went away').toBe(3);
    expect(rings[0]).toEqual(merged.geometry.coordinates[0]);
    expect(rings[1]).toEqual(merged.geometry.coordinates[1]);
    expect(rings[2]).toEqual(merged.geometry.coordinates[3]);
    // nothing was moved: the output rings are the very same arrays
    expect(rings[0]).toBe(merged.geometry.coordinates[0]);
  });

  it('is a no-op when there is nothing to dissolve, and never touches islands', () => {
    const inputs = [
      feature([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]),
      feature([[[5, 5], [5, 5.001], [5.03, 5.001], [5.03, 5], [5, 5]]]), // a thin little island
    ];
    const merged = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [inputs[0].geometry.coordinates, inputs[1].geometry.coordinates] },
    };
    const out = removeMergeGaps(merged, inputs);
    expect(out).toBe(merged);
    expect(out.geometry.coordinates.length).toBe(2);
  });
});
