// Split out of the original single-file engine (see legacy/index.html).
// Origin: SPLIT SHAPE WITH A LINE

import L from 'leaflet';
import { S } from './state.js';
import { nextTick, normDir } from '../lib/util.js';
import { nextUniqueColor, setupLayerProperties } from './colors.js';
import { renderCountryResults } from './countries.js';
import { exitCurveEdgeMode } from './curves.js';
import { onFeatureClick } from './exporters/geojson.js';
import { ensureHeavyLibs, turf } from './heavyLibs.js';
import { updateCountriesUI } from './merge.js';
import { updateStats } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { closeDrawers, showToast } from './uiHelpers.js';

// ================= SPLIT SHAPE WITH A LINE =================
// The drawn line is extended into a half-plane "blade" polygon, then the
// target shape is severed with turf boolean ops: difference() keeps one
// side, intersect() keeps the other. Both halves inherit the original's
// properties and get their own unique color.
export function setSplitStatus(txt, tone) {
  const el = document.getElementById('split-status');
  if (!el) return;
  el.textContent = txt;
  el.className = tone === 'ok' ? 'text-[10px] font-mono text-emerald-400' : tone === 'busy' ? 'text-[10px] font-mono text-amber-300' : 'text-[10px] font-mono text-slate-400';
}

export function startSplitMode() {
  closeDrawers();
  exitCurveEdgeMode();
  S.map.pm.disableGlobalEditMode();
  S.splitModeActive = true;
  setSplitStatus('drawing…', 'busy');
  S.map.pm.enableDraw('Line', {
    finishOn: 'dblclick',
    snappable: S.snappingEnabled,
    snapDistance: S.snappingDistance,
    snapSegment: S.snappingEnabled && S.snapToEdges,
    snapVertex: S.snappingEnabled && S.snapToVertices,
    snapMiddle: S.snappingEnabled && S.snapToMidpoints,
    templineStyle: {
      color: '#f43f5e',
      weight: 3,
      dashArray: '6,4'
    },
    hintlineStyle: {
      color: '#f43f5e',
      dashArray: '1,6',
      weight: 2
    }
  });
  showToast('Draw a line or polyline across the shape — finish with a double-click / double-tap');
}

export function cancelSplitMode() {
  S.splitModeActive = false;
  setSplitStatus('idle');
  if (S.map.pm.globalDrawModeEnabled && S.map.pm.globalDrawModeEnabled()) S.map.pm.disableDraw();
  showToast('Split mode stopped');
}

export function addSplitPiece(geometryShape, name, color, baseProps) {
  const layer = L.geoJSON(geometryShape, {
    style: {
      color,
      fillColor: color,
      fillOpacity: 1,
      weight: 0,
      dashArray: null
    }
  }).getLayers()[0];
  if (!layer) return null;
  setupLayerProperties(layer);
  layer.feature.properties.name = name;
  layer.feature.properties.fill = color;
  layer.feature.properties.stroke = color;
  layer.feature.properties['fill-opacity'] = 1;
  layer.feature.properties['stroke-width'] = 0;
  layer.feature.properties['stroke-dasharray'] = null;
  if (baseProps && baseProps.note) layer.feature.properties.note = baseProps.note;
  if (typeof layer.setStyle === 'function') {
    layer.setStyle({
      color,
      fillColor: color,
      fillOpacity: 1,
      weight: 0,
      dashArray: null
    });
  }
  layer.on('click', () => {
    S.activeSelectedLayer = layer;
    populateStyleDrawer(layer);
    onFeatureClick(layer);
  });
  S.drawnItems.addLayer(layer);
  S.activeSelectedLayer = layer;
  return layer;
}

// Unit direction from b towards a (used to extend both path ends outward)

// Which side of the (possibly bent) path is this point on? The path is
// treated as a chain of segments: we find the nearest segment and return
// the sign of the cross product there — a proper generalisation of
// "left/right of the line" for polylines.
export function nearestPathSide(lng, lat, path, cosLat) {
  const x = lng * cosLat;
  const y = lat;
  let bestD = Infinity;
  let sign = 1;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0] * cosLat;
    const ay = path[i][1];
    const bx = path[i + 1][0] * cosLat;
    const by = path[i + 1][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-18;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < bestD) {
      bestD = d;
      sign = dx * (y - ay) - dy * (x - ax) >= 0 ? 1 : -1;
    }
  }
  return sign;
}

export async function executeSplitWithLine(latlngs) {
  try {
    await ensureHeavyLibs();
    if (!window.turf) throw new Error('Turf geometry engine unavailable (offline)');
    const flat = Array.isArray(latlngs[0]) ? latlngs.flat(3) : latlngs;
    const coords = flat.map(ll => [ll.lng, ll.lat]);
    if (coords.length < 2) {
      setSplitStatus('idle');
      showToast('Draw a line across the shape to split it');
      return;
    }
    const selectedOnly = document.getElementById('split-selected-only').checked;
    let targets;
    if (selectedOnly) {
      if (!S.activeSelectedLayer || !(S.activeSelectedLayer instanceof L.Polygon)) {
        setSplitStatus('idle');
        showToast('Select a polygon first, or uncheck "selected shape only"');
        return;
      }
      targets = [S.activeSelectedLayer];
    } else {
      targets = S.drawnItems.getLayers().filter(l => l instanceof L.Polygon);
    }

    // ---- Cut with the FULL drawn path (line OR bent polyline) ----
    const drawnPath = coords;
    const pathBbox = turf.bbox(turf.lineString(drawnPath));
    const cosLat = Math.cos(S.map.getCenter().lat * Math.PI / 180);
    let splitCount = 0;
    let lastPiece = null;
    await nextTick();
    for (let t = 0; t < targets.length; t++) {
      const poly = targets[t];
      const polyGeo = poly.toGeoJSON();
      const pb = turf.bbox(polyGeo);

      // bbox prefilter — skip shapes the path cannot reach
      if (pathBbox[0] > pb[2] || pathBbox[2] < pb[0] || pathBbox[1] > pb[3] || pathBbox[3] < pb[1]) continue;
      const D = Math.max(Math.hypot(pb[2] - pb[0], pb[3] - pb[1]), 0.01);

      // Extend both path ends outward so the cut always runs clear through
      const d0 = normDir(drawnPath[1], drawnPath[0]);
      const dN = normDir(drawnPath[drawnPath.length - 1], drawnPath[drawnPath.length - 2]);
      const ext = D * 2;
      const fullPath = [[drawnPath[0][0] - d0[0] * ext, drawnPath[0][1] - d0[1] * ext], ...drawnPath, [drawnPath[drawnPath.length - 1][0] + dN[0] * ext, drawnPath[drawnPath.length - 1][1] + dN[1] * ext]];

      // A hair-thin band following the whole path severs the polygon
      const diagKm = turf.distance(turf.point([pb[0], pb[1]]), turf.point([pb[2], pb[3]]), {
        units: 'kilometers'
      });
      const wKm = Math.min(Math.max(diagKm * 2e-6, 5e-8), 0.05);
      let band = null;
      try {
        band = turf.buffer(turf.lineString(fullPath), wKm, {
          units: 'kilometers',
          steps: 4
        });
      } catch (e) {}
      if (!band) continue;
      let cut = null;
      try {
        cut = turf.difference(polyGeo, band);
      } catch (e) {}
      if (!cut || !cut.geometry) continue;
      let pieces = [];
      if (cut.geometry.type === 'Polygon') pieces = [cut];else if (cut.geometry.type === 'MultiPolygon') pieces = cut.geometry.coordinates.map(c => turf.polygon(c));
      if (pieces.length < 2) continue; // the path did not separate this shape

      // The band slice inside the polygon is handed to one side, so the two
      // new polygons tile the original exactly — no gap, no overlap.
      let bandInside = null;
      try {
        bandInside = turf.intersect(band, polyGeo);
      } catch (e) {}

      // Sort every piece onto side A or side B of the drawn path
      const groupA = [];
      const groupB = [];
      pieces.forEach(p => {
        const c = turf.centroid(p).geometry.coordinates;
        (nearestPathSide(c[0], c[1], drawnPath, cosLat) >= 0 ? groupA : groupB).push(p);
      });
      if (bandInside && bandInside.geometry) {
        const bc = turf.centroid(bandInside).geometry.coordinates;
        (nearestPathSide(bc[0], bc[1], drawnPath, cosLat) >= 0 ? groupA : groupB).push(bandInside);
      }

      // Guarantee exactly two new polygons
      if (groupA.length === 0 && groupB.length > 1) groupA.push(groupB.pop());
      if (groupB.length === 0 && groupA.length > 1) groupB.push(groupA.pop());
      if (groupA.length === 0 || groupB.length === 0) continue;
      const unionGroup = g => {
        let acc = g[0];
        for (let i = 1; i < g.length; i++) {
          try {
            const u = turf.union(acc, g[i]);
            if (u && u.geometry) acc = u;
          } catch (e) {}
        }
        return acc;
      };
      const finalA = unionGroup(groupA);
      const finalB = unionGroup(groupB);
      if (!finalA || !finalB) continue;
      const prevProps = poly.feature && poly.feature.properties || {};
      const baseName = String(prevProps.name || 'Region').replace(/ \(([AB]|[0-9]+)\)$/, '');
      S.drawnItems.removeLayer(poly);

      // Keep the country index in sync if this shape was a loaded country
      Object.keys(S.countryLayerById).forEach(k => {
        if (S.countryLayerById[k] === poly) delete S.countryLayerById[k];
      });
      const ci = S.countryLayers.indexOf(poly);
      if (ci >= 0) S.countryLayers.splice(ci, 1);
      addSplitPiece({
        type: 'Feature',
        properties: {},
        geometry: finalA.geometry
      }, `${baseName} (A)`, nextUniqueColor(), prevProps);
      const layerB = addSplitPiece({
        type: 'Feature',
        properties: {},
        geometry: finalB.geometry
      }, `${baseName} (B)`, nextUniqueColor(), prevProps);
      lastPiece = layerB || S.activeSelectedLayer;
      splitCount++;
    }
    if (splitCount === 0) {
      setSplitStatus('no split', null);
      showToast('The path did not separate any shape — draw it right across the whole polygon');
      return;
    }
    if (lastPiece) populateStyleDrawer(lastPiece);
    updateStats();
    updateCountriesUI();
    renderCountryResults();
    setSplitStatus(`${splitCount} split`, 'ok');
    showToast(`Split complete — ${splitCount} shape${splitCount > 1 ? 's' : ''} cut into parts`);
  } catch (err) {
    console.warn('Split failed:', err);
    setSplitStatus('failed', null);
    showToast('Split failed: ' + err.message);
  }
}

// ================= MAGNETIC EDGE & VERTEX SNAPPING ENGINE =================
