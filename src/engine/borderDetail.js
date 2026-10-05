// Split out of the original single-file engine (see legacy/index.html).
// Origin: BORDER DETAILENER (natural fractal roughener)

import L from 'leaflet';
import { S } from './state.js';
import { countCoords, rngFactory } from '../lib/util.js';
import { curveStore } from './constants.js';
import { exitCurveEdgeMode } from './curves.js';
import { onFeatureClick } from './exporters/geojson.js';
import { cleanAndSeparatePolygons } from './merge.js';
import { updateStats } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { showToast } from './uiHelpers.js';

export function randomizeBorderSeed() {
  S.roughenSeed = Math.floor(Math.random() * 1e9);
  const el = document.getElementById('roughen-seed');
  if (el) el.textContent = `seed ${S.roughenSeed}`;
}

export function fractalSplit(a, b, level, amp, persist, rnd, out) {
  if (level <= 0) return;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) return; // don't roughen micro-edges
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  const disp = (rnd() * 2 - 1) * amp; // +X and −X → zero-mean
  const m = {
    x: mx - dy / len * disp,
    y: my + dx / len * disp
  };
  fractalSplit(a, m, level - 1, amp * persist, persist, rnd, out);
  out.push(m);
  fractalSplit(m, b, level - 1, amp * persist, persist, rnd, out);
}

export function roughenPathPx(pxPath, ampPx, persist, depth, rnd, budget) {
  const out = [];
  for (let i = 0; i < pxPath.length - 1; i++) {
    const a = pxPath[i],
      b = pxPath[i + 1];
    out.push(a);
    if (out.length >= budget) break;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen > 4) {
      const mid = [];
      fractalSplit(a, b, depth, ampPx, persist, rnd, mid);
      for (let k = 0; k < mid.length; k++) {
        out.push(mid[k]);
        if (out.length >= budget) break;
      }
    }
  }
  out.push(pxPath[pxPath.length - 1]);
  return out;
}

export function roughenGeometry(geometry, z, ampPx, persist, depth, seed) {
  const rnd = rngFactory(seed);
  const BUDGET = 9000;
  const toPx = ring => ring.map(c => {
    const p = S.map.project(L.latLng(c[1], c[0]), z);
    return {
      x: p.x,
      y: p.y
    };
  });
  const toLL = ring => ring.map(p => {
    const ll = S.map.unproject(L.point(p.x, p.y), z);
    return [ll.lng, ll.lat];
  });
  const polyRings = rings => rings.map(ring => {
    const isClosed = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
    const closed = isClosed ? ring : ring.concat([ring[0]]);
    return toLL(roughenPathPx(toPx(closed), ampPx, persist, depth, rnd, BUDGET));
  });
  const t = geometry.type;
  if (t === 'Polygon') return {
    type: 'Polygon',
    coordinates: polyRings(geometry.coordinates)
  };
  if (t === 'MultiPolygon') return {
    type: 'MultiPolygon',
    coordinates: geometry.coordinates.map(polyRings)
  };
  if (t === 'LineString') return {
    type: 'LineString',
    coordinates: toLL(roughenPathPx(toPx(geometry.coordinates), ampPx, persist, depth, rnd, BUDGET))
  };
  if (t === 'MultiLineString') return {
    type: 'MultiLineString',
    coordinates: geometry.coordinates.map(l => toLL(roughenPathPx(toPx(l), ampPx, persist, depth, rnd, BUDGET)))
  };
  return geometry;
}

export function applyShapeLockStyle(layer) {
  if (!layer || typeof layer.setStyle !== 'function') return;
  if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
    layer.setStyle({
      opacity: 1,
      fillOpacity: 0,
      weight: (layer.options.weight || 0) > 0 ? layer.options.weight : 3
    });
  } else if (layer instanceof L.Polygon) {
    layer.setStyle({
      weight: 0,
      opacity: 0,
      fillOpacity: 1
    });
  }
}

export function replaceLayerFromFeature(feature, styleOpts) {
  const old = S.activeSelectedLayer;
  if (old) {
    S.drawnItems.removeLayer(old);
    // The curve model is tied to the layer instance — drop it on replace
    if (curveStore.has(old)) curveStore.delete(old);
    if (S.curveModeLayer === old) exitCurveEdgeMode();
  }

  // Ensure geometry is clean and single Polygon
  const cleaned = cleanAndSeparatePolygons(feature);
  const primaryFeat = cleaned.length > 0 ? cleaned[0] : feature;
  const newLayer = L.geoJSON(primaryFeat, {
    style: {
      ...(styleOpts || {})
    }
  }).getLayers()[0];
  if (!newLayer) return null;
  newLayer.feature = {
    type: 'Feature',
    properties: feature.properties || {},
    geometry: primaryFeat.geometry || newLayer.toGeoJSON().geometry
  };
  applyShapeLockStyle(newLayer);
  S.drawnItems.addLayer(newLayer);
  S.activeSelectedLayer = newLayer;
  newLayer.on('click', () => {
    S.activeSelectedLayer = newLayer;
    populateStyleDrawer(newLayer);
    onFeatureClick(newLayer);
  });

  // Add any additional clean disconnected components as separate shapes
  if (cleaned.length > 1) {
    for (let i = 1; i < cleaned.length; i++) {
      const extraLayer = L.geoJSON(cleaned[i], {
        style: {
          ...(styleOpts || {})
        }
      }).getLayers()[0];
      if (extraLayer) {
        extraLayer.feature = {
          type: 'Feature',
          properties: {
            ...(feature.properties || {}),
            name: `${feature.properties?.name || 'Region'} (Part ${i + 1})`
          },
          geometry: cleaned[i].geometry
        };
        applyShapeLockStyle(extraLayer);
        S.drawnItems.addLayer(extraLayer);
        extraLayer.on('click', () => {
          S.activeSelectedLayer = extraLayer;
          populateStyleDrawer(extraLayer);
          onFeatureClick(extraLayer);
        });
      }
    }
  }
  populateStyleDrawer(newLayer);
  updateStats();
  return newLayer;
}

export function applyBorderDetail() {
  const layer = S.activeSelectedLayer;
  if (!layer || !(layer instanceof L.Polyline)) {
    showToast("Select a polygon or line first");
    return;
  }
  const ampPx = parseFloat(document.getElementById('roughen-amp').value);
  const persist = parseFloat(document.getElementById('roughen-persist').value);
  const depth = parseInt(document.getElementById('roughen-depth').value, 10);
  const z = Math.max(2, Math.round(S.map.getZoom()));
  const geo = layer.toGeoJSON();
  if (!geo.geometry || geo.geometry.type === 'Point') {
    showToast("Markers cannot be detailed");
    return;
  }
  if (!S.roughenSnapshot) S.roughenSnapshot = {
    geo,
    style: {
      ...layer.options
    }
  };
  let effDepth = depth;
  const pts = countCoords(geo.geometry.coordinates);
  const maxSegs = 9000 / Math.max(pts - 1, 1);
  if (Math.pow(2, effDepth) > maxSegs) {
    effDepth = Math.max(1, Math.floor(Math.log2(maxSegs)));
  }
  const newGeom = roughenGeometry(geo.geometry, z, ampPx, persist, effDepth, S.roughenSeed);
  const newCount = countCoords(newGeom.coordinates);
  replaceLayerFromFeature({
    type: 'Feature',
    properties: geo.properties || {},
    geometry: newGeom
  }, layer.options);
  showToast(`Border detailed: ${newCount.toLocaleString()} points (intensity ${ampPx}px, seed ${S.roughenSeed})`);
}

export function undoBorderDetail() {
  if (!S.roughenSnapshot) {
    showToast("Nothing to undo");
    return;
  }
  const snap = S.roughenSnapshot;
  S.roughenSnapshot = null;
  replaceLayerFromFeature({
    type: 'Feature',
    properties: snap.geo.properties || {},
    geometry: snap.geo.geometry
  }, snap.style || {});
  showToast("Border detail reverted to original outline");
}

// ================= CURVED EDGES (smooth individual polygon lines) =================
// Each polygon keeps its original straight geometry; any edge the user
// curves is replaced by a quadratic Bézier sampled into dense points, so
// the curvature is baked into the geometry and shows up in every export.
