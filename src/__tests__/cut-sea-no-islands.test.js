// Functional tests for Cut Sea "no islands" mode.
//
// Cut Sea intersects a drawn polygon with the coastline dataset and rebuilds the
// shape from the land it found. By default every island inside the drawn area is
// preserved and united with the mainland into one MultiPolygon; with no-islands
// mode on, only the largest landmass (the mainland) survives.
//
// Real Leaflet map + real turf + synthetic coastline fixtures, so this checks the
// geometry decisions rather than mocks.
import { describe, it, expect, beforeEach } from 'vitest';

import './setup.js';
import L from 'leaflet';
import { sharedMap, sharedDrawnItems } from './shared-map.js';
import { S } from '../engine/state.js';
import { computeGeoBbox } from '../lib/util.js';
import {
  cutSeaFromPolygon,
  cutSeaNoIslandsNow,
  toggleCutSeaNoIslands,
  triggerCutSeaNow,
} from '../engine/merge.js';

// ---- synthetic coastline fixtures -----------------------------------------
// A "mainland" and a separate "island", both inside the drawn area below.
const ring = (pts) => {
  const coords = pts.map(([lat, lng]) => [lng, lat]);
  coords.push(coords[0]); // closed ring
  return coords;
};

function landFeature(pts, isContinent) {
  const f = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring(pts)] },
  };
  f.bbox = computeGeoBbox(f.geometry);
  f._isContinent = isContinent;
  return f;
}

// Mainland: a big block, treated as continent-derived like real Natural Earth data
const MAINLAND = landFeature([
  [51.40, -0.30],
  [51.40, -0.10],
  [51.58, -0.10],
  [51.58, -0.30],
], true);

// Island: small, clearly separated from the mainland, non-continent (so the
// default path keeps it unconditionally)
const ISLAND = landFeature([
  [51.45, -0.08],
  [51.45, -0.05],
  [51.48, -0.05],
  [51.48, -0.08],
], false);

// Second island further east, also non-continent
const ISLAND_2 = landFeature([
  [51.52, -0.04],
  [51.52, -0.02],
  [51.54, -0.02],
  [51.54, -0.04],
], false);

// Drawn polygon covering the mainland and both islands
const DRAWN = [
  [51.38, -0.32],
  [51.38, -0.01],
  [51.60, -0.01],
  [51.60, -0.32],
];

function drawnLayer(name = 'Coast Study') {
  const layer = L.polygon(DRAWN.map(([lat, lng]) => L.latLng(lat, lng)), {
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 1,
    weight: 0,
  });
  layer.feature = { type: 'Feature', properties: { name } };
  S.drawnItems.addLayer(layer);
  S.activeSelectedLayer = layer;
  return layer;
}

function partCount(layer) {
  const g = layer.toGeoJSON().geometry;
  return g.type === 'MultiPolygon' ? g.coordinates.length : 1;
}

function areaOf(layer) {
  return window.turf.area(layer.toGeoJSON());
}

describe('cut sea — no islands mode', () => {
  beforeEach(async () => {
    sharedMap();
    sharedDrawnItems([]);
    await import('../engine/heavyLibs.js').then((m) => m.ensureHeavyLibs());
    // Synthetic coastline dataset — keeps the test offline
    S.landFeaturesList = [MAINLAND, ISLAND, ISLAND_2];
    S.cutSeaNoIslands = false;
    S.autoCutSeaEnabled = false;
    S.splitModeActive = false;
    S.countryLayers = [];
    S.countryLayerById = {};
  });

  it('default mode keeps the mainland and every island in one region', async () => {
    const drawn = drawnLayer();
    const result = await cutSeaFromPolygon(drawn);

    expect(result, 'cut returns the rebuilt layer').toBeTruthy();
    expect(S.drawnItems.hasLayer(drawn), 'the drawn polygon is replaced').toBe(false);
    expect(S.drawnItems.getLayers()).toHaveLength(1);

    expect(partCount(result), 'mainland + 2 islands united').toBe(3);
    expect(result.feature.properties.islandCount).toBe(2);
    expect(result.feature.properties.isUnifiedIslandRegion).toBe(true);
    expect(result.feature.properties.islandsRemoved).toBe(0);
    expect(result.feature.properties.noIslandsMode).toBe(false);
    expect(result.feature.properties.name, 'name preserved').toBe('Coast Study');
  });

  it('no-islands option keeps only the mainland', async () => {
    const drawn = drawnLayer();
    const result = await cutSeaFromPolygon(drawn, { noIslands: true });

    expect(result).toBeTruthy();
    expect(S.drawnItems.getLayers()).toHaveLength(1);
    expect(partCount(result), 'mainland only — no island parts').toBe(1);
    expect(result.toGeoJSON().geometry.type).toBe('Polygon');
    expect(result.feature.properties.islandCount).toBe(0);
    expect(result.feature.properties.isUnifiedIslandRegion).toBe(false);
    expect(result.feature.properties.islandsRemoved, 'both islands reported as dropped').toBe(2);
    expect(result.feature.properties.noIslandsMode).toBe(true);
  });

  it('the kept mainland is the largest landmass, not an island', async () => {
    const drawn = drawnLayer();
    const result = await cutSeaFromPolygon(drawn, { noIslands: true });

    const kept = areaOf(result);
    const mainlandArea = window.turf.area({ type: 'Feature', properties: {}, geometry: MAINLAND.geometry });
    // The mainland is clipped by the drawn box, so the result is at most the
    // mainland and far bigger than either island.
    expect(kept).toBeLessThanOrEqual(mainlandArea * 1.001);
    const islandArea = window.turf.area({ type: 'Feature', properties: {}, geometry: ISLAND.geometry });
    expect(kept).toBeGreaterThan(islandArea * 5);
  });

  it('the global toggle drives Cut Sea without an explicit option', async () => {
    S.cutSeaNoIslands = true;
    const drawn = drawnLayer();
    const result = await cutSeaFromPolygon(drawn);

    expect(partCount(result), 'toggle alone is enough').toBe(1);
    expect(result.feature.properties.noIslandsMode).toBe(true);
    expect(result.feature.properties.islandsRemoved).toBe(2);
  });

  it('an explicit option overrides the global toggle in both directions', async () => {
    // Toggle says drop islands, but the caller asks to keep them
    S.cutSeaNoIslands = true;
    let result = await cutSeaFromPolygon(drawnLayer(), { noIslands: false });
    expect(partCount(result), 'explicit false wins').toBe(3);

    // Toggle says keep islands, but the caller asks to drop them
    S.cutSeaNoIslands = false;
    result = await cutSeaFromPolygon(drawnLayer('Second'), { noIslands: true });
    expect(partCount(result), 'explicit true wins').toBe(1);
  });

  it('the one-shot action drops islands and leaves the toggle untouched', async () => {
    S.cutSeaNoIslands = false;
    drawnLayer('One Shot');

    const result = await cutSeaNoIslandsNow();

    expect(result).toBeTruthy();
    expect(partCount(result), 'mainland only').toBe(1);
    expect(result.feature.properties.islandsRemoved).toBe(2);
    expect(S.cutSeaNoIslands, 'toggle not flipped by a one-shot cut').toBe(false);
  });

  it('Auto-Cut / triggerCutSeaNow respects the toggle', async () => {
    S.cutSeaNoIslands = true;
    drawnLayer('Triggered');

    await triggerCutSeaNow();

    const layers = S.drawnItems.getLayers();
    expect(layers).toHaveLength(1);
    expect(partCount(layers[0]), 'triggered cut drops islands').toBe(1);
    expect(layers[0].feature.properties.islandsRemoved).toBe(2);
  });

  it('toggleCutSeaNoIslands flips the flag and syncs the UI pills', () => {
    // Minimal DOM the updater writes into
    document.body.innerHTML = `
      <span id="text-islands-header">ON</span>
      <span id="indicator-islands-header"></span>
      <span id="text-islands-mobile">ON</span>
      <span id="indicator-islands-mobile"></span>
      <button id="btn-islands-mobile"></button>
      <span id="status-cut-no-islands">OFF</span>
      <input type="checkbox" id="toggle-cut-no-islands" />
    `;

    expect(S.cutSeaNoIslands).toBe(false);
    toggleCutSeaNoIslands();

    expect(S.cutSeaNoIslands).toBe(true);
    expect(document.getElementById('text-islands-header').textContent).toBe('OFF');
    expect(document.getElementById('text-islands-mobile').textContent).toBe('OFF');
    expect(document.getElementById('status-cut-no-islands').textContent).toBe('ON');
    expect(document.getElementById('toggle-cut-no-islands').checked).toBe(true);

    toggleCutSeaNoIslands();
    expect(S.cutSeaNoIslands).toBe(false);
    expect(document.getElementById('text-islands-header').textContent).toBe('ON');
    expect(document.getElementById('toggle-cut-no-islands').checked).toBe(false);
  });

  it('a shape with no islands in range is unchanged by the mode', async () => {
    // Only the mainland in the dataset — nothing to drop
    S.landFeaturesList = [MAINLAND];
    const drawn = drawnLayer('Mainland Only');

    const withIslands = await cutSeaFromPolygon(drawn);
    const partsKept = partCount(withIslands);

    const drawn2 = drawnLayer('Mainland Only 2');
    const withoutIslands = await cutSeaFromPolygon(drawn2, { noIslands: true });

    expect(partsKept).toBe(1);
    expect(partCount(withoutIslands), 'same result either way').toBe(1);
    expect(withoutIslands.feature.properties.islandsRemoved).toBe(0);
  });
});
