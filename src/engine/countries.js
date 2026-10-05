// Split out of the original single-file engine (see legacy/index.html).
// Origin: LOAD COUNTRIES AS EDITABLE GEOJSON

import L from 'leaflet';
import { S } from './state.js';
import { computeGeoBbox, escapeXml, gridKey, nextTick, yieldFrame } from '../lib/util.js';
import { currentLoadMode } from './bootstrap.js';
import { refineSelectionWithTilesCoast } from './coastTiles.js';
import { nextUniqueColor, setupLayerProperties } from './colors.js';
import { ADM1_SOURCES, GRID_CELL, adminMetaCache, curveStore } from './constants.js';
import { exitCurveEdgeMode } from './curves.js';
import { onFeatureClick } from './exporters/geojson.js';
import { ensureHeavyLibs, topojson, turf } from './heavyLibs.js';
import { clearMergeSelection, highlightMergeLayer, setMergeStatus, updateCountriesUI, updateMergeModeUI } from './merge.js';
import { updateStats, updateStatsNow } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { isDesktopUI } from './tutorial.js';
import { closeDrawers, mobileHaptic, showToast } from './uiHelpers.js';

// ================= LOAD COUNTRIES AS EDITABLE GEOJSON =================
// Pulls the complete Natural Earth country dataset (every sovereign state
// and dependency) and drops each one onto the map as its own editable,
// uniquely colored shape carrying its real name.
export function setCountriesStatus(txt, tone) {
  const el = document.getElementById('countries-status');
  if (!el) return;
  el.textContent = txt;
  el.className = tone === 'ok' ? 'text-[10px] font-mono text-emerald-300 leading-relaxed' : tone === 'warn' ? 'text-[10px] font-mono text-amber-300 leading-relaxed' : 'text-[10px] font-mono text-slate-400 leading-relaxed';
}

export function resetCountryIndex() {
  const box = document.getElementById('country-results');
  if (box) {
    box.innerHTML = '';
    box.classList.add('hidden');
  }
  setCountriesStatus('Detail level changed — search again to load countries at the new fidelity.', null);
}

export function onCountrySearchInput() {
  clearTimeout(S.countrySearchTimer);
  S.countrySearchTimer = setTimeout(() => {
    ensureActiveIndex();
  }, 140);
}

export function onLoadModeChange() {
  const mode = currentLoadMode();
  const input = document.getElementById('country-search');
  if (input) {
    input.placeholder = mode === 'adm1' ? 'Search a province — Bavaria, Ontario, Kerala…' : mode === 'adm2' ? 'Search a country — its districts will load' : 'Search a country — Vietnam, Brazil…';
  }
  const box = document.getElementById('country-results');
  if (box) {
    box.innerHTML = '';
    box.classList.add('hidden');
  }
  const refine = document.getElementById('country-refine');
  if (refine) refine.disabled = mode === 'adm2';
  if (mode === 'adm1') {
    setCountriesStatus(S.adm1IndexCache ? `${S.adm1IndexCache.length} provinces / states indexed — type a name to load one.` : 'Downloading the global provinces index (one time)…', S.adm1IndexCache ? 'ok' : 'warn');
  }
  ensureActiveIndex().catch(() => {});
}

export async function ensureActiveIndex() {
  const mode = currentLoadMode();
  if (mode === 'adm1') return ensureAdm1Index();
  return ensureCountryIndex();
}

// Global, searchable index of every province / state on Earth

// Global, searchable index of every province / state on Earth
export async function ensureAdm1Index() {
  const box = document.getElementById('country-results');
  if (box) box.classList.remove('hidden');
  if (S.adm1IndexCache) {
    renderCountryResults();
    return S.adm1IndexCache;
  }
  if (S.adm1IndexPromise) return S.adm1IndexPromise;
  S.adm1IndexPromise = (async () => {
    try {
      await ensureHeavyLibs();
      let fc = null;
      for (let s = 0; s < ADM1_SOURCES.length && !fc; s++) {
        try {
          setCountriesStatus(`Downloading the global provinces index… (source ${s + 1}/${ADM1_SOURCES.length})`, 'warn');
          await nextTick();
          const r = await fetch(ADM1_SOURCES[s]);
          if (!r.ok) continue;
          const j = await r.json();
          if (j && Array.isArray(j.features) && j.features.length > 50) fc = j;
        } catch (e) {/* try the next mirror */}
      }
      if (!fc) {
        setCountriesStatus('Could not download the provinces index — check your connection.', 'warn');
        S.adm1IndexPromise = null;
        return null;
      }
      const feats = fc.features.filter(f => f.geometry);
      const list = [];
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const p = f.properties || {};
        list.push({
          id: `a1-${i}`,
          name: String(p.name || p.NAME || p.name_en || `Unit ${i + 1}`),
          admin: String(p.admin || p.ADMIN || p.admin_name || p.iso_a2 || ''),
          feature: f,
          bbox: computeGeoBbox(f.geometry)
        });
        if (i % 120 === 0) {
          setCountriesStatus(`Indexing provinces ${i + 1} / ${feats.length}…`, 'warn');
          await nextTick();
        }
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      S.adm1IndexCache = list;
      setCountriesStatus(`${list.length} provinces / states indexed globally — type a name to load one.`, 'ok');
      renderCountryResults();
      return list;
    } catch (err) {
      console.warn('ADM1 index failed:', err);
      setCountriesStatus('Provinces index failed to build.', 'warn');
      S.adm1IndexPromise = null;
      return null;
    }
  })();
  return S.adm1IndexPromise;
}

export async function ensureCountryIndex() {
  const level = document.getElementById('countries-level').value;
  const box = document.getElementById('country-results');
  if (box) box.classList.remove('hidden');
  if (S.countriesIndexCache[level]) {
    renderCountryResults();
    return S.countriesIndexCache[level];
  }
  if (S.countryIndexPromises[level]) return S.countryIndexPromises[level];
  S.countryIndexPromises[level] = (async () => {
    try {
      if (level === '10m') setCountriesStatus('Downloading 10m index (~5 MB, one time)…', 'warn');else setCountriesStatus(`Downloading country index (${level})…`, 'warn');
      await ensureHeavyLibs();
      let topo;
      try {
        const r = await fetch(`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${level}.json`);
        if (!r.ok) throw new Error('retry');
        topo = await r.json();
      } catch (e) {
        const r2 = await fetch(`https://unpkg.com/world-atlas@2.0.2/countries-${level}.json`);
        topo = await r2.json();
      }
      const fc = topojson.feature(topo, topo.objects.countries);
      const feats = (fc.features || []).filter(f => f.geometry);
      const list = [];
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        list.push({
          id: f.id != null ? String(f.id) : `idx-${i}`,
          name: f.properties && f.properties.name || `Country ${i + 1}`,
          feature: f,
          bbox: computeGeoBbox(f.geometry)
        });
        if (i % 60 === 0) {
          setCountriesStatus(`Indexing ${i + 1} / ${feats.length}…`, 'warn');
          await nextTick();
        }
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      S.countriesIndexCache[level] = list;
      setCountriesStatus(`${list.length} countries indexed — type a name to load one.`, 'ok');
      renderCountryResults();
      return list;
    } catch (err) {
      console.warn('Country index failed:', err);
      setCountriesStatus('Could not download the country index — check your connection.', 'warn');
      return [];
    } finally {
      delete S.countryIndexPromises[level];
    }
  })();
  return S.countryIndexPromises[level];
}

export function renderCountryResults() {
  const mode = currentLoadMode();
  const level = (document.getElementById('countries-level') || {}).value || '50m';
  const list = mode === 'adm1' ? S.adm1IndexCache : S.countriesIndexCache[level];
  const box = document.getElementById('country-results');
  if (!box) return;
  if (!list) {
    box.classList.remove('hidden');
    box.innerHTML = `<div class="text-slate-500 text-center py-3 text-[11px]">Building the index…</div>`;
    return;
  }
  const q = (document.getElementById('country-search').value || '').trim().toLowerCase();
  const matches = (q ? list.filter(e => e.name.toLowerCase().includes(q) || e.admin && e.admin.toLowerCase().includes(q)) : list).slice(0, 40);
  if (matches.length === 0) {
    box.innerHTML = `<div class="text-slate-500 text-center py-3 text-[11px]">No ${mode === 'adm1' ? 'province / state' : 'country'} matches “${escapeXml(q)}”</div>`;
    return;
  }
  box.innerHTML = matches.map(e => {
    const layer = S.countryLayerById[e.id];
    const loaded = layer && S.drawnItems.hasLayer(layer);
    const label = mode === 'adm1' && e.admin ? `${e.name} — ${e.admin}` : e.name;
    return `<button onclick="loadCountryFeatureById('${e.id}')" class="w-full p-2 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition ${loaded ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200' : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-indigo-600 hover:bg-slate-800'}">
          <span class="font-semibold truncate">${escapeXml(label)}</span>
          <span class="text-[9px] font-mono shrink-0 ${loaded ? 'text-emerald-400' : 'text-slate-500'}">${loaded ? 'loaded ✓' : 'load'}</span>
        </button>`;
  }).join('');
}

export function loadCountryFeatureById(id) {
  const level = (document.getElementById('countries-level') || {}).value || '50m';
  const pools = [S.countriesIndexCache[level] || [], S.adm1IndexCache || []];
  let entry = null;
  for (let i = 0; i < pools.length && !entry; i++) entry = pools[i].find(e => e.id === id);
  if (!entry) return;
  loadCountryFeature(entry);
  renderCountryResults();
}

export function loadCountryFeature(entry, forceSingle) {
  const mode = currentLoadMode();

  // Districts: pick a country, then geoBoundaries supplies its ADM2 units.
  // forceSingle (used by select-on-map) never triggers a bulk district load.
  if (mode === 'adm2' && !forceSingle) {
    loadAdminUnits(entry, 'ADM2');
    return;
  }

  // 'country' and 'adm1' both load a single feature — a province entry
  // carries its parent country in `admin`, shown in every label.

  // Already loaded? Just select + zoom to it
  const existing = S.countryLayerById[entry.id];
  if (existing && S.drawnItems.hasLayer(existing)) {
    S.activeSelectedLayer = existing;
    populateStyleDrawer(existing);
    S.map.fitBounds(existing.getBounds(), {
      padding: [40, 40],
      maxZoom: 9
    });
    showToast(`${entry.name} is already loaded — zoomed to it`);
    return;
  }
  const shapeJustLoaded = true; // a brand-new shape is being added below

  const c = nextUniqueColor();
  const layer = L.geoJSON(entry.feature, {
    style: {
      color: c,
      fillColor: c,
      fillOpacity: 1,
      weight: 0,
      dashArray: null
    }
  }).getLayers()[0];
  if (!layer) {
    showToast('Country geometry could not be rendered');
    return;
  }
  setupLayerProperties(layer);
  layer.feature.properties.name = entry.name;
  layer.feature.properties.fill = c;
  layer.feature.properties.stroke = c;
  layer.feature.properties['fill-opacity'] = 1;
  layer.feature.properties['stroke-width'] = 0;
  layer.feature.properties['stroke-dasharray'] = null;
  if (typeof layer.setStyle === 'function') {
    layer.setStyle({
      color: c,
      fillColor: c,
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
  S.countryLayers.push(layer);
  S.countryLayerById[entry.id] = layer;
  S.activeSelectedLayer = layer;
  S.map.fitBounds(layer.getBounds(), {
    padding: [40, 40],
    maxZoom: 9
  });
  populateStyleDrawer(layer);
  updateStats();
  updateCountriesUI();
  if (mode === 'adm1' && entry.admin) layer.feature.properties.note = `${entry.admin} · province/state`;
  const display = entry.admin && mode === 'adm1' ? `${entry.name} — ${entry.admin}` : entry.name;
  const typeTxt = entry.feature.geometry.type === 'MultiPolygon' ? 'multi-part polygon (islands included)' : 'polygon';
  setCountriesStatus(`${display} loaded — ${typeTxt} · editable & exportable`, 'ok');
  showToast(`Loaded ${display} as an editable shape`);

  // One-click "load countries with that coastline": refine straight away
  const refineBox = document.getElementById('country-refine');
  if (refineBox && refineBox.checked) {
    setCountriesStatus(`${display} loaded — fetching real coastline…`, 'warn');
    refineSelectionWithTilesCoast(true).then(() => {
      setCountriesStatus(`${display} — coast-accurate borders (OSM)`, 'ok');
    }).catch(() => {
      setCountriesStatus(`${display} loaded (coastline refine failed)`, 'warn');
    });
  }

  // "Country + all its provinces": outline first, then every ADM1 unit
  if (mode === 'adm1plus') {
    if (shapeJustLoaded) loadAdminUnits(entry, 'ADM1');
  }
}

// ---- Province / region loading (geoBoundaries ADM1 / ADM2) ----

// ---- Province / region loading (geoBoundaries ADM1 / ADM2) ----
export function ensureIsoTable() {
  if (S.numToAlpha3) return Promise.resolve(S.numToAlpha3);
  if (S.isoTablePromise) return S.isoTablePromise;
  S.isoTablePromise = (async () => {
    const urls = ['https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.11.0/codes.json', 'https://unpkg.com/i18n-iso-countries@7.11.0/codes.json'];
    for (const u of urls) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        const j = await r.json();
        const map = {};
        Object.values(j).forEach(v => {
          if (v && v.numeric && v.alpha3) map[String(v.numeric).padStart(3, '0')] = v.alpha3;
        });
        if (Object.keys(map).length > 100) {
          S.numToAlpha3 = map;
          return map;
        }
      } catch (e) {/* try next mirror */}
    }
    S.isoTablePromise = null;
    throw new Error('ISO country-code table unavailable');
  })();
  return S.isoTablePromise;
}

export async function fetchAdminBoundaries(entry, adm) {
  await ensureHeavyLibs();
  const isoMap = await ensureIsoTable();
  const iso = isoMap[String(entry.id).padStart(3, '0')];
  if (!iso) throw new Error('no ISO-3 code for this country');
  const key = `${iso}-${adm}`;
  let m = adminMetaCache[key];
  if (!m) {
    const r = await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${iso}/${adm}/`);
    if (!r.ok) throw new Error('geoBoundaries lookup failed (HTTP ' + r.status + ')');
    const meta = await r.json();
    m = Array.isArray(meta) ? meta[0] : meta;
    if (!m) throw new Error('geoBoundaries returned no dataset');
    adminMetaCache[key] = m;
  }
  const gjUrl = m.gjDownloadURL || m.simplifiedGeometryGeoJSON || m.gjDownloadURL_simplified;
  if (!gjUrl) throw new Error('no GeoJSON URL in the dataset metadata');
  const r2 = await fetch(gjUrl);
  if (!r2.ok) throw new Error('GeoJSON download failed (HTTP ' + r2.status + ')');
  return {
    fc: await r2.json(),
    meta: m,
    iso
  };
}

export async function loadAdminUnits(entry, adm) {
  const label = adm === 'ADM1' ? 'provinces / states' : 'districts / regions';
  setCountriesStatus(`Looking up ${label} of ${entry.name}…`, 'warn');
  try {
    const {
      fc,
      meta
    } = await fetchAdminBoundaries(entry, adm);
    const feats = (fc.features || []).filter(f => f.geometry);
    if (feats.length === 0) throw new Error('dataset contains no geometries');
    if (feats.length > 250) {
      const ok = confirm(`${entry.name} has ${feats.length} ${label} in this dataset.\n\nLoad them all as editable shapes? This can be heavy.`);
      if (!ok) {
        setCountriesStatus('cancelled', null);
        return;
      }
    }
    setCountriesStatus(`Adding ${feats.length} ${label} of ${entry.name}…`, 'warn');
    await nextTick();
    let added = 0;
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const c = nextUniqueColor();
      const layer = L.geoJSON(f, {
        // smoothFactor: 2 skips sub-pixel vertices when rendering — a big
        // win on province polygons with thousands of points each
        style: {
          color: c,
          fillColor: c,
          fillOpacity: 1,
          weight: 0,
          dashArray: null,
          smoothFactor: 2
        }
      }).getLayers()[0];
      if (!layer) continue;
      if (typeof layer.setStyle === 'function') layer.options.smoothFactor = 2;
      setupLayerProperties(layer);
      const nm = f.properties && (f.properties.shapeName || f.properties.NAME_1 || f.properties.NAME_2 || f.properties.name || f.properties.NAME) || `${adm} ${i + 1}`;
      layer.feature.properties.name = String(nm);
      layer.feature.properties.note = `${entry.name} · ${adm}`;
      layer.feature.properties.fill = c;
      layer.feature.properties.stroke = c;
      layer.feature.properties['fill-opacity'] = 1;
      layer.feature.properties['stroke-width'] = 0;
      layer.feature.properties['stroke-dasharray'] = null;
      if (typeof layer.setStyle === 'function') {
        layer.setStyle({
          color: c,
          fillColor: c,
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
      S.countryLayers.push(layer);
      added++;

      // 60 shapes per frame: Leaflet coalesces canvas redraws per frame, so
      // bigger chunks = far fewer full redraws for the same result.
      if (i % 60 === 0) {
        setCountriesStatus(`Adding ${i + 1} / ${feats.length}…`, 'warn');
        await yieldFrame();
      }
    }
    updateStatsNow(); // one refresh at the end, not 300 during the loop

    try {
      const bb = turf.bbox(fc);
      S.map.fitBounds(L.latLngBounds([bb[1], bb[0]], [bb[3], bb[2]]), {
        padding: [20, 20],
        maxZoom: 9
      });
    } catch (e) {
      if (entry.bbox) S.map.fitBounds(L.latLngBounds([entry.bbox[1], entry.bbox[0]], [entry.bbox[3], entry.bbox[2]]), {
        padding: [20, 20]
      });
    }
    updateStats();
    updateCountriesUI();
    renderCountryResults();
    setCountriesStatus(`${added} ${label} of ${entry.name} loaded — editable, styleable & exportable`, 'ok');
    showToast(`Loaded ${added} ${label} of ${entry.name}`);
  } catch (err) {
    console.warn('Admin levels load failed:', err);
    setCountriesStatus(`Could not load ${label} for ${entry.name}: ${err.message}`, 'warn');
    showToast(`Province/region load failed: ${err.message}`);
  }
}

// ---- Select on map: click a country / province to load it ----

// ---- Select on map: click a country / province to load it ----
export function updateSelectOnMapUI() {
  // Header pill (always visible on the map, outside every panel)
  const txt = document.getElementById('text-pick-header');
  const ind = document.getElementById('indicator-pick-header');
  if (txt) {
    txt.textContent = S.selectOnMapMode ? 'ON' : 'OFF';
    txt.className = S.selectOnMapMode ? 'text-indigo-300' : 'text-slate-400';
  }
  if (ind) {
    ind.className = S.selectOnMapMode ? 'w-2 h-2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }

  // Mobile mode rail
  const mobileTxt = document.getElementById('text-pick-mobile');
  const mobileInd = document.getElementById('indicator-pick-mobile');
  const mobileBtn = document.getElementById('btn-pick-mobile');
  if (mobileTxt) {
    mobileTxt.textContent = S.selectOnMapMode ? 'ON' : 'OFF';
    mobileTxt.className = S.selectOnMapMode ? 'text-indigo-300' : 'text-slate-500';
  }
  if (mobileInd) {
    mobileInd.className = S.selectOnMapMode ? 'w-2 h-2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }
  if (mobileBtn) {
    mobileBtn.classList.toggle('border-indigo-500', S.selectOnMapMode);
    mobileBtn.classList.toggle('bg-indigo-950/90', S.selectOnMapMode);
    mobileBtn.classList.toggle('text-indigo-100', S.selectOnMapMode);
  }

  // Desktop rail button
  const rail = document.getElementById('btn-pick-rail');
  if (rail) {
    rail.classList.toggle('bg-indigo-600', S.selectOnMapMode);
    rail.classList.toggle('text-white', S.selectOnMapMode);
    rail.classList.toggle('text-slate-300', !S.selectOnMapMode);
  }

  // Panel button (kept in sync for discoverability)
  const btn = document.getElementById('btn-select-on-map');
  const label = document.getElementById('select-on-map-label');
  if (label) label.textContent = `Select on map: ${S.selectOnMapMode ? 'ON' : 'OFF'}`;
  if (btn) {
    btn.classList.toggle('bg-indigo-600', S.selectOnMapMode);
    btn.classList.toggle('text-white', S.selectOnMapMode);
    btn.classList.toggle('bg-slate-700', !S.selectOnMapMode);
    btn.classList.toggle('text-slate-200', !S.selectOnMapMode);
  }
  if (S.map) S.map.getContainer().style.cursor = S.selectOnMapMode ? 'crosshair' : '';
}

export function toggleSelectOnMapMode() {
  S.selectOnMapMode = !S.selectOnMapMode;
  mobileHaptic(S.selectOnMapMode ? [8, 28, 8] : 8);
  if (S.selectOnMapMode && S.deleteMode) {
    S.deleteMode = false;
    updateDeleteModeUI();
  }
  if (S.selectOnMapMode && S.mergeMode) {
    S.mergeMode = false;
    clearMergeSelection(false);
    updateMergeModeUI();
  }
  updateSelectOnMapUI();
  if (S.selectOnMapMode) {
    if (!isDesktopUI()) closeDrawers();
    showToast('Select on map: click any country / province to load it (Esc to stop)');
    ensureHeavyLibs().then(() => ensureActiveIndex()).then(() => {
      const m = currentLoadMode();
      if (m === 'adm1' && !S.adm1IndexCache) showToast('Province index still building…');
    }).catch(() => {});
  } else {
    showToast('Select-on-map disabled');
  }
}

// Spatial grid index — instead of scanning ~4,600 provinces per click, only
// the entries registered in the tapped 10°×10° cell are tested.

export function ensureGridIndex(list) {
  if (!list || list._gridIndex) return list && list._gridIndex;
  const idx = new Map();
  for (let i = 0; i < list.length; i++) {
    const b = list[i].bbox;
    if (!b) continue;
    const x0 = Math.floor(b[0] / GRID_CELL),
      x1 = Math.floor(b[2] / GRID_CELL);
    const y0 = Math.floor(b[1] / GRID_CELL),
      y1 = Math.floor(b[3] / GRID_CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = `${x}:${y}`;
        let bucket = idx.get(k);
        if (!bucket) {
          bucket = [];
          idx.set(k, bucket);
        }
        bucket.push(list[i]);
      }
    }
  }
  try {
    Object.defineProperty(list, '_gridIndex', {
      value: idx,
      enumerable: false
    });
  } catch (e) {
    list._gridIndex = idx;
  }
  return idx;
}

export function findFeatureAt(latlng, list) {
  if (!list || !list.length || !window.turf) return null;
  const pt = turf.point([latlng.lng, latlng.lat]);
  const idx = ensureGridIndex(list);
  const candidates = idx && idx.get(gridKey(latlng.lng, latlng.lat)) || list;
  for (let i = 0; i < candidates.length; i++) {
    const ent = candidates[i];
    const b = ent.bbox;
    if (!b) continue;
    if (latlng.lng < b[0] || latlng.lng > b[2] || latlng.lat < b[1] || latlng.lat > b[3]) continue;
    try {
      if (turf.booleanPointInPolygon(pt, ent.feature)) return ent;
    } catch (e) {/* self-intersecting edge case — keep looking */}
  }
  return null;
}

export async function onSelectOnMapClick(e) {
  if (!S.selectOnMapMode) return;
  if (S.seaPickMode || S.splitModeActive) return;
  if (S.map.pm && S.map.pm.globalDrawModeEnabled && S.map.pm.globalDrawModeEnabled()) return;
  if (S.curveMode) return;
  await ensureHeavyLibs();
  const mode = currentLoadMode();
  const level = (document.getElementById('countries-level') || {}).value || '50m';

  // Hit-test the active index first, then fall back to the other family
  let hit = null;
  let kind = '';
  if (mode === 'adm1') {
    hit = findFeatureAt(e.latlng, S.adm1IndexCache);
    kind = 'province/state';
    if (!hit) {
      hit = findFeatureAt(e.latlng, S.countriesIndexCache[level]);
      kind = 'country';
    }
  } else {
    hit = findFeatureAt(e.latlng, S.countriesIndexCache[level]);
    kind = 'country';
    if (!hit && S.adm1IndexCache) {
      hit = findFeatureAt(e.latlng, S.adm1IndexCache);
      kind = 'province/state';
    }
  }
  if (!hit) {
    showToast('Nothing under that point — zoom in, or wait for the index to finish loading');
    return;
  }

  // Always a single shape from a map click, even in Districts mode
  loadCountryFeature(hit, true);
  if (kind === 'province/state' && mode !== 'adm1') {
    showToast('Tip: set “Load as” to Provinces to browse states by name too');
  }
}

// ---- Shared removal (used by the button and by Delete-on-map) ----

// ---- Shared removal (used by the button and by Delete-on-map) ----
export function removeShapeCompletely(layer) {
  if (!layer || !S.drawnItems.hasLayer(layer)) return false;
  const mi = S.mergeSelection.indexOf(layer);
  if (mi >= 0) {
    highlightMergeLayer(layer, false);
    S.mergeSelection.splice(mi, 1);
    setMergeStatus();
  }
  Object.keys(S.countryLayerById).forEach(k => {
    if (S.countryLayerById[k] === layer) delete S.countryLayerById[k];
  });
  const ci = S.countryLayers.indexOf(layer);
  if (ci >= 0) S.countryLayers.splice(ci, 1);
  if (curveStore.has(layer)) curveStore.delete(layer);
  if (S.curveModeLayer === layer) exitCurveEdgeMode();
  S.drawnItems.removeLayer(layer);
  if (S.activeSelectedLayer === layer) {
    S.activeSelectedLayer = null;
    populateStyleDrawer(null);
  }
  updateStats();
  updateCountriesUI();
  renderCountryResults();
  return true;
}

// ---- Delete the selected shape (loaded country/province or drawn) ----

// ---- Delete the selected shape (loaded country/province or drawn) ----
export function deleteSelectedLoaded() {
  const layer = S.activeSelectedLayer;
  if (!layer || !S.drawnItems.hasLayer(layer)) {
    showToast('Tap a shape first, or switch on “Delete” in the header to click-to-delete');
    return;
  }
  removeShapeCompletely(layer);
  showToast('Selected shape deleted');
}

// ---- Delete on map: click any shape to remove it ----

// ---- Delete on map: click any shape to remove it ----
export function updateDeleteModeUI() {
  const txt = document.getElementById('text-delete-header');
  const ind = document.getElementById('indicator-delete-header');
  if (txt) {
    txt.textContent = S.deleteMode ? 'ON' : 'OFF';
    txt.className = S.deleteMode ? 'text-rose-300' : 'text-slate-400';
  }
  if (ind) {
    ind.className = S.deleteMode ? 'w-2 h-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }

  // Mobile mode rail
  const mobileTxt = document.getElementById('text-delete-mobile');
  const mobileInd = document.getElementById('indicator-delete-mobile');
  const mobileBtn = document.getElementById('btn-delete-mobile');
  if (mobileTxt) {
    mobileTxt.textContent = S.deleteMode ? 'ON' : 'OFF';
    mobileTxt.className = S.deleteMode ? 'text-rose-300' : 'text-slate-500';
  }
  if (mobileInd) {
    mobileInd.className = S.deleteMode ? 'w-2 h-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }
  if (mobileBtn) {
    mobileBtn.classList.toggle('border-rose-500', S.deleteMode);
    mobileBtn.classList.toggle('bg-rose-950/90', S.deleteMode);
    mobileBtn.classList.toggle('text-rose-100', S.deleteMode);
  }
  const rail = document.getElementById('btn-delete-rail');
  if (rail) {
    rail.classList.toggle('bg-rose-600', S.deleteMode);
    rail.classList.toggle('text-white', S.deleteMode);
    rail.classList.toggle('text-slate-300', !S.deleteMode);
  }
  if (S.map) {
    S.map.getContainer().style.cursor = S.selectOnMapMode || S.deleteMode ? 'crosshair' : '';
  }
}

export function toggleDeleteMode() {
  S.deleteMode = !S.deleteMode;
  mobileHaptic(S.deleteMode ? [8, 28, 8] : 8);
  if (S.deleteMode && S.selectOnMapMode) {
    S.selectOnMapMode = false;
    updateSelectOnMapUI();
  }
  if (S.deleteMode && S.mergeMode) {
    S.mergeMode = false;
    clearMergeSelection(false);
    updateMergeModeUI();
  }
  updateDeleteModeUI();
  if (S.deleteMode) {
    if (!isDesktopUI()) closeDrawers();
    showToast('Delete mode: click any shape to remove it (Esc to stop)');
  } else {
    showToast('Delete-on-map disabled');
  }
}

// ================= MERGE REGIONS =================
// Tap shapes to collect them, then fuse them into a single feature with
// turf.union. Touching regions dissolve their shared border; separated
// ones become one MultiPolygon, so provinces → country works in one pass.
