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
import { closeDrawers, endDrawSession, showToast } from './uiHelpers.js';

// ================= SPLIT SHAPE WITH A LINE =================
// The drawn line is extended into a half-plane "blade" polygon, then the
// target shape is severed with turf boolean ops: difference() keeps one
// side, intersect() keeps the other. Both halves inherit the original's
// properties and get their own unique color.
export function setSplitStatus(txt, tone) {
  const el = document.getElementById('split-status');
  if (!el) return;
  el.textContent = txt;
  el.className = tone === 'ok' ? 'text-[10px] font-mono text-emerald-400' : tone === 'busy' ? 'text-[10px] font-mono text-amber-300' : tone === 'warn' ? 'text-[10px] font-mono text-amber-300' : 'text-[10px] font-mono text-slate-400';
  const el2 = document.getElementById('split-delete-status');
  if (el2) {
    el2.textContent = tone === 'busy' && S.splitDeleteMode ? 'deleting…' : txt;
    el2.className = el.className;
  }
}

function ensureSelectedPolygonOrWarn() {
  if (!S.activeSelectedLayer || !(S.activeSelectedLayer instanceof L.Polygon) || !S.drawnItems.hasLayer(S.activeSelectedLayer)) {
    showToast('Select a polygon first — tap it on the map');
    setSplitStatus('select a shape', 'warn');
    // highlight selection UI to guide user
    const drawerBtn = document.getElementById('btn-split');
    if (drawerBtn) {
      drawerBtn.classList.add('animate-pulse');
      setTimeout(()=> drawerBtn.classList.remove('animate-pulse'), 900);
    }
    return false;
  }
  return true;
}

function startSplitDraw(opts) {
  closeDrawers();
  exitCurveEdgeMode();
  if (S.map.pm && S.map.pm.disableGlobalEditMode) S.map.pm.disableGlobalEditMode();
  S.splitModeActive = true;
  // Which blade we are drawing — a line severs across the shape, a polygon
  // marks a closed region whose inside/outside decides the cut.
  const shape = opts.tool === 'Polygon' ? 'Polygon' : 'Line';
  S.splitTool = shape === 'Polygon' ? 'polygon' : 'line';
  S._splitLockedLayer = S.activeSelectedLayer;
  setSplitStatus('drawing…', 'busy');
  if (S.map) S.map.getContainer().style.cursor = 'crosshair';
  const color = opts.color || '#f43f5e';
  const drawOpts = {
    snappable: S.snappingEnabled,
    snapDistance: S.snappingDistance,
    snapSegment: S.snappingEnabled && S.snapToEdges,
    snapVertex: S.snappingEnabled && S.snapToVertices,
    snapMiddle: S.snappingEnabled && S.snapToMidpoints,
    tooltips: false,
    templineStyle: {
      color,
      weight: 3,
      dashArray: '6,4'
    },
    hintlineStyle: {
      color,
      dashArray: '1,6',
      weight: 2
    }
  };
  if (shape === 'Line') {
    drawOpts.finishOn = 'dblclick';
  } else {
    // Blade polygons are previews only — never persisted as shapes.
    drawOpts.allowSelfIntersection = false;
    drawOpts.pathOptions = {
      color,
      fillColor: color,
      fillOpacity: 0.25,
      weight: 2,
      opacity: 1,
      dashArray: '6,4'
    };
  }
  S.map.pm.enableDraw(shape, drawOpts);
  showToast(opts.toast);
}

export function startSplitMode() {
  if (!ensureSelectedPolygonOrWarn()) return;
  S.splitDeleteMode = false;
  startSplitDraw({
    color: '#f43f5e',
    toast: 'Draw a line across the selected shape — double-click to finish'
  });
}

export function startSplitAndDeleteMode() {
  if (!ensureSelectedPolygonOrWarn()) return;
  S.splitDeleteMode = true;
  startSplitDraw({
    color: '#fb7185',
    toast: 'Split & delete: draw line — the smaller half will be deleted'
  });
  setSplitStatus('drawing (delete)…', 'busy');
}

// ---- Polygon blade: draw a closed region over the selected shape ----
// Inside the ring = one piece, outside the ring = the other. With delete on,
// the drawn region is erased and only the remainder survives.
export function startSplitPolygonMode() {
  if (!ensureSelectedPolygonOrWarn()) return;
  S.splitDeleteMode = false;
  startSplitDraw({
    tool: 'Polygon',
    color: '#a855f7',
    toast: 'Draw a polygon over the selected shape — click the first point to close it'
  });
}

export function startSplitPolygonAndDeleteMode() {
  if (!ensureSelectedPolygonOrWarn()) return;
  S.splitDeleteMode = true;
  startSplitDraw({
    tool: 'Polygon',
    color: '#c084fc',
    toast: 'Split & delete polygon: draw the area to erase — click the first point to close'
  });
  setSplitStatus('drawing (delete)…', 'busy');
}

export function cancelSplitMode() {
  S.splitModeActive = false;
  S.splitDeleteMode = false;
  S.splitTool = 'line';
  S._splitLockedLayer = null;
  setSplitStatus('idle');
  endDrawSession();
  if (S.map) S.map.getContainer().style.cursor = '';
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
    if (S.splitModeActive) return;
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

export async function executeSplitWithLine(latlngs, forceDeleteFlag) {
  const isDeleteMode = typeof forceDeleteFlag === 'boolean' ? forceDeleteFlag : !!S.splitDeleteMode;
  try {
    await ensureHeavyLibs();
    const _turf = turf || (typeof window !== 'undefined' ? window.turf : null);
    if (!_turf) throw new Error('Turf geometry engine unavailable (offline)');
    const flat = Array.isArray(latlngs[0]) ? latlngs.flat(3) : latlngs;
    const coords = flat.map(ll => [ll.lng, ll.lat]);
    if (coords.length < 2) {
      setSplitStatus('idle');
      showToast('Draw a line across the shape to split it');
      return;
    }
    // Enforce: only the pre-selected region may be split — no switching during draw
    let targets;
    const locked = S._splitLockedLayer && S.drawnItems.hasLayer(S._splitLockedLayer) ? S._splitLockedLayer : S.activeSelectedLayer;
    if (!locked || !(locked instanceof L.Polygon) || !S.drawnItems.hasLayer(locked)) {
      // No valid locked selection — check activeSelectedLayer
      if (!S.activeSelectedLayer || !(S.activeSelectedLayer instanceof L.Polygon)) {
        setSplitStatus('idle');
        showToast('Select a polygon first before splitting');
        return;
      }
      targets = [S.activeSelectedLayer];
    } else {
      targets = [locked];
    }

    // ---- Cut with the FULL drawn path (line OR bent polyline) ----
    const drawnPath = coords;
    const pathBbox = _turf.bbox(_turf.lineString(drawnPath));
    const cosLat = Math.cos(S.map.getCenter().lat * Math.PI / 180);
    let splitCount = 0;
    let lastPiece = null;
    await nextTick();
    for (let t = 0; t < targets.length; t++) {
      const poly = targets[t];
      const polyGeo = poly.toGeoJSON();
      const pb = _turf.bbox(polyGeo);

      // bbox prefilter — skip shapes the path cannot reach
      if (pathBbox[0] > pb[2] || pathBbox[2] < pb[0] || pathBbox[1] > pb[3] || pathBbox[3] < pb[1]) continue;
      const D = Math.max(Math.hypot(pb[2] - pb[0], pb[3] - pb[1]), 0.01);

      // Extend both path ends outward so the cut always runs clear through
      const d0 = normDir(drawnPath[1], drawnPath[0]);
      const dN = normDir(drawnPath[drawnPath.length - 1], drawnPath[drawnPath.length - 2]);
      const ext = D * 2;
      const fullPath = [[drawnPath[0][0] - d0[0] * ext, drawnPath[0][1] - d0[1] * ext], ...drawnPath, [drawnPath[drawnPath.length - 1][0] + dN[0] * ext, drawnPath[drawnPath.length - 1][1] + dN[1] * ext]];

      // A hair-thin band following the whole path severs the polygon
      const diagKm = _turf.distance(_turf.point([pb[0], pb[1]]), _turf.point([pb[2], pb[3]]), {
        units: 'kilometers'
      });
      const wKm = Math.min(Math.max(diagKm * 2e-6, 5e-8), 0.05);
      let band = null;
      try {
        band = _turf.buffer(_turf.lineString(fullPath), wKm, {
          units: 'kilometers',
          steps: 4
        });
      } catch (e) {}
      if (!band) continue;
      let cut = null;
      try {
        cut = _turf.difference(polyGeo, band);
      } catch (e) {}
      if (!cut || !cut.geometry) continue;
      let pieces = [];
      if (cut.geometry.type === 'Polygon') pieces = [cut];else if (cut.geometry.type === 'MultiPolygon') pieces = cut.geometry.coordinates.map(c => _turf.polygon(c));
      if (pieces.length < 2) continue; // the path did not separate this shape

      // The band slice inside the polygon is handed to one side, so the two
      // new polygons tile the original exactly — no gap, no overlap.
      let bandInside = null;
      try {
        bandInside = _turf.intersect(band, polyGeo);
      } catch (e) {}

      // Sort every piece onto side A or side B of the drawn path
      const groupA = [];
      const groupB = [];
      pieces.forEach(p => {
        const c = _turf.centroid(p).geometry.coordinates;
        (nearestPathSide(c[0], c[1], drawnPath, cosLat) >= 0 ? groupA : groupB).push(p);
      });
      if (bandInside && bandInside.geometry) {
        const bc = _turf.centroid(bandInside).geometry.coordinates;
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
            const u = _turf.union(acc, g[i]);
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

      if (isDeleteMode) {
        // Split-and-delete: keep only the larger half, discard the smaller
        let areaA = 0, areaB = 0;
        try { areaA = _turf.area(finalA); } catch {}
        try { areaB = _turf.area(finalB); } catch {}
        const keepLargerA = areaA >= areaB;
        const keepGeo = keepLargerA ? finalA : finalB;
        // The deleted half is simply not added back
        const kept = addSplitPiece({
          type: 'Feature',
          properties: {},
          geometry: keepGeo.geometry
        }, `${baseName} (trimmed)`, nextUniqueColor(), prevProps);
        lastPiece = kept || S.activeSelectedLayer;
        splitCount++;
      } else {
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
    }
    // clear lock after execution
    S._splitLockedLayer = null;
    S.splitDeleteMode = false;
    if (S.map) S.map.getContainer().style.cursor = '';
    if (splitCount === 0) {
      setSplitStatus('no split', null);
      showToast('The path did not separate the selected shape — draw it right across the whole polygon');
      return;
    }
    if (lastPiece) populateStyleDrawer(lastPiece);
    updateStats();
    updateCountriesUI();
    renderCountryResults();
    if (isDeleteMode) {
      setSplitStatus(`${splitCount} trimmed`, 'ok');
      showToast(`Split & delete complete — ${splitCount} shape${splitCount > 1 ? 's' : ''} trimmed (smaller half removed)`);
    } else {
      setSplitStatus(`${splitCount} split`, 'ok');
      showToast(`Split complete — ${splitCount} shape${splitCount > 1 ? 's' : ''} cut into parts`);
    }
  } catch (err) {
    console.warn('Split failed:', err);
    S._splitLockedLayer = null;
    S.splitDeleteMode = false;
    if (S.map) S.map.getContainer().style.cursor = '';
    setSplitStatus('failed', null);
    showToast('Split failed: ' + err.message);
  }
}

// ================= SPLIT SHAPE WITH A POLYGON =================
// The drawn ring is a closed "blade" region: intersect() keeps the part inside
// it, difference() keeps the part outside. Plain split hands you both pieces;
// split & delete erases the drawn region and keeps only the remainder.
export async function executeSplitWithPolygon(latlngs, forceDeleteFlag) {
  const isDeleteMode = typeof forceDeleteFlag === 'boolean' ? forceDeleteFlag : !!S.splitDeleteMode;
  try {
    await ensureHeavyLibs();
    const _turf = turf || (typeof window !== 'undefined' ? window.turf : null);
    if (!_turf) throw new Error('Turf geometry engine unavailable (offline)');

    // Geoman returns [outerRing, ...holes] for a polygon — the outer ring is the blade.
    const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    const coords = ring.map(ll => [ll.lng, ll.lat]);
    if (coords.length < 3) {
      setSplitStatus('idle');
      showToast('Draw at least 3 points to make a polygon blade');
      return;
    }
    // Close the ring so turf accepts it as a polygon
    const first = coords[0], last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);

    let blade = null;
    try {
      blade = _turf.polygon([coords]);
    } catch (e) {}
    if (!blade) {
      setSplitStatus('idle');
      showToast('That polygon blade is invalid — avoid crossing its own edges');
      return;
    }

    // Enforce: only the pre-selected region may be split — no switching during draw
    const locked = S._splitLockedLayer && S.drawnItems.hasLayer(S._splitLockedLayer) ? S._splitLockedLayer : S.activeSelectedLayer;
    if (!locked || !(locked instanceof L.Polygon) || !S.drawnItems.hasLayer(locked)) {
      setSplitStatus('idle');
      showToast('Select a polygon first before splitting');
      return;
    }

    const areaOf = geometry => {
      try {
        return _turf.area({ type: 'Feature', properties: {}, geometry });
      } catch (e) {
        return 0;
      }
    };

    await nextTick();
    const poly = locked;
    const polyGeo = poly.toGeoJSON();
    const bladeBbox = _turf.bbox(blade);
    const pb = _turf.bbox(polyGeo);
    const bboxesOverlap = !(bladeBbox[0] > pb[2] || bladeBbox[2] < pb[0] || bladeBbox[1] > pb[3] || bladeBbox[3] < pb[1]);

    let inside = null, outside = null;
    if (bboxesOverlap) {
      try { inside = _turf.intersect(polyGeo, blade); } catch (e) {}
      try { outside = _turf.difference(polyGeo, blade); } catch (e) {}
    }
    // Ignore slivers: a blade that only grazes an edge must not create empty pieces
    const hasInside = !!(inside && inside.geometry && areaOf(inside.geometry) > 1);
    const hasOutside = !!(outside && outside.geometry && areaOf(outside.geometry) > 1);

    S.splitTool = 'line';
    if (S.map) S.map.getContainer().style.cursor = '';

    // A meaningful cut requires a real inside piece. Without one the blade only
    // grazed an edge — bail out BEFORE touching the original, so a failed cut
    // can never destroy the shape.
    if (!hasInside) {
      S._splitLockedLayer = null;
      S.splitDeleteMode = false;
      setSplitStatus('no overlap', null);
      showToast('The drawn polygon did not overlap the selected shape — draw it across the area you want');
      return;
    }

    const prevProps = poly.feature && poly.feature.properties || {};
    const baseName = String(prevProps.name || 'Region').replace(/ \((A|B|inside|outside|trimmed)\)$/, '');
    S.drawnItems.removeLayer(poly);

    // Keep the country index in sync if this shape was a loaded country
    Object.keys(S.countryLayerById).forEach(k => {
      if (S.countryLayerById[k] === poly) delete S.countryLayerById[k];
    });
    const ci = S.countryLayers.indexOf(poly);
    if (ci >= 0) S.countryLayers.splice(ci, 1);

    let lastPiece = null;
    let status = 'idle';
    if (isDeleteMode) {
      if (hasOutside) {
        // The drawn region is gone; the remainder survives as one shape
        lastPiece = addSplitPiece({
          type: 'Feature',
          properties: {},
          geometry: outside.geometry
        }, `${baseName} (trimmed)`, nextUniqueColor(), prevProps);
        status = 'trimmed';
        setSplitStatus(status, 'ok');
        showToast('Split & delete complete — the drawn area was erased');
      } else {
        // The blade covered the entire shape — nothing left to keep
        if (S.activeSelectedLayer === poly) {
          S.activeSelectedLayer = null;
          populateStyleDrawer(null);
        }
        status = 'removed';
        setSplitStatus(status, 'ok');
        showToast('The drawn area covered the whole shape — it was removed');
      }
    } else {
      addSplitPiece({
        type: 'Feature',
        properties: {},
        geometry: inside.geometry
      }, `${baseName} (inside)`, nextUniqueColor(), prevProps);
      if (hasOutside) {
        lastPiece = addSplitPiece({
          type: 'Feature',
          properties: {},
          geometry: outside.geometry
        }, `${baseName} (outside)`, nextUniqueColor(), prevProps);
      } else {
        lastPiece = S.activeSelectedLayer;
        showToast('The drawn polygon covered the whole shape — nothing to cut');
      }
      status = 'split';
      setSplitStatus(status, 'ok');
      if (hasOutside) showToast('Split complete — cut into inside / outside pieces');
    }

    S._splitLockedLayer = null;
    S.splitDeleteMode = false;
    // The cut already happened — a UI refresh hiccup must not report it as failed
    try {
      if (lastPiece) populateStyleDrawer(lastPiece);
      updateStats();
      updateCountriesUI();
      renderCountryResults();
    } catch (uiErr) {
      console.warn('Post-split UI refresh failed:', uiErr);
    }
  } catch (err) {
    console.warn('Polygon split failed:', err);
    S._splitLockedLayer = null;
    S.splitDeleteMode = false;
    S.splitTool = 'line';
    if (S.map) S.map.getContainer().style.cursor = '';
    setSplitStatus('failed', null);
    showToast('Polygon split failed: ' + err.message);
  }
}

// ================= MAGNETIC EDGE & VERTEX SNAPPING ENGINE =================

if (typeof window !== 'undefined') {
  window.startSplitMode = startSplitMode;
  window.startSplitAndDeleteMode = startSplitAndDeleteMode;
  window.startSplitPolygonMode = startSplitPolygonMode;
  window.startSplitPolygonAndDeleteMode = startSplitPolygonAndDeleteMode;
  window.cancelSplitMode = cancelSplitMode;
  window.executeSplitWithLine = executeSplitWithLine;
  window.executeSplitWithPolygon = executeSplitWithPolygon;
}
