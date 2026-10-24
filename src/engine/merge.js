// Split out of the original single-file engine (see legacy/index.html).
// Origin: MERGE REGIONS

import L from 'leaflet';
import { S } from './state.js';
import { computeGeoBbox, yieldFrame } from '../lib/util.js';
import { splitPolygonAtAntimeridian } from './antimeridian.js';
import { applyShapeLockStyle } from './borderDetail.js';
import { nextUniqueColor, setupLayerProperties } from './colors.js';
import { LAND_SOURCES, PREVIEW_COLOR, curveStore } from './constants.js';
import { renderCountryResults, setCountriesStatus, updateDeleteModeUI, updateSelectOnMapUI } from './countries.js';
import { exitCurveEdgeMode } from './curves.js';
import { onFeatureClick } from './exporters/geojson.js';
import { ensureHeavyLibs, topojson, turf } from './heavyLibs.js';
import { updateCoastlineStatus } from './landmass.js';
import { updateMobileSelectionBar, updateStats } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { isDesktopUI } from './tutorial.js';
import { closeDrawers, mobileHaptic, showToast } from './uiHelpers.js';

// ================= MERGE REGIONS =================
// Tap shapes to collect them, then fuse them into a single feature with
// turf.union. Touching regions dissolve their shared border; separated
// ones become one MultiPolygon, so provinces → country works in one pass.
export function updateMergeModeUI() {
  const txt = document.getElementById('text-merge-header');
  const ind = document.getElementById('indicator-merge-header');
  if (txt) {
    txt.textContent = S.mergeMode ? 'ON' : 'OFF';
    txt.className = S.mergeMode ? 'text-violet-300' : 'text-slate-400';
  }
  if (ind) {
    ind.className = S.mergeMode ? 'w-2 h-2 rounded-full bg-violet-400 shadow-sm shadow-violet-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }
  const mTxt = document.getElementById('text-merge-mobile');
  const mInd = document.getElementById('indicator-merge-mobile');
  const mBtn = document.getElementById('btn-merge-mobile');
  if (mTxt) {
    mTxt.textContent = S.mergeMode ? 'ON' : 'OFF';
    mTxt.className = S.mergeMode ? 'text-violet-300' : 'text-slate-500';
  }
  if (mInd) {
    mInd.className = S.mergeMode ? 'w-2 h-2 rounded-full bg-violet-400 shadow-sm shadow-violet-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }
  if (mBtn) {
    mBtn.classList.toggle('border-violet-500', S.mergeMode);
    mBtn.classList.toggle('bg-violet-950/90', S.mergeMode);
    mBtn.classList.toggle('text-violet-100', S.mergeMode);
  }
  const rail = document.getElementById('btn-merge-rail');
  if (rail) {
    rail.classList.toggle('bg-violet-600', S.mergeMode);
    rail.classList.toggle('text-white', S.mergeMode);
    rail.classList.toggle('text-slate-300', !S.mergeMode);
  }
  const panelBtn = document.getElementById('btn-merge-mode');
  if (panelBtn) {
    panelBtn.classList.toggle('bg-violet-600', S.mergeMode);
    panelBtn.classList.toggle('text-white', S.mergeMode);
    panelBtn.classList.toggle('bg-slate-700', !S.mergeMode);
    panelBtn.classList.toggle('text-slate-200', !S.mergeMode);
  }
  document.body.classList.toggle('merge-mode', !!S.mergeMode);
  setMergeStatus();
  if (S.map) {
    S.map.getContainer().style.cursor = S.selectOnMapMode || S.deleteMode || S.mergeMode ? 'crosshair' : '';
  }
}

export function setMergeStatus(txt, tone) {
  updateMergeBar(txt, tone);
  const el = document.getElementById('merge-status');
  if (!el) return;
  el.textContent = txt || `${S.mergeSelection.length} picked`;
  el.className = tone === 'ok' ? 'text-[10px] font-mono text-emerald-400' : tone === 'busy' ? 'text-[10px] font-mono text-amber-300' : S.mergeSelection.length > 0 ? 'text-[10px] font-mono text-violet-300' : 'text-[10px] font-mono text-slate-400';
}

/**
 * The floating Merge toolbar (`#merge-bar`, see ui/MergeBar.jsx): shown while
 * Merge mode is on, tells how many regions are picked and enables the Merge
 * button once there are two — so the merge can be run from the map instead
 * of from the Draw panel.
 */
export function updateMergeBar(txt, tone) {
  const bar = document.getElementById('merge-bar');
  if (!bar) return;
  const on = !!S.mergeMode;
  bar.classList.toggle('visible', on);
  bar.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (!on) return;
  const n = S.mergeSelection.length;
  const title = document.getElementById('merge-bar-title');
  const hint = document.getElementById('merge-bar-hint');
  const run = document.getElementById('btn-merge-bar-run');
  const label = document.getElementById('merge-bar-run-label');
  const busy = tone === 'busy';
  if (title) {
    title.textContent = busy ? (txt || 'Merging…') : n === 0 ? 'Merge mode' : n === 1 ? '1 region picked' : `${n} regions picked`;
  }
  if (hint) {
    hint.textContent = busy ? 'Fusing the picked regions…'
      : tone === 'ok' && txt ? `${txt} ✓ — tap more regions, or ✓ to finish`
      : n === 0 ? 'Tap the regions on the map you want to fuse'
      : n === 1 ? 'Tap at least one more region'
      : 'Press Merge to fuse them into one shape';
  }
  if (run) {
    const ready = n >= 2 && !busy;
    const wasReady = !run.disabled;
    run.disabled = !ready;
    run.setAttribute('aria-disabled', ready ? 'false' : 'true');
    if (ready && !wasReady) {
      run.classList.add('is-ready');
      setTimeout(() => run.classList.remove('is-ready'), 600);
    }
  }
  if (label) label.textContent = n >= 2 ? `Merge ${n}` : 'Merge';
}

export function highlightMergeLayer(layer, on) {
  if (!layer || typeof layer.setStyle !== 'function') return;
  if (on) {
    if (!layer._mergePrevStyle) {
      layer._mergePrevStyle = {
        color: layer.options.color,
        weight: layer.options.weight,
        opacity: layer.options.opacity,
        dashArray: layer.options.dashArray,
        fillOpacity: layer.options.fillOpacity
      };
    }
    layer.setStyle({
      color: '#c4b5fd',
      weight: 3,
      opacity: 1,
      dashArray: '6,4',
      fillOpacity: 0.85
    });
  } else {
    const prev = layer._mergePrevStyle;
    if (prev) {
      layer.setStyle({
        color: prev.color,
        weight: prev.weight || 0,
        opacity: prev.opacity !== undefined ? prev.opacity : 0,
        dashArray: prev.dashArray || null,
        fillOpacity: prev.fillOpacity !== undefined ? prev.fillOpacity : 1
      });
      delete layer._mergePrevStyle;
    }
  }
}

export function clearMergeSelection(announce) {
  S.mergeSelection.forEach(l => highlightMergeLayer(l, false));
  S.mergeSelection = [];
  setMergeStatus();
  if (announce) showToast('Merge selection cleared');
}

export function toggleMergeMode() {
  S.mergeMode = !S.mergeMode;
  mobileHaptic(S.mergeMode ? [8, 28, 8] : 8);
  if (S.mergeMode) {
    if (S.deleteMode) {
      S.deleteMode = false;
      updateDeleteModeUI();
    }
    if (S.selectOnMapMode) {
      S.selectOnMapMode = false;
      updateSelectOnMapUI();
    }
    if (!isDesktopUI()) closeDrawers();
    // Seed the selection with whatever is already selected
    if (S.activeSelectedLayer && S.drawnItems.hasLayer(S.activeSelectedLayer) && S.activeSelectedLayer instanceof L.Polygon && S.mergeSelection.length === 0) {
      S.mergeSelection.push(S.activeSelectedLayer);
      highlightMergeLayer(S.activeSelectedLayer, true);
    }
    showToast('Merge mode: tap the regions to fuse, then press Merge (Esc to stop)');
  } else {
    clearMergeSelection(false);
    showToast('Merge mode off');
  }
  updateMergeModeUI();
}

export function toggleMergeCandidate(layer) {
  if (!(layer instanceof L.Polygon)) {
    showToast('Only filled regions can be merged');
    return;
  }
  const i = S.mergeSelection.indexOf(layer);
  if (i >= 0) {
    S.mergeSelection.splice(i, 1);
    highlightMergeLayer(layer, false);
  } else {
    S.mergeSelection.push(layer);
    highlightMergeLayer(layer, true);
  }
  mobileHaptic(6);
  setMergeStatus();
  if (S.mergeSelection.length >= 2) {
    showToast(`${S.mergeSelection.length} regions picked — press Merge to fuse them`);
  }
}

// Core union: fold a list of layers into one feature

// Core union: fold a list of layers into one feature
export async function unionLayers(layers, statusPrefix) {
  await ensureHeavyLibs();
  const _turfCheck = turf || (typeof window !== 'undefined' ? window.turf : null);
  if (!_turfCheck) throw new Error('Turf geometry engine unavailable');
  // Full-precision coordinates: Leaflet's toGeoJSON() rounds to 6 decimals by
  // default, which would nudge every vertex of the merged outline.
  const inputs = layers.map(l => l.toGeoJSON(false));
  let acc = inputs[0];
  for (let i = 1; i < inputs.length; i++) {
    try {
      const u = turf.union(acc, inputs[i]);
      if (u && u.geometry) acc = u;
    } catch (e) {/* skip a bad ring, keep merging the rest */}
    if (i % 12 === 0) {
      setMergeStatus(`${statusPrefix || 'merging'} ${i}/${layers.length}…`, 'busy');
      await yieldFrame();
    }
  }

  // Optional cleanup: drop the thin little holes left where two borders were
  // meant to coincide but did not quite. (The old ±0.8 m buffer round trip
  // moved every vertex and tripled the point count; this touches no vertex.)
  const dissolve = (document.getElementById('merge-dissolve') || {}).checked;
  if (dissolve && acc && acc.geometry) {
    try {
      acc = removeMergeGaps(acc, inputs);
    } catch (e) {/* keep the plain union */}
  }
  return acc;
}

const vertexKey = c => `${Math.round(c[0] * 1e9)},${Math.round(c[1] * 1e9)}`;
const polygonsOf = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];

/**
 * Dissolve for merges: remove the holes a union leaves between imperfect
 * borders (a 50 m country next to a 10 m province, a refined coast next to an
 * atlas one). A hole is only dropped when it is *new* — bounded by more than
 * one input (or by fresh intersection points) — and both small and thin; a
 * hole one input already had (an enclave, a lake) is kept untouched, islands
 * are never touched, and no vertex is moved: the outline keeps every point
 * the union produced.
 */
export function removeMergeGaps(merged, inputs, { maxAreaKm2 = 25, maxThinness = 0.25 } = {}) {
  const geom = merged && merged.geometry;
  const polys = polygonsOf(geom);
  if (!polys.length || !turf) return merged;
  const owners = new Map(); // vertex → set of input indexes it belongs to
  (inputs || []).forEach((f, idx) => {
    polygonsOf(f && f.geometry).forEach(rings => rings.forEach(ring => ring.forEach(c => {
      const k = vertexKey(c);
      let set = owners.get(k);
      if (!set) owners.set(k, set = new Set());
      set.add(idx);
    })));
  });
  let removed = 0;
  const out = polys.map(rings => {
    const kept = [rings[0]];
    for (let i = 1; i < rings.length; i++) {
      const ring = rings[i];
      const contributors = new Set();
      let fresh = false; // intersection points: vertices no input had
      for (const c of ring) {
        const set = owners.get(vertexKey(c));
        if (set) set.forEach(x => contributors.add(x));else fresh = true;
      }
      const newHole = contributors.size + (fresh ? 1 : 0) >= 2;
      if (!newHole) {
        kept.push(ring);
        continue;
      }
      let area = 0,
        perimeter = 0;
      try {
        area = turf.area(turf.polygon([ring]));
        perimeter = turf.length(turf.lineString(ring), {
          units: 'meters'
        });
      } catch (e) {
        kept.push(ring);
        continue;
      }
      const thinness = perimeter > 0 ? 4 * Math.PI * area / (perimeter * perimeter) : 1;
      if (area <= maxAreaKm2 * 1e6 && thinness <= maxThinness) {
        removed++;
        continue;
      }
      kept.push(ring);
    }
    return kept;
  });
  if (!removed) return merged;
  return {
    ...merged,
    geometry: geom.type === 'Polygon' ? {
      type: 'Polygon',
      coordinates: out[0]
    } : {
      type: 'MultiPolygon',
      coordinates: out
    }
  };
}

export function commitMergedFeature(layers, merged, name) {
  const first = layers[0];
  const baseProps = first.feature && first.feature.properties || {};
  const color = baseProps.fill || first.options.fillColor || nextUniqueColor();
  layers.forEach(l => {
    highlightMergeLayer(l, false);
    Object.keys(S.countryLayerById).forEach(k => {
      if (S.countryLayerById[k] === l) delete S.countryLayerById[k];
    });
    const ci = S.countryLayers.indexOf(l);
    if (ci >= 0) S.countryLayers.splice(ci, 1);
    if (curveStore.has(l)) curveStore.delete(l);
    if (S.curveModeLayer === l) exitCurveEdgeMode();
    S.drawnItems.removeLayer(l);
  });
  // Rendered at Leaflet's default smoothFactor (1 px) like every drawn or
  // loaded shape — the old smoothFactor: 2 made a merged outline visibly
  // coarser than the shapes it came from.
  const layer = L.geoJSON(merged, {
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
  layer.feature.properties.merged = layers.length;
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
  populateStyleDrawer(layer);
  return layer;
}

export async function executeMerge() {
  if (S.mergeSelection.length < 2) {
    showToast('Pick at least two regions first — turn Merge on and tap them');
    return;
  }
  const layers = S.mergeSelection.filter(l => S.drawnItems.hasLayer(l) && l instanceof L.Polygon);
  if (layers.length < 2) {
    clearMergeSelection(false);
    showToast('Those regions are no longer available');
    return;
  }
  setMergeStatus('merging…', 'busy');
  try {
    const merged = await unionLayers(layers, 'merging');
    if (!merged || !merged.geometry) throw new Error('union produced no geometry');
    const first = layers[0].feature && layers[0].feature.properties || {};
    const baseName = String(first.name || 'Region').replace(/ \(([AB]|[0-9]+)\)$/, '');
    const name = `${baseName} (merged ${layers.length})`;
    S.mergeSelection = [];
    const layer = commitMergedFeature(layers, merged, name);
    if (!layer) throw new Error('could not draw the merged region');
    updateStats();
    updateCountriesUI();
    renderCountryResults();
    setMergeStatus(`merged ${layers.length}`, 'ok');
    mobileHaptic([10, 30, 10]);
    showToast(`Merged ${layers.length} regions into one shape`);
  } catch (err) {
    console.warn('Merge failed:', err);
    setMergeStatus('failed');
    showToast('Merge failed: ' + err.message);
  }
}

// Auto-merge every group of overlapping / touching polygons

// Auto-merge every group of overlapping / touching polygons
export async function mergeAllTouching() {
  await ensureHeavyLibs();
  const _turfAvail = turf || (typeof window !== 'undefined' ? window.turf : null);
  if (!_turfAvail) {
    showToast('Turf unavailable');
    return;
  }
  const polys = S.drawnItems.getLayers().filter(l => l instanceof L.Polygon);
  if (polys.length < 2) {
    showToast('Need at least two regions');
    return;
  }
  setMergeStatus('scanning…', 'busy');
  await yieldFrame();
  const boxes = polys.map(l => {
    const b = l.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  });

  // Union-find over bbox-overlapping pairs confirmed by turf
  const parent = polys.map((_, i) => i);
  const find = a => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const join = (a, b) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const A = boxes[i],
        B = boxes[j];
      if (A[0] > B[2] || A[2] < B[0] || A[1] > B[3] || A[3] < B[1]) continue;
      try {
        if (turf.booleanIntersects(polys[i].toGeoJSON(), polys[j].toGeoJSON())) join(i, j);
      } catch (e) {}
    }
    if (i % 12 === 0) {
      setMergeStatus(`scanning ${i}/${polys.length}…`, 'busy');
      await yieldFrame();
    }
  }
  const groups = {};
  polys.forEach((l, i) => {
    const r = find(i);
    (groups[r] = groups[r] || []).push(l);
  });
  const sets = Object.values(groups).filter(g => g.length > 1);
  if (sets.length === 0) {
    setMergeStatus();
    showToast('No touching regions found');
    return;
  }
  let done = 0;
  for (const g of sets) {
    try {
      const merged = await unionLayers(g, 'merging');
      if (!merged || !merged.geometry) continue;
      const p = g[0].feature && g[0].feature.properties || {};
      const baseName = String(p.name || 'Region').replace(/ \(([AB]|[0-9]+)\)$/, '');
      commitMergedFeature(g, merged, `${baseName} (merged ${g.length})`);
      done++;
    } catch (e) {}
    await yieldFrame();
  }
  clearMergeSelection(false);
  updateStats();
  updateCountriesUI();
  renderCountryResults();
  setMergeStatus(`${done} groups`, 'ok');
  showToast(done ? `Merged ${done} group${done > 1 ? 's' : ''} of touching regions` : 'Nothing could be merged');
}

// Fuse every loaded country / province into one single outline

// Fuse every loaded country / province into one single outline
export async function mergeAllLoadedUnits() {
  const layers = S.countryLayers.filter(l => S.drawnItems.hasLayer(l) && l instanceof L.Polygon);
  if (layers.length < 2) {
    showToast('Load at least two countries / provinces first');
    return;
  }
  const ok = confirm(`Merge all ${layers.length} loaded units into one single shape?`);
  if (!ok) return;
  setMergeStatus('merging loaded…', 'busy');
  try {
    const merged = await unionLayers(layers, 'merging');
    if (!merged || !merged.geometry) throw new Error('union produced no geometry');
    const p = layers[0].feature && layers[0].feature.properties || {};
    const parent = p.note ? String(p.note).split('·')[0].trim() : '';
    const name = parent ? `${parent} (merged)` : `Merged region (${layers.length})`;
    S.mergeSelection = [];
    commitMergedFeature(layers, merged, name);
    updateStats();
    updateCountriesUI();
    renderCountryResults();
    setMergeStatus('merged', 'ok');
    showToast(`Merged ${layers.length} loaded units into one shape`);
  } catch (err) {
    console.warn('Merge loaded failed:', err);
    setMergeStatus('failed');
    showToast('Merge failed: ' + err.message);
  }
}

// ---- One single colour for every loaded country / province ----

// ---- One single colour for every loaded country / province ----
export function applySingleColorToAll() {
  const color = (document.getElementById('single-color') || {}).value || '#10b981';
  const scope = (document.getElementById('single-color-scope') || {}).value || 'countries';
  const targets = scope === 'all' ? S.drawnItems.getLayers() : S.countryLayers.slice();
  let n = 0;
  targets.forEach(l => {
    if (!l || !S.drawnItems.hasLayer(l)) return;
    const isLine = l instanceof L.Polyline && !(l instanceof L.Polygon);
    if (typeof l.setStyle === 'function') {
      l.setStyle(isLine ? {
        color,
        opacity: 1
      } : {
        fillColor: color,
        color,
        fillOpacity: 1
      });
    }
    if (!l.feature) setupLayerProperties(l);
    l.feature.properties.fill = color;
    l.feature.properties.stroke = color;
    if (!isLine) l.feature.properties['fill-opacity'] = 1;
    n++;
  });
  updateStats();
  if (S.activeSelectedLayer) populateStyleDrawer(S.activeSelectedLayer);
  showToast(n ? `Applied ${color} to ${n} shape${n > 1 ? 's' : ''}` : 'Nothing to colour — load a country or draw shapes first');
}

export function removeLoadedCountries() {
  if (S.countryLayers.length === 0) {
    showToast('No loaded countries to remove');
    return;
  }
  const n = S.countryLayers.length;
  S.countryLayers.forEach(l => {
    if (S.drawnItems.hasLayer(l)) S.drawnItems.removeLayer(l);
  });
  S.countryLayers = [];
  S.countryLayerById = {};
  if (S.activeSelectedLayer && !S.drawnItems.hasLayer(S.activeSelectedLayer)) {
    S.activeSelectedLayer = null;
    populateStyleDrawer(null);
  }
  updateStats();
  updateCountriesUI();
  renderCountryResults();
  setCountriesStatus(`Removed ${n} loaded ${n === 1 ? 'country' : 'countries'}.`, null);
  showToast(`Removed ${n} loaded ${n === 1 ? 'country' : 'countries'}`);
}

export function updateCountriesUI() {
  const el = document.getElementById('countries-count');
  if (el) el.textContent = S.countryLayers.length ? `${S.countryLayers.length} loaded` : 'none';
}

// Fast turf-free bounding box (lng/lat order, same as turf.bbox)

export function loadGlobalLandmass(level) {
  const lvl = level || S.currentLandLevel;
  // Fix coastline bug: empty array is falsy for retry — check length, allow retry on failed cache
  if (S.landCache[lvl] && S.landCache[lvl].length) {
    if (lvl === S.currentLandLevel) {
      S.landFeaturesList = S.landCache[lvl];
      updateCoastlineStatus('ready');
    }
    return Promise.resolve(S.landCache[lvl]);
  }
  if (S.landLoadPromise && S.pendingLandLevel === lvl) return S.landLoadPromise;
  S.pendingLandLevel = lvl;
  S.landLoadPromise = (async () => {
    const file = LAND_SOURCES[lvl].file;
    // coastline bug fix: try multiple CDNs (jsdelivr + unpkg + cdnjs fallback) and clear promise on finish
    const urls = [
      `https://cdn.jsdelivr.net/npm/world-atlas@2/${file}`,
      `https://unpkg.com/world-atlas@2.0.2/${file}`,
      `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/${file}`,
    ];
    let topo = null;
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP '+res.status+' for '+url);
        topo = await res.json();
        break;
      } catch (e) {
        lastErr = e;
        console.warn('Land fetch failed for', url, e.message);
      }
    }
    if (!topo) throw lastErr || new Error('All land CDNs failed');
    try {
      await ensureHeavyLibs();
      const landGeo = topojson.feature(topo, topo.objects.land);
      const list = [];
      const feats = landGeo.type === 'FeatureCollection' ? landGeo.features : [landGeo];
      // world-atlas land is geostitched across ±180° — every polygon is cut at
      // the antimeridian (usually a no-op) so no ring spans the whole map.
      const pushPolygon = (coords, properties) => {
        for (const part of splitPolygonAtAntimeridian(coords)) {
          const poly = {
            type: 'Feature',
            properties: properties || {},
            geometry: { type: 'Polygon', coordinates: part }
          };
          poly.bbox = computeGeoBbox(poly.geometry);
          let count = 0;
          part.forEach(r => count += r.length);
          poly._isContinent = count > 3000;
          list.push(poly);
        }
      };
      feats.forEach(f => {
        if (!f.geometry) return;
        if (f.geometry.type === 'MultiPolygon') {
          f.geometry.coordinates.forEach(coords => pushPolygon(coords, {}));
        } else if (f.geometry.type === 'Polygon') {
          pushPolygon(f.geometry.coordinates, f.properties);
        }
      });
      if (list.length === 0) throw new Error('No land features parsed');
      S.landCache[lvl] = list;
      if (lvl === S.currentLandLevel) {
        S.landFeaturesList = list;
        updateCoastlineStatus('ready');
      }
    } catch (err) {
      console.warn('Land loader failed:', err);
      // allow retry: don't cache empty, delete entry
      if (S.landCache[lvl]) delete S.landCache[lvl];
      if (lvl === S.currentLandLevel) {
        S.landFeaturesList = [];
        updateCoastlineStatus('failed');
      }
      throw err;
    } finally {
      // coastline bug fix: clear promise so next retry can happen
      if (S.pendingLandLevel === lvl) {
        S.landLoadPromise = null;
        S.pendingLandLevel = null;
      }
    }
  })();
  // attach catch to prevent unhandled rejection from breaking status
  S.landLoadPromise.catch(()=>{});
  return S.landLoadPromise;
}

// Helper: checks if a point [lng, lat] is inside a ring [[lng, lat]...] using ray-casting

// Helper: checks if a point [lng, lat] is inside a ring [[lng, lat]...] using ray-casting
export function isPointInRing(pt, ring) {
  if (!ring || ring.length < 3) return false;
  const x = pt[0],
    y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Separate any multi-part or fake-hole geometry into pure, single Polygon features
// Prevents SVG renderers from creating horizontal connector bars across the sea

// Separate any multi-part or fake-hole geometry into pure, single Polygon features
// Prevents SVG renderers from creating horizontal connector bars across the sea
export function cleanAndSeparatePolygons(geomOrFeature) {
  if (!geomOrFeature) return [];
  const geom = geomOrFeature.geometry || geomOrFeature;
  if (!geom || !geom.coordinates) return [];
  const rawPolygons = [];
  if (geom.type === 'Polygon') {
    rawPolygons.push(geom.coordinates);
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach(coords => rawPolygons.push(coords));
  }
  const out = [];
  const baseProps = geomOrFeature.properties ? {
    ...geomOrFeature.properties
  } : {};
  rawPolygons.forEach(rings => {
    if (!rings || rings.length === 0) return;
    const exterior = rings[0];
    if (!exterior || exterior.length < 3) return;
    if (rings.length === 1) {
      out.push({
        type: 'Feature',
        properties: {
          ...baseProps
        },
        geometry: {
          type: 'Polygon',
          coordinates: [exterior]
        }
      });
      return;
    }

    // Multiple rings: verify whether subsequent rings are real interior holes (lakes)
    // or disconnected exterior rings (islands / multi-polygons mistakenly stored as rings)
    const realHoles = [];
    const disconnectedRings = [];
    for (let r = 1; r < rings.length; r++) {
      const ring = rings[r];
      if (!ring || ring.length < 3) continue;

      // Test multiple sample vertices to reliably check containment
      let insideCount = 0;
      const step = Math.max(1, Math.floor(ring.length / 4));
      let samples = 0;
      for (let s = 0; s < ring.length && samples < 5; s += step) {
        samples++;
        if (isPointInRing(ring[s], exterior)) insideCount++;
      }
      if (insideCount > samples / 2) {
        realHoles.push(ring);
      } else {
        // Ring is outside the exterior: it is an independent island / piece!
        disconnectedRings.push(ring);
      }
    }
    out.push({
      type: 'Feature',
      properties: {
        ...baseProps
      },
      geometry: {
        type: 'Polygon',
        coordinates: [exterior, ...realHoles]
      }
    });
    disconnectedRings.forEach(sepRing => {
      out.push({
        type: 'Feature',
        properties: {
          ...baseProps
        },
        geometry: {
          type: 'Polygon',
          coordinates: [sepRing]
        }
      });
    });
  });
  return out;
}

// Automatically heal any layer whose geometry has fake holes or horizontal bridging artifacts
// unites any separated parts into a single MultiPolygon region

// Automatically heal any layer whose geometry has fake holes or horizontal bridging artifacts
// unites any separated parts into a single MultiPolygon region
export function healLayerGeometryIfCorrupted(layer) {
  if (!layer || !(layer instanceof L.Polygon)) return layer;
  const geo = layer.toGeoJSON();
  if (!geo || !geo.geometry) return layer;
  if (geo.geometry.type === 'MultiPolygon') return layer;
  if (geo.geometry.type !== 'Polygon') return layer;
  const rings = geo.geometry.coordinates;
  if (!rings || rings.length <= 1) return layer;
  const ext = rings[0];
  let hasExternalHole = false;
  for (let i = 1; i < rings.length; i++) {
    if (!isPointInRing(rings[i][0], ext)) {
      hasExternalHole = true;
      break;
    }
  }
  if (!hasExternalHole) return layer;
  const cleaned = cleanAndSeparatePolygons(geo);
  if (cleaned.length === 0) return layer;
  const allCoords = [];
  cleaned.forEach(cp => {
    if (cp.geometry.type === 'Polygon') allCoords.push(cp.geometry.coordinates);else if (cp.geometry.type === 'MultiPolygon') allCoords.push(...cp.geometry.coordinates);
  });
  const prevProps = layer.feature && layer.feature.properties || {};
  const color = prevProps.fill || layer.options.fillColor || PREVIEW_COLOR;
  const unifiedFeature = {
    type: 'Feature',
    properties: {
      ...prevProps,
      fill: color,
      stroke: color,
      "fill-opacity": 1,
      "stroke-width": 0,
      "stroke-dasharray": null
    },
    geometry: allCoords.length > 1 ? {
      type: 'MultiPolygon',
      coordinates: allCoords
    } : cleaned[0].geometry
  };
  S.drawnItems.removeLayer(layer);
  const newLayer = L.geoJSON(unifiedFeature, {
    style: {
      fillColor: color,
      color: color,
      fillOpacity: 1,
      weight: 0,
      dashArray: null
    }
  }).getLayers()[0];
  newLayer.feature = unifiedFeature;
  applyShapeLockStyle(newLayer);
  S.drawnItems.addLayer(newLayer);
  if (S.activeSelectedLayer === layer) S.activeSelectedLayer = newLayer;
  newLayer.on('click', () => {
    if (S.splitModeActive) return;
    S.activeSelectedLayer = newLayer;
    populateStyleDrawer(newLayer);
    onFeatureClick(newLayer);
  });
  return newLayer;
}

export async function triggerCutSeaNow() {
  let layer = S.activeSelectedLayer || getLastDrawnPolygon();
  if (!layer) {
    showToast("Please draw a polygon first!");
    return;
  }
  layer = healLayerGeometryIfCorrupted(layer);
  cutSeaFromPolygon(layer);
}

export function getLastDrawnPolygon() {
  const layers = S.drawnItems.getLayers();
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i] instanceof L.Polygon) return layers[i];
  }
  return null;
}

export async function cutSeaFromPolygon(targetLayer, opts) {
  if (!targetLayer) {
    showToast("Select a polygon first!");
    return;
  }
  // No-islands mode: keep only the mainland. An explicit option wins over the
  // global toggle so one-shot buttons can force either behaviour.
  const noIslands = typeof opts === 'boolean' ? opts : opts && typeof opts.noIslands === 'boolean' ? opts.noIslands : !!S.cutSeaNoIslands;

  // Turf powers the boolean geometry ops — make sure it's here
  await ensureHeavyLibs();
  if (S.landFeaturesList.length === 0) {
    showToast("Loading coastlines, one moment...");
    await loadGlobalLandmass();
    if (S.landFeaturesList.length === 0) {
      showToast("Coastline data unavailable (offline).");
      return;
    }
  }

  // Target layer may have previous artifacts — heal first
  targetLayer = healLayerGeometryIfCorrupted(targetLayer);
  const drawnGeo = targetLayer.toGeoJSON();
  const sanitizedDrawn = cleanAndSeparatePolygons(drawnGeo);
  // Compute full bounding box of all drawn parts
  const drawnBbox = computeGeoBbox(drawnGeo.geometry);
  const candidateLands = S.landFeaturesList.filter(landPoly => {
    const b = landPoly.bbox;
    return !(drawnBbox[0] > b[2] || drawnBbox[2] < b[0] || drawnBbox[1] > b[3] || drawnBbox[3] < b[1]);
  });
  if (candidateLands.length === 0) {
    showToast("Region is 100% in the ocean! No land detected.");
    return;
  }

  // Robust intersection helper supporting both Turf 6 and Turf 7 with fallback repairs
  function intersectPolys(pA, pB) {
    try {
      if (typeof turf !== 'undefined' && turf.intersect) {
        let res = null;
        try {
          res = turf.intersect(turf.featureCollection([pA, pB]));
        } catch (e) {}
        if (!res) {
          try {
            res = turf.intersect(pA, pB);
          } catch (e) {}
        }
        if (res && res.geometry) return res;

        // Precision fallback: try cleanCoords if self-intersections or duplicate nodes exist
        try {
          const cA = turf.cleanCoords ? turf.cleanCoords(pA) : pA;
          const cB = turf.cleanCoords ? turf.cleanCoords(pB) : pB;
          res = turf.intersect(turf.featureCollection([cA, cB]));
          if (res && res.geometry) return res;
        } catch (e) {}
      }
    } catch (e) {
      console.warn('Coast intersection warning:', e);
    }
    return null;
  }

  // Process each drawn part against candidate lands
  const drawnParts = sanitizedDrawn.length > 0 ? sanitizedDrawn : [drawnGeo];
  const intersectedPieces = [];
  for (const dPart of drawnParts) {
    const partBbox = computeGeoBbox(dPart.geometry);
    const partExtRing = dPart.geometry.coordinates && dPart.geometry.coordinates[0];
    for (const landPoly of candidateLands) {
      const lBbox = landPoly.bbox;
      // Quick bounding box check against this drawn part
      if (partBbox[0] > lBbox[2] || partBbox[2] < lBbox[0] || partBbox[1] > lBbox[3] || partBbox[3] < lBbox[1]) {
        continue;
      }
      const isContinent = landPoly._isContinent === true;

      // Optimization & Precision Guard:
      // If this land is an island completely inside the drawn polygon, keep it directly!
      // No Martinez numerical instability or polygon clipping errors on small island shapes.
      let completelyInside = false;
      if (partExtRing && lBbox[0] >= partBbox[0] && lBbox[2] <= partBbox[2] && lBbox[1] >= partBbox[1] && lBbox[3] <= partBbox[3]) {
        const lRing = landPoly.geometry.coordinates && landPoly.geometry.coordinates[0];
        if (lRing && lRing.length > 0) {
          let allIn = true;
          const step = Math.max(1, Math.floor(lRing.length / 8));
          for (let s = 0; s < lRing.length; s += step) {
            if (!isPointInRing(lRing[s], partExtRing)) {
              allIn = false;
              break;
            }
          }
          if (allIn) completelyInside = true;
        }
      }
      if (completelyInside) {
        intersectedPieces.push({
          feature: landPoly,
          isContinent: isContinent,
          isFullyEnclosedIsland: true
        });
        continue;
      }

      // Otherwise, perform boolean intersection
      const result = intersectPolys(dPart, landPoly);
      if (result && result.geometry) {
        intersectedPieces.push({
          feature: result,
          isContinent: isContinent,
          isFullyEnclosedIsland: false
        });
      }
    }
  }
  if (intersectedPieces.length === 0) {
    showToast("Region was drawn entirely over the sea.");
    return;
  }

  // Flatten and extract all pure single Polygon pieces
  const allCleanPolys = [];
  for (const item of intersectedPieces) {
    const piece = item.feature;
    const flattened = typeof turf !== 'undefined' && turf.flatten ? turf.flatten(piece).features : [piece];
    flattened.forEach(f => {
      const cleaned = cleanAndSeparatePolygons(f);
      cleaned.forEach(cp => {
        allCleanPolys.push({
          poly: cp,
          isContinent: item.isContinent,
          isFullyEnclosedIsland: item.isFullyEnclosedIsland
        });
      });
    });
  }
  if (allCleanPolys.length === 0) {
    showToast("No land shape could be computed.");
    return;
  }

  // Rank by area (largest landmass first)
  const ranked = allCleanPolys.map(item => {
    let area = 0;
    try {
      area = turf.area(item.poly);
    } catch (e) {
      area = 1;
    }
    const bbox = computeGeoBbox(item.poly.geometry);
    return {
      poly: item.poly,
      area,
      bbox,
      isContinent: item.isContinent,
      isFullyEnclosedIsland: item.isFullyEnclosedIsland
    };
  }).sort((a, b) => b.area - a.area);
  const primary = ranked[0];
  const maxArea = primary.area;

  // Filter logic:
  // Real islands are ALWAYS preserved — unless no-islands mode is on, in which
  // case only the mainland survives and every secondary piece is dropped.
  // Otherwise ONLY filter out accidental opposite-shore slivers that came from a
  // giant continent across open water.
  const keptSecondary = [];
  let droppedIslands = 0;
  for (let i = 1; i < ranked.length; i++) {
    const item = ranked[i];

    // 0. No-islands mode: mainland only — drop every secondary piece
    if (noIslands) {
      droppedIslands++;
      continue;
    }

    // 1. Fully enclosed islands inside the drawn region are 100% kept
    if (item.isFullyEnclosedIsland) {
      keptSecondary.push(item.poly);
      continue;
    }

    // 2. Any piece that is an island (not from a continent) is 100% kept
    if (!item.isContinent) {
      keptSecondary.push(item.poly);
      continue;
    }

    // 3. For pieces derived from a continent:
    // Filter out accidental opposite-shore slivers:
    // A piece is an accidental opposite-shore sliver IF:
    // - it came from a continent
    // - its area is small (< 8% of primary land)
    // - AND it touches the extreme boundary of drawnBbox across open water.
    const touchesOuterEdge = Math.abs(item.bbox[0] - drawnBbox[0]) < 0.015 || Math.abs(item.bbox[2] - drawnBbox[2]) < 0.015 || Math.abs(item.bbox[1] - drawnBbox[1]) < 0.015 || Math.abs(item.bbox[3] - drawnBbox[3]) < 0.015;
    const isSmallContinentSliver = item.area < maxArea * 0.08;
    if (isSmallContinentSliver && touchesOuterEdge) {
      // Skip accidental opposite-shore continent sliver!
      continue;
    }

    // Otherwise, it is an intentional secondary landmass / large territory
    keptSecondary.push(item.poly);
  }
  const prevProps = targetLayer.feature && targetLayer.feature.properties || {};
  const keepColor = prevProps.fill || targetLayer.options.fillColor || nextUniqueColor();

  // Combine primary landmass and ALL preserved islands into a SINGLE unified region (MultiPolygon)
  const allCoords = [];
  const addGeomCoords = geom => {
    if (!geom) return;
    if (geom.type === 'Polygon') {
      if (geom.coordinates && geom.coordinates.length > 0) allCoords.push(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      if (geom.coordinates) geom.coordinates.forEach(c => allCoords.push(c));
    }
  };
  addGeomCoords(primary.poly.geometry);
  keptSecondary.forEach(secPoly => addGeomCoords(secPoly.geometry));
  const unifiedGeometry = allCoords.length > 1 ? {
    type: "MultiPolygon",
    coordinates: allCoords
  } : primary.poly.geometry;
  const prevName = prevProps.name || targetLayer._customName || `Region #${S.drawnItems.getLayers().length + 1}`;
  const islandCount = Math.max(0, allCoords.length - 1);
  const unifiedFeature = {
    type: "Feature",
    properties: {
      ...prevProps,
      name: prevName,
      fill: keepColor,
      stroke: keepColor,
      "fill-opacity": 1,
      "stroke-width": 0,
      "stroke-dasharray": null,
      islandCount: islandCount,
      isUnifiedIslandRegion: islandCount > 0,
      // Record what no-islands mode threw away, so the result stays explainable
      islandsRemoved: droppedIslands,
      noIslandsMode: !!noIslands
    },
    geometry: unifiedGeometry
  };

  // Remove the old target layer
  S.drawnItems.removeLayer(targetLayer);

  // Create the single unified region layer containing mainland + all islands
  const newLayer = L.geoJSON(unifiedFeature, {
    style: {
      fillColor: keepColor,
      color: keepColor,
      fillOpacity: 1,
      weight: 0,
      dashArray: null
    }
  }).getLayers()[0];
  // Snapshot the metadata BEFORE setupLayerProperties(): newLayer.feature and
  // unifiedFeature are the same object, and setupLayerProperties() replaces
  // feature.properties with just the style keys — which would silently drop
  // islandCount / islandsRemoved / noIslandsMode before they could reach an export.
  const cutMeta = { ...unifiedFeature.properties };
  newLayer.feature = unifiedFeature;
  setupLayerProperties(newLayer);
  newLayer.feature.properties = {
    ...newLayer.feature.properties,
    ...cutMeta,
  };
  applyShapeLockStyle(newLayer);
  S.drawnItems.addLayer(newLayer);
  S.activeSelectedLayer = newLayer;
  newLayer.on('click', () => {
    if (S.splitModeActive) return;
    S.activeSelectedLayer = newLayer;
    populateStyleDrawer(newLayer);
    onFeatureClick(newLayer);
  });
  populateStyleDrawer(newLayer);
  updateMobileSelectionBar();
  updateStats();
  if (noIslands && droppedIslands > 0) {
    showToast(`Coastline trimmed — mainland only! ${droppedIslands} ${droppedIslands === 1 ? 'island' : 'islands'} removed.`);
  } else if (noIslands) {
    showToast("Coastline trimmed — mainland only (no islands were present).");
  } else {
    showToast(islandCount > 0 ? `Coastline trimmed! United mainland & ${islandCount} ${islandCount === 1 ? 'island' : 'islands'} in 1 single region.` : "Coastline trimmed cleanly! Kept land shape with no sea artifacts.");
  }
  return newLayer;
}

export function toggleAutoSeaCut() {
  S.autoCutSeaEnabled = !S.autoCutSeaEnabled;
  mobileHaptic(S.autoCutSeaEnabled ? [7, 24, 7] : 7);
  const text = document.getElementById('text-auto-seacut');
  const indicator = document.getElementById('indicator-auto-seacut');
  const mobileText = document.getElementById('text-sea-mobile');
  const mobileIndicator = document.getElementById('indicator-sea-mobile');
  const mobileButton = document.getElementById('btn-sea-mobile');
  if (S.autoCutSeaEnabled) {
    if (text) {
      text.textContent = "ON";
      text.className = "text-cyan-400";
    }
    if (indicator) indicator.className = "w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400";
    if (mobileText) {
      mobileText.textContent = 'ON';
      mobileText.className = 'text-cyan-300';
    }
    if (mobileIndicator) mobileIndicator.className = 'w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400';
    if (mobileButton) {
      mobileButton.classList.add('border-cyan-500', 'bg-cyan-950/90', 'text-cyan-100');
    }
    showToast("Auto-Cut Sea is now ON");
  } else {
    if (text) {
      text.textContent = "OFF";
      text.className = "text-slate-400";
    }
    if (indicator) indicator.className = "w-2 h-2 rounded-full bg-slate-500";
    if (mobileText) {
      mobileText.textContent = 'OFF';
      mobileText.className = 'text-slate-500';
    }
    if (mobileIndicator) mobileIndicator.className = 'w-2 h-2 rounded-full bg-slate-500';
    if (mobileButton) {
      mobileButton.classList.remove('border-cyan-500', 'bg-cyan-950/90', 'text-cyan-100');
    }
    showToast("Auto-Cut Sea is now OFF");
  }
}

// ================= CUT SEA — NO ISLANDS MODE =================
// Keeps only the largest landmass (the mainland) when cutting a shape to the
// coast, dropping every island instead of uniting them into one MultiPolygon.
export function updateCutSeaNoIslandsUI() {
  const on = !!S.cutSeaNoIslands;
  // The pills read as "Islands: ON/OFF" — ON means islands are kept (default),
  // OFF means no-islands mode is active.
  const setText = (id, txt, onClass, offClass) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = txt;
    el.className = on ? onClass : offClass;
  };
  setText('text-islands-header', on ? 'OFF' : 'ON', 'text-amber-300', 'text-emerald-400');
  setText('text-islands-mobile', on ? 'OFF' : 'ON', 'text-amber-300', 'text-emerald-300');

  const ind = document.getElementById('indicator-islands-header');
  if (ind) ind.className = on ? 'w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400' : 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400';
  const indMobile = document.getElementById('indicator-islands-mobile');
  if (indMobile) indMobile.className = on ? 'w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400' : 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400';

  const btnHeader = document.getElementById('btn-islands-header');
  if (btnHeader) btnHeader.classList.toggle('border-amber-500/70', on);
  const btnMobile = document.getElementById('btn-islands-mobile');
  if (btnMobile) {
    btnMobile.classList.toggle('border-amber-500', on);
    btnMobile.classList.toggle('bg-amber-950/80', on);
    btnMobile.classList.toggle('text-amber-100', on);
  }

  // Settings card
  const status = document.getElementById('status-cut-no-islands');
  if (status) {
    status.textContent = on ? 'ON' : 'OFF';
    status.className = on ? 'text-[10px] font-bold text-amber-400' : 'text-[10px] font-bold text-slate-400';
  }
  const checkbox = document.getElementById('toggle-cut-no-islands');
  if (checkbox) checkbox.checked = on;

  // One-shot button label in the Style panel reflects the current default
  const oneShot = document.getElementById('btn-cut-sea-no-islands');
  if (oneShot) oneShot.classList.toggle('ring-1', on);
}

export function toggleCutSeaNoIslands() {
  S.cutSeaNoIslands = !S.cutSeaNoIslands;
  mobileHaptic(S.cutSeaNoIslands ? [7, 24, 7] : 7);
  updateCutSeaNoIslandsUI();
  showToast(S.cutSeaNoIslands ? 'Cut Sea: islands OFF — mainland only will be kept' : 'Cut Sea: islands ON — mainland & islands united in one region');
}

// One-shot: cut the current shape to the coast with islands dropped, regardless
// of how the global toggle is set.
export async function cutSeaNoIslandsNow() {
  let layer = S.activeSelectedLayer || getLastDrawnPolygon();
  if (!layer) {
    showToast('Please draw a polygon first!');
    return null;
  }
  layer = healLayerGeometryIfCorrupted(layer);
  return cutSeaFromPolygon(layer, { noIslands: true });
}

// ================= REFERENCE IMAGE ENGINE =================
