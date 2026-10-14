// Functional test for the polygon-blade split tools: draw a closed ring over
// the selected shape and the engine must cut it into the part inside the ring
// and the part outside it — or erase the drawn region entirely in delete mode.
//
// Uses a real Leaflet map + real turf, so this checks the geometry, not mocks.
import { describe, it, expect, beforeEach } from 'vitest';

import './setup.js';
import L from 'leaflet';
import { sharedMap, sharedDrawnItems } from './shared-map.js';
import { S } from '../engine/state.js';
import { executeSplitWithPolygon } from '../engine/split.js';

// A square target around the shared map's centre (51.5, -0.12)
const SQUARE = [
  [51.49, -0.13],
  [51.49, -0.11],
  [51.51, -0.11],
  [51.51, -0.13],
];

// Blade covering the western half of the square (lng -0.13 .. -0.12)
const WEST_HALF = [
  [51.48, -0.14],
  [51.48, -0.12],
  [51.52, -0.12],
  [51.52, -0.14],
];

// Blade that misses the square completely
const FAR_AWAY = [
  [10, 10],
  [10, 11],
  [11, 11],
  [11, 10],
];

const ring = pts => pts.map(([lat, lng]) => L.latLng(lat, lng));

function totalArea(layers) {
  // eslint-disable-next-line no-undef
  const t = globalThis.window?.turf;
  return layers.reduce((sum, l) => {
    try {
      return sum + t.area(l.toGeoJSON());
    } catch {
      return sum;
    }
  }, 0);
}

function freshSquare(name = 'Test Region') {
  const layer = L.polygon(ring(SQUARE), { color: '#10b981', fillColor: '#10b981', fillOpacity: 1, weight: 0 });
  layer.feature = { type: 'Feature', properties: { name } };
  S.drawnItems.addLayer(layer);
  S.activeSelectedLayer = layer;
  S._splitLockedLayer = layer;
  return layer;
}

describe('polygon blade split', () => {
  beforeEach(() => {
    sharedMap();
    sharedDrawnItems([]);
    S.splitModeActive = false;
    S.splitDeleteMode = false;
    S.splitTool = 'polygon';
    S._splitLockedLayer = null;
    S.activeSelectedLayer = null;
    S.countryLayers = [];
    S.countryLayerById = {};
  });

  it('cuts the selected shape into an inside and an outside piece', async () => {
    await import('../engine/heavyLibs.js').then(m => m.ensureHeavyLibs());
    const original = freshSquare();
    const before = totalArea([original]);

    await executeSplitWithPolygon([ring(WEST_HALF)], false);

    const pieces = S.drawnItems.getLayers();
    expect(pieces, 'the original is replaced by its pieces').toHaveLength(2);
    expect(S.drawnItems.hasLayer(original), 'original shape removed').toBe(false);

    const names = pieces.map(p => p.feature.properties.name).sort();
    expect(names).toEqual(['Test Region (inside)', 'Test Region (outside)']);

    // Area is conserved: inside + outside == original (no gap, no overlap)
    const after = totalArea(pieces);
    expect(after).toBeGreaterThan(before * 0.98);
    expect(after).toBeLessThan(before * 1.02);

    // Each half is roughly half the square — the blade ran down the middle
    const areas = pieces.map(p => window.turf.area(p.toGeoJSON())).sort((a, b) => a - b);
    expect(areas[0] / areas[1]).toBeGreaterThan(0.9);
    expect(areas[0] / areas[1]).toBeLessThan(1.1);

    expect(S.splitModeActive).toBe(false);
    expect(S._splitLockedLayer, 'selection lock released').toBe(null);
    expect(S.splitTool, 'blade resets to line').toBe('line');
  });

  it('split & delete erases the drawn region and keeps the remainder', async () => {
    await import('../engine/heavyLibs.js').then(m => m.ensureHeavyLibs());
    const original = freshSquare('Alpine Block');
    const before = totalArea([original]);

    await executeSplitWithPolygon([ring(WEST_HALF)], true);

    const pieces = S.drawnItems.getLayers();
    expect(pieces, 'only the remainder survives').toHaveLength(1);
    expect(S.drawnItems.hasLayer(original)).toBe(false);
    expect(pieces[0].feature.properties.name).toBe('Alpine Block (trimmed)');

    // The western half is gone, so roughly half the area remains
    const after = totalArea(pieces);
    expect(after).toBeGreaterThan(before * 0.45);
    expect(after).toBeLessThan(before * 0.55);

    expect(S._splitLockedLayer).toBe(null);
    expect(S.splitDeleteMode, 'delete flag cleared').toBe(false);
  });

  it('leaves the shape untouched when the blade does not overlap it', async () => {
    await import('../engine/heavyLibs.js').then(m => m.ensureHeavyLibs());
    const original = freshSquare();

    await executeSplitWithPolygon([ring(FAR_AWAY)], false);

    expect(S.drawnItems.getLayers(), 'nothing was cut').toEqual([original]);
    expect(S.drawnItems.hasLayer(original)).toBe(true);
    expect(S._splitLockedLayer, 'lock released after a no-op').toBe(null);
  });

  it('removes the shape entirely when the blade covers all of it in delete mode', async () => {
    await import('../engine/heavyLibs.js').then(m => m.ensureHeavyLibs());
    const original = freshSquare();
    const covering = [
      [51.4, -0.2],
      [51.4, 0.0],
      [51.6, 0.0],
      [51.6, -0.2],
    ];

    await executeSplitWithPolygon([ring(covering)], true);

    expect(S.drawnItems.getLayers(), 'nothing left to keep').toHaveLength(0);
    expect(S.drawnItems.hasLayer(original)).toBe(false);
  });

  it('closes an unclosed ring before cutting', async () => {
    await import('../engine/heavyLibs.js').then(m => m.ensureHeavyLibs());
    freshSquare();
    // Geoman hands back the ring without repeating the first point
    const open = WEST_HALF.slice(0, 4);

    await executeSplitWithPolygon([ring(open)], false);

    expect(S.drawnItems.getLayers(), 'still split into inside + outside').toHaveLength(2);
  });

  it('only ever cuts the pre-selected region, never another shape', async () => {
    await import('../engine/heavyLibs.js').then(m => m.ensureHeavyLibs());
    const locked = freshSquare('Locked');
    // A second shape sitting under the same blade, selected after the lock
    const other = L.polygon(ring(SQUARE), { color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 1, weight: 0 });
    other.feature = { type: 'Feature', properties: { name: 'Other' } };
    S.drawnItems.addLayer(other);

    await executeSplitWithPolygon([ring(WEST_HALF)], false);

    const names = S.drawnItems.getLayers().map(l => l.feature.properties.name);
    expect(names, 'the locked shape was cut').toContain('Locked (inside)');
    expect(names, 'the locked shape was cut').toContain('Locked (outside)');
    expect(names, 'the other shape is untouched').toContain('Other');
    expect(S.drawnItems.hasLayer(locked), 'original locked shape replaced').toBe(false);
    expect(S.drawnItems.hasLayer(other), 'other shape still intact').toBe(true);
  });
});
