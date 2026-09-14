/**
 * Logic tests for everything that does not need a browser: projection maths,
 * GeoJSON in/out, the store (including undo coalescing) and the image-pyramid
 * level picker that keeps image fills crisp at every zoom level.
 *
 * Run with:  node tests/logic.test.mjs
 */

import assert from 'node:assert/strict';

import * as geo from '../src/core/geo.js';
import { clamp, hexToRgb, withAlpha, uid } from '../src/core/util.js';
import {
  parseGeoJSON, toFeatureCollection, normalizeGeometry, defaultStyle,
  normalizeStyle, styleFromProperties, styleToProperties, normalizeImageFill,
  featureName, dashArrayToKey,
} from '../src/core/geojson.js';
import { Store, mergeStyle, shiftGeometry } from '../src/core/store.js';
import { pickLevel } from '../src/render/pyramid.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

const approx = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));

/* ------------------------------------------------------------------ geo */

test('longitude projection round-trips', () => {
  for (const lng of [-180, -121.5, -0.0001, 0, 13.4, 105.85, 180]) {
    assert.ok(approx(geo.unitXToLng(geo.lngToUnitX(lng)), lng, 1e-9));
  }
});

test('latitude projection round-trips', () => {
  for (const lat of [-85, -45.5, -0.001, 0, 21.03, 51.5, 85]) {
    assert.ok(approx(geo.unitYToLat(geo.latToUnitY(lat)), lat, 1e-9));
  }
});

test('equator sits at the middle of the world', () => {
  assert.ok(approx(geo.latToUnitY(0), 0.5, 1e-12));
  assert.ok(approx(geo.lngToUnitX(0), 0.5, 1e-12));
});

test('latitude is clamped to the Mercator limit', () => {
  assert.equal(geo.latToUnitY(90), geo.latToUnitY(geo.MAX_LAT));
  assert.equal(geo.latToUnitY(-90), geo.latToUnitY(-geo.MAX_LAT));
});

test('ground resolution at zoom 0 is ~156.5 km per pixel', () => {
  assert.ok(approx(geo.metersPerPixel(0, 0), 156543.03, 1e-6));
  assert.ok(approx(geo.metersPerPixel(1, 0), 156543.03 / 2, 1e-6));
  // Shrinks with latitude.
  assert.ok(approx(geo.metersPerPixel(3, 60), geo.metersPerPixel(3, 0) * 0.5, 1e-6));
});

test('camera matrix projects and unprojects symmetrically', () => {
  const m = geo.cameraMatrix({ center: { lng: 10, lat: 45 }, zoom: 6 }, 800, 600);
  const p = geo.projectPoint(m, 12.5, 47.25);
  const back = geo.unprojectPoint(m, p.x, p.y);
  assert.ok(approx(back.lng, 12.5, 1e-9));
  assert.ok(approx(back.lat, 47.25, 1e-9));
});

test('the map centre lands in the middle of the viewport', () => {
  const m = geo.cameraMatrix({ center: { lng: -33.9, lat: 18.2 }, zoom: 4.5 }, 1024, 768);
  const p = geo.projectPoint(m, -33.9, 18.2);
  assert.ok(approx(p.x, 512, 1e-6));
  assert.ok(approx(p.y, 384, 1e-6));
});

test('haversine: London to Paris is ~343 km', () => {
  const d = geo.haversine([-0.1276, 51.5072], [2.3522, 48.8566]);
  assert.ok(Math.abs(d - 343000) < 3000, `got ${d}`);
});

test('ring area of a 1° box at the equator is ~12 300 km²', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const area = geo.ringArea(ring);
  assert.ok(Math.abs(area - 1.23e10) / 1.23e10 < 0.02, `got ${area}`);
});

test('holes subtract from polygon area', () => {
  const outer = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  const hole = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]];
  const full = geo.polygonArea([outer]);
  const withHole = geo.polygonArea([outer, hole]);
  assert.ok(withHole < full);
  assert.ok(approx(full - withHole, geo.ringArea(hole), 1e-9));
});

test('ring area does not depend on winding order', () => {
  const cw = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const ccw = [...cw].reverse();
  assert.ok(approx(geo.ringArea(cw), geo.ringArea(ccw), 1e-9));
});

test('point in ring', () => {
  const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(geo.pointInRing({ x: 5, y: 5 }, ring), true);
  assert.equal(geo.pointInRing({ x: 15, y: 5 }, ring), false);
});

test('point in polygon respects holes', () => {
  const outer = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const hole = [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }];
  assert.equal(geo.pointInPolygonRings({ x: 5, y: 5 }, [outer, hole]), false);
  assert.equal(geo.pointInPolygonRings({ x: 2, y: 2 }, [outer, hole]), true);
});

test('polygon centroid of a square is its centre', () => {
  const c = geo.polygonCentroid([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
  assert.ok(approx(c.x, 2, 1e-9) && approx(c.y, 2, 1e-9));
});

test('centroid falls back to the vertex mean for degenerate rings', () => {
  const c = geo.polygonCentroid([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }]);
  assert.ok(approx(c.x, 2, 1e-9));
});

test('distance to segment', () => {
  const a = { x: 0, y: 0 }, b = { x: 10, y: 0 };
  assert.ok(approx(geo.distToSegmentSq({ x: 5, y: 3 }, a, b), 9, 1e-9));
  assert.ok(approx(geo.distToSegmentSq({ x: -4, y: 0 }, a, b), 16, 1e-9));
  // A zero-length segment degrades to a point distance.
  assert.ok(approx(geo.distToSegmentSq({ x: 3, y: 0 }, a, a), 9, 1e-9));
  assert.ok(approx(geo.distToSegmentSq({ x: 0, y: 0 }, a, a), 0, 1e-9));
});

test('bbox and centre of a geometry', () => {
  const b = geo.bboxOfGeometry({ type: 'LineString', coordinates: [[-5, 10], [7, -2], [0, 3]] });
  assert.deepEqual(b, { minLng: -5, minLat: -2, maxLng: 7, maxLat: 10 });
  assert.deepEqual(geo.centerOfBBox(b), { lng: 1, lat: 4 });
});

test('bbox of an empty geometry is null', () => {
  assert.equal(geo.bboxOfGeometry({ type: 'Point', coordinates: [] }), null);
  assert.equal(geo.bboxOfFeatures([]), null);
});

test('world-copy snapping keeps date-line shapes next to the camera', () => {
  const m = geo.cameraMatrix({ center: { lng: 179.9, lat: 0 }, zoom: 4 }, 900, 500);
  const near = geo.projectWrapped(m, -179.9, 0, 179.9);   // 0.2° across the line
  const far = geo.projectPoint(m, -179.9, 0);
  assert.ok(Math.abs(near.x - m.width / 2) < 60, `snapped x=${near.x}`);
  assert.ok(Math.abs(far.x - m.width / 2) > 1000, `unsnapped x=${far.x}`);
});

test('rectPositions builds a closed ring', () => {
  const rings = geo.rectPositions({ lng: 0, lat: 0 }, { lng: 2, lat: 1 });
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  assert.deepEqual(rings[0][0], rings[0][4]);
});

/* --------------------------------------------------------- ring orientation */

test('ringSignedArea detects winding direction', () => {
  const ccw = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  assert.ok(geo.ringSignedArea(ccw) > 0);
  assert.ok(geo.isCounterClockwise(ccw));
  assert.ok(geo.ringSignedArea([...ccw].reverse()) < 0);
});

test('orientRings makes exteriors CCW and holes CW', () => {
  const cwOuter = [[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]];          // clockwise
  const ccwHole = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]];
  const geometry = geo.orientRings({ type: 'Polygon', coordinates: [cwOuter, ccwHole] });
  assert.ok(geo.ringSignedArea(geometry.coordinates[0]) > 0, 'exterior should be CCW');
  assert.ok(geo.ringSignedArea(geometry.coordinates[1]) < 0, 'hole should be CW');
  // Reversing keeps the ring closed.
  assert.deepEqual(geometry.coordinates[0][0], geometry.coordinates[0][4]);
});

test('orientRings leaves correct winding alone and handles multi-polygons', () => {
  const ccw = [[0, 0], [1, 0], [1, 1], [0, 0 + 1], [0, 0]];
  const geometry = geo.orientRings({ type: 'MultiPolygon', coordinates: [[ccw]] });
  assert.deepEqual(geometry.coordinates[0][0], ccw);
  assert.equal(geo.orientRings({ type: 'Point', coordinates: [1, 2] }).type, 'Point');
  assert.equal(geo.orientRings(null), null);
});

test('createFeature orients imported clockwise polygons', async () => {
  const { features } = parseGeoJSON(JSON.stringify({
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
  }));
  assert.ok(geo.ringSignedArea(features[0].geometry.coordinates[0]) > 0);
});

test('wrapLng keeps longitudes in range', () => {
  assert.equal(geo.wrapLng(180), -180);
  assert.equal(geo.wrapLng(-180), -180);
  assert.equal(geo.wrapLng(190), -170);
  assert.equal(geo.wrapLng(-190), 170);
  assert.equal(geo.wrapLng(12.5), 12.5);
  assert.equal(geo.wrapLng(540), -180);
});

/* ----------------------------------------------------------------- util */

test('hexToRgb and withAlpha', () => {
  assert.deepEqual(hexToRgb('#ff8800'), { r: 255, g: 136, b: 0 });
  assert.deepEqual(hexToRgb('#f80'), { r: 255, g: 136, b: 0 });
  assert.deepEqual(hexToRgb('nope'), { r: 0, g: 0, b: 0 });
  assert.equal(withAlpha('#000000', 0.5), 'rgba(0,0,0,0.5)');
});

test('clamp and uid', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.notEqual(uid(), uid());
});

/* -------------------------------------------------------------- geojson */

test('normalizeGeometry closes polygon rings and drops junk', () => {
  const g = normalizeGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] });
  assert.equal(g.coordinates[0].length, 4);
  assert.deepEqual(g.coordinates[0][0], g.coordinates[0][3]);

  assert.equal(normalizeGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }), null);
  assert.equal(normalizeGeometry({ type: 'Banana', coordinates: [] }), null);
  assert.equal(normalizeGeometry(null), null);
});

test('normalizeGeometry ignores extra dimensions and bad numbers', () => {
  const g = normalizeGeometry({ type: 'LineString', coordinates: [[1, 2, 99], ['x', 3], [4, NaN], [5, 6]] });
  assert.deepEqual(g.coordinates, [[1, 2], [5, 6]]);
});

test('parseGeoJSON accepts a FeatureCollection', () => {
  const input = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [1, 2] } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
    ],
  });
  const { features, errors, skipped } = parseGeoJSON(input);
  assert.equal(features.length, 2);
  assert.equal(skipped, 0);
  assert.equal(errors.length, 0);
  assert.equal(featureName(features[0]), 'A');
  assert.equal(features[0].style.fill, '#2f6df6');
});

test('parseGeoJSON accepts bare geometries, arrays and GeometryCollections', () => {
  assert.equal(parseGeoJSON(JSON.stringify({ type: 'Point', coordinates: [3, 4] })).features.length, 1);
  assert.equal(parseGeoJSON(JSON.stringify([{ type: 'Point', coordinates: [3, 4] }])).features.length, 1);
  const gc = parseGeoJSON(JSON.stringify({
    type: 'GeometryCollection',
    geometries: [{ type: 'Point', coordinates: [0, 0] }, { type: 'Point', coordinates: [1, 1] }],
  }));
  assert.equal(gc.features.length, 2);
});

test('parseGeoJSON reads newline-delimited features', () => {
  const nd = '{"type":"Feature","geometry":{"type":"Point","coordinates":[0,0]},"properties":{}}\n'
    + '{"type":"Feature","geometry":{"type":"Point","coordinates":[1,1]},"properties":{}}';
  const { features } = parseGeoJSON(nd);
  assert.equal(features.length, 2);
});

test('parseGeoJSON reports broken input', () => {
  const { features, errors } = parseGeoJSON('{ not json');
  assert.equal(features.length, 0);
  assert.ok(errors.length > 0);
});

test('parseGeoJSON skips null geometries but keeps the rest', () => {
  const { features, skipped } = parseGeoJSON(JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: null, properties: {} },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: {} },
    ],
  }));
  assert.equal(features.length, 1);
  assert.equal(skipped, 1);
});

test('imported simplestyle properties become the runtime style', () => {
  const { features } = parseGeoJSON(JSON.stringify({
    type: 'Feature',
    properties: { fill: '#ff0000', 'fill-opacity': 0.5, stroke: '#00ff00', 'stroke-width': 5, 'stroke-dasharray': '7,5' },
    geometry: { type: 'Point', coordinates: [0, 0] },
  }));
  const style = features[0].style;
  assert.equal(style.fill, '#ff0000');
  assert.equal(style['fill-opacity'], 0.5);
  assert.equal(style.stroke, '#00ff00');
  assert.equal(style['stroke-width'], 5);
  assert.equal(style['stroke-dash'], 'dashed');
});

test('style survives an export/import round trip', () => {
  const store = new Store();
  const feature = store.addGeometry({ type: 'Point', coordinates: [1, 2] });
  store.select(feature.id);
  store.setStyle({ fill: '#123456', 'fill-opacity': 0.75, 'stroke-width': 4, label: { show: true, size: 15 } });

  const json = toFeatureCollection(store.features, { includeStyle: true, indent: false });
  const parsed = parseGeoJSON(json);
  const style = parsed.features[0].style;
  assert.equal(style.fill, '#123456');
  assert.equal(style['fill-opacity'], 0.75);
  assert.equal(style['stroke-width'], 4);
  assert.equal(style.label.show, true);
  assert.equal(style.label.size, 15);
});

test('image fills survive an export/import round trip', () => {
  const image = normalizeImageFill({
    url: 'https://example.org/flag.png', source: 'commons', layout: 'tile',
    anchor: 'ground', size: 5000, rotation: 30, opacity: 0.8, attribution: 'Someone · CC BY 4.0',
  });
  const props = styleToProperties(normalizeStyle({ 'fill-mode': 'commons', 'image-fill': image }), true);
  const back = styleFromProperties(props);
  assert.equal(back['fill-mode'], 'commons');
  assert.equal(back['image-fill'].layout, 'tile');
  assert.equal(back['image-fill'].anchor, 'ground');
  assert.equal(back['image-fill'].unit, 'm');
  assert.equal(back['image-fill'].size, 5000);
  assert.equal(back['image-fill'].rotation, 30);
  assert.equal(back['image-fill'].attribution, 'Someone · CC BY 4.0');
});

test('unshareable image URLs are stripped on export', () => {
  const style = defaultStyle();
  style['fill-mode'] = 'image';
  style['image-fill'].url = 'blob:https://local/abc-123';
  style['image-fill'].source = 'upload';
  const json = toFeatureCollection([{
    type: 'Feature', id: 'x', properties: { name: 'n' },
    geometry: { type: 'Point', coordinates: [0, 0] }, style,
  }]);
  assert.ok(!json.includes('blob:'));
  assert.ok(json.includes('"url": null'));
});

test('export can omit styling', () => {
  const store = new Store();
  store.addGeometry({ type: 'Point', coordinates: [1, 2] });
  const json = toFeatureCollection(store.features, { includeStyle: false });
  assert.ok(!json.includes('"stroke"'));
  assert.ok(json.includes('"FeatureCollection"'));
});

test('export rounds coordinates', () => {
  const store = new Store();
  store.addGeometry({ type: 'Point', coordinates: [1.1234567891, 2.99999999999] });
  const parsed = JSON.parse(toFeatureCollection(store.features));
  const [lng, lat] = parsed.features[0].geometry.coordinates;
  assert.equal(String(lng).split('.')[1].length, 7);
  assert.ok(Math.abs(lat - 3) < 1e-7);
});

test('dash arrays map to names and back', () => {
  assert.equal(dashArrayToKey([7, 5]), 'dashed');
  assert.equal(dashArrayToKey([1.6, 3.4]), 'dotted');
  assert.equal(dashArrayToKey([]), 'solid');
  assert.equal(dashArrayToKey([2, 2]), 'dotted');
  assert.equal(dashArrayToKey([12, 6]), 'dashed');
});

test('normalizeStyle clamps out-of-range values', () => {
  const s = normalizeStyle({ 'fill-opacity': 5, 'stroke-width': -3, 'stroke-opacity': NaN, 'fill-mode': 'weird' });
  assert.equal(s['fill-opacity'], 1);
  assert.equal(s['stroke-width'], 0);
  assert.equal(s['stroke-opacity'], 1);
  assert.equal(s['fill-mode'], 'solid');
});

/* ---------------------------------------------------------------- store */

test('a new store is empty and has no selection', () => {
  const store = new Store();
  assert.equal(store.count, 0);
  assert.equal(store.selectionSize(), 0);
  assert.equal(store.styleScope(), 'default');
});

test('adding a feature selects it', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  assert.equal(store.count, 1);
  assert.deepEqual([...store.selection], [f.id]);
  assert.equal(store.styleScope(), 'single');
});

test('new features inherit the default style, not a preset', () => {
  const store = new Store();
  store.defaultStyle = mergeStyle(store.defaultStyle, { fill: '#ff0000', 'fill-opacity': 0.9 });
  const f = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  assert.equal(f.style.fill, '#ff0000');
  assert.equal(f.style['fill-opacity'], 0.9);
});

test('setStyle targets the selection, everything, or the defaults', () => {
  const store = new Store();
  const a = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  const b = store.addGeometry({ type: 'Point', coordinates: [1, 1] });

  store.select(a.id);
  store.setStyle({ fill: '#00ff00' });
  assert.equal(store.byId(a.id).style.fill, '#00ff00');
  assert.equal(store.byId(b.id).style.fill, '#2f6df6');

  store.clearSelection();
  store.setStyle({ stroke: '#111111' });         // scope = default
  assert.equal(store.defaultStyle.stroke, '#111111');
  assert.equal(store.byId(a.id).style.stroke, '#2f6df6');

  store.setStyle({ stroke: '#222222' }, 'all');
  assert.equal(store.byId(a.id).style.stroke, '#222222');
  assert.equal(store.byId(b.id).style.stroke, '#222222');
});

test('undo/redo restores geometry and selection', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  store.undo();
  assert.equal(store.count, 0);
  store.redo();
  assert.equal(store.count, 1);
  assert.ok(store.selection.has(f.id));
});

test('rapid edits with the same key collapse into one undo step', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  const before = store._history.length;
  for (let i = 0; i < 10; i++) store.mutate('slider', () => { f.style = mergeStyle(f.style, { 'fill-opacity': i / 10 }); });
  assert.equal(store._history.length, before + 1);
  store.undo();
  // Undo swaps in restored objects, so read back through the store.
  assert.ok(Math.abs(store.byId(f.id).style['fill-opacity'] - 0.25) < 1e-9);
});

test('a discrete edit is its own undo step even inside the burst window', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] });
  const before = store._history.length;
  // Same key, back to back — but each click must undo on its own.
  for (const lng of [1, 0.5]) {
    store.mutate('cut-sea', () => {
      f.geometry = { type: 'Polygon', coordinates: [[[0, 0], [lng, 0], [lng, 2], [0, 2], [0, 0]]] };
    }, { discrete: true });
  }
  assert.equal(store._history.length, before + 2);
  store.undo();
  assert.equal(store.byId(f.id).geometry.coordinates[0][1][0], 1, 'one cut undone');
  store.undo();
  assert.equal(store.byId(f.id).geometry.coordinates[0][1][0], 2, 'back to what was drawn');
});

test('edits with different keys stay separate undo steps', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  store.mutate('a', () => { f.style = mergeStyle(f.style, { fill: '#ff0000' }); });
  store.mutate('b', () => { f.style = mergeStyle(f.style, { fill: '#00ff00' }); });
  store.undo();
  assert.equal(store.byId(f.id).style.fill, '#ff0000');
  store.undo();
  assert.ok(store.byId(f.id).style.fill !== '#ff0000');
});

test('beginHistory + applyLive gives one undo step for a whole drag', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  const before = store._history.length;
  store.beginHistory('move');
  for (let i = 1; i <= 20; i++) store.applyLive(() => { f.geometry.coordinates = [i, i]; });
  assert.equal(store._history.length, before + 1);
  assert.deepEqual(f.geometry.coordinates, [20, 20]);
  store.undo();
  assert.deepEqual(store.byId(f.id).geometry.coordinates, [0, 0]);
});

test('translateSelected moves every position', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
  store.translateSelected(2, 3);
  assert.deepEqual(f.geometry.coordinates[0][0], [2, 3]);
  assert.deepEqual(f.geometry.coordinates[0][1], [3, 3]);
});

test('shiftGeometry handles nested multi-geometries', () => {
  const g = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 1], [0, 0]]]] };
  shiftGeometry(g, 1, -1);
  assert.deepEqual(g.coordinates[0][0][1], [2, 0]);
});

test('reorder changes the draw order only within bounds', () => {
  const store = new Store();
  const a = store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  const b = store.addGeometry({ type: 'Point', coordinates: [1, 1] });
  const c = store.addGeometry({ type: 'Point', coordinates: [2, 2] });
  store.reorder(a.id, 1);
  assert.deepEqual(store.features.map((f) => f.id), [b.id, a.id, c.id]);
  store.reorder(c.id, -5);
  assert.deepEqual(store.features.map((f) => f.id), [c.id, b.id, a.id]);
});

test('duplicate copies geometry and style', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Point', coordinates: [4, 5] });
  store.setStyle({ fill: '#abcdef' });
  const [copy] = store.duplicateSelected();
  assert.notEqual(copy.id, f.id);
  assert.deepEqual(copy.geometry.coordinates, [4, 5]);
  assert.equal(copy.style.fill, '#abcdef');
});

test('removeSelected and clearAll leave the store usable', () => {
  const store = new Store();
  store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  store.addGeometry({ type: 'Point', coordinates: [1, 1] });
  assert.equal(store.removeSelected(), 1);
  store.select(store.features.map((f) => f.id));
  store.clearAll();
  assert.equal(store.count, 0);
  assert.equal(store.selectionSize(), 0);
});

test('setProperty drops empty values', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Point', coordinates: [0, 0] }, null, { name: 'x' });
  store.setProperty(f.id, 'population', 42);
  assert.equal(store.byId(f.id).properties.population, 42);
  store.setProperty(f.id, 'population', '');
  assert.equal('population' in store.byId(f.id).properties, false);
});

test('serialize/hydrate round-trips the workspace', () => {
  const store = new Store();
  const f = store.addGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
  store.setProperty(f.id, 'name', 'Homeland');
  store.setStyle({ 'fill-mode': 'image', 'image-fill': { url: 'https://x/y.png', layout: 'stretch' } });

  const data = JSON.parse(JSON.stringify(store.serialize({ center: { lng: 1, lat: 2 }, zoom: 5 })));
  const next = new Store();
  assert.ok(next.hydrate(data));
  assert.equal(next.count, 1);
  const restored = next.features[0];
  assert.equal(restored.properties.name, 'Homeland');
  assert.equal(restored.style['fill-mode'], 'image');
  assert.equal(restored.style['image-fill'].layout, 'stretch');
  assert.equal(next.defaultStyle.fill, '#2f6df6');
});

test('import replaces or merges', () => {
  const store = new Store();
  store.addGeometry({ type: 'Point', coordinates: [0, 0] });
  const { features } = parseGeoJSON(JSON.stringify({ type: 'Point', coordinates: [9, 9] }));
  store.load(features, { replace: false });
  assert.equal(store.count, 2);
  store.load(features, { replace: true });
  assert.equal(store.count, 1);
});

/* ------------------------------------------------------- pyramid levels */

/** Build a stand-in pyramid: level widths 1024, 512, … 1. */
function fakePyramid(baseWidth = 1024) {
  const levels = [];
  let w = baseWidth;
  while (w >= 1) {
    levels.push({ width: w, height: Math.max(1, Math.round(w * 0.6)) });
    if (w === 1) break;
    w = Math.max(1, Math.floor(w / 2));
  }
  return { levels, base: { w: baseWidth, h: levels[0].height }, aspect: 0.6, avg: { r: 1, g: 2, b: 3, a: 1 } };
}

test('a 1:1 tile uses the base level', () => {
  const pyr = fakePyramid(1024);
  assert.equal(pickLevel(pyr, 1024, 1).level, 0);
});

test('the level follows the on-screen size', () => {
  const pyr = fakePyramid(1024);
  assert.equal(pickLevel(pyr, 512, 1).level, 1);
  assert.equal(pickLevel(pyr, 256, 1).level, 2);
  assert.equal(pickLevel(pyr, 64, 1).level, 4);
  assert.equal(pickLevel(pyr, 8, 1).level, 7);
});

test('devicePixelRatio is accounted for', () => {
  const pyr = fakePyramid(1024);
  // 64 CSS px on a 2x display needs 128 device px → one level shallower.
  assert.equal(pickLevel(pyr, 64, 2).level, 3);
  assert.equal(pickLevel(pyr, 64, 3).level, 2);
});

test('never upscales past the base level (no mushy zoom-in)', () => {
  const pyr = fakePyramid(1024);
  for (const size of [1025, 2000, 9000, 1e6]) {
    assert.equal(pickLevel(pyr, size, 1).level, 0);
  }
  assert.equal(pickLevel(pyr, 800, 3).level, 0);   // 2400 device px, still level 0
});

test('never runs off the deep end when zoomed far out', () => {
  const pyr = fakePyramid(1024);
  const deepest = pyr.levels.length - 1;
  for (const size of [0.5, 0.05, 1e-6]) {
    const { level } = pickLevel(pyr, size, 1);
    assert.ok(level >= deepest - 1 && level <= deepest, `level ${level} for ${size}`);
  }
});

test('level selection is monotonic as the tile shrinks', () => {
  const pyr = fakePyramid(2048);
  let previous = -1;
  for (let size = 4096; size >= 0.25; size /= 1.25) {
    const { level } = pickLevel(pyr, size, 1);
    assert.ok(level >= previous, `level went backwards at ${size}px`);
    previous = level;
  }
});

test('the chosen level stays within 2x of the target size (the anti-blur invariant)', () => {
  const pyr = fakePyramid(1024);
  for (const dpr of [1, 2, 3]) {
    for (let size = 1024; size >= 2; size /= 1.3) {
      const { level, devicePx } = pickLevel(pyr, size, dpr);
      const texels = pyr.levels[level].width;
      const ratio = devicePx / texels;
      if (devicePx > pyr.base.w) {
        // Asking for more resolution than the source has: stay on the base
        // level rather than inventing pixels (the renderer's noUpscale rule).
        assert.equal(level, 0, `dpr=${dpr} size=${size.toFixed(2)} should clamp to level 0`);
        continue;
      }
      assert.ok(ratio <= 2.0001 && ratio >= 0.4999,
        `dpr=${dpr} size=${size.toFixed(2)} level=${level} texels=${texels} ratio=${ratio.toFixed(3)}`);
    }
  }
});

test('ground-anchored tiles shrink by exactly 2x per zoom level', () => {
  // The renderer converts a ground size (metres) to pixels with metersPerPixel;
  // zooming out one step must halve the pixel size and step one level deeper.
  const pyr = fakePyramid(1024);
  const metres = 20000;
  const zooms = [8, 7, 6, 5, 4];
  const sizes = zooms.map((z) => metres / geo.metersPerPixel(z, 0));
  const levels = sizes.map((s) => pickLevel(pyr, s, 1).level);
  for (let i = 1; i < levels.length; i++) assert.equal(levels[i] - levels[i - 1], 1);
});

/* ---------------------------------------------------------------- report */

if (failures.length) {
  console.error(`\n${failures.length} of ${passed + failures.length} tests failed:\n`);
  for (const { name, err } of failures) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message.split('\n').slice(0, 6).join('\n    ')}`);
  }
  process.exit(1);
}
console.log(`\n✓ ${passed} logic tests passed (projection, geojson, store, pyramid levels)\n`);
