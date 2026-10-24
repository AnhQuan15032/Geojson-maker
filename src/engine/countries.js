// Split out of the original single-file engine (see legacy/index.html).
// Origin: LOAD COUNTRIES AS EDITABLE GEOJSON

import L from 'leaflet';
import { S } from './state.js';
import { computeGeoBbox, escapeXml, gridKey, nextTick, yieldFrame } from '../lib/util.js';
import { currentLoadMode } from './bootstrap.js';
import { refineSelectionWithTilesCoast } from './coastTiles.js';
import { nextUniqueColor, setupLayerProperties } from './colors.js';
import { unstitchFeature } from './antimeridian.js';
import { ADM1_SOURCES, GRID_CELL, adminMetaCache, curveStore } from './constants.js';
import { exitCurveEdgeMode } from './curves.js';
import { onFeatureClick } from './exporters/geojson.js';
import { ensureHeavyLibs, topojson, turf } from './heavyLibs.js';
import { clearMergeSelection, highlightMergeLayer, setMergeStatus, updateCountriesUI, updateMergeModeUI } from './merge.js';
import { updateStats, updateStatsNow } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { isDesktopUI } from './tutorial.js';
import { closeDrawers, mobileHaptic, showToast, toggleDrawer } from './uiHelpers.js';

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
  // With the index already in memory every keystroke filters instantly; the
  // debounce only guards the first (downloading) search.
  if (activeIndexList()) {
    renderCountryResults();
    return;
  }
  S.countrySearchTimer = setTimeout(() => {
    ensureActiveIndex();
  }, 140);
}

/** The in-memory index the search box is currently filtering, if built. */
function activeIndexList() {
  return currentLoadMode() === 'adm1' ? S.adm1IndexCache : S.countriesIndexCache[currentCountryLevel()];
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
        const f = unstitchFeature(feats[i]);
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

/** Detail level chosen in the panel ('110m' | '50m' | '10m'). */
export function currentCountryLevel() {
  return (document.getElementById('countries-level') || {}).value || '50m';
}

const ATLAS_CACHE = 'gs-world-atlas-v1';
const atlasUrls = (level) => [
  `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-${level}.json`,
  `https://unpkg.com/world-atlas@2.0.2/countries-${level}.json`,
];

/**
 * The world-atlas TopoJSON for a level: from the browser's Cache Storage when
 * it has been downloaded before (instant, works offline), otherwise from the
 * CDN — and stored for next time. Falls back to plain fetch where Cache
 * Storage is unavailable (http://, private mode on some browsers).
 */
export async function fetchWorldAtlas(level) {
  const urls = atlasUrls(level);
  let cache = null;
  try {
    if (typeof caches !== 'undefined' && caches && typeof caches.open === 'function') cache = await caches.open(ATLAS_CACHE);
  } catch (e) {
    cache = null;
  }
  if (cache) {
    for (const url of urls) {
      const hit = await cache.match(url).catch(() => null);
      if (hit) return hit.json();
    }
  }
  let lastErr = null;
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r || !r.ok) throw new Error(`HTTP ${r && r.status}`);
      if (cache) {
        try { await cache.put(url, r.clone()); } catch (e) { /* quota or opaque response — fine */ }
      }
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('download failed');
}

/**
 * Build (once) the searchable index for a detail level. `silent` builds
 * skip the progress / failure messages — used by the start-up prefetch so the
 * first search is instant without the panel chattering while nobody looks.
 */
export function buildCountryIndex(level, { silent = false } = {}) {
  if (S.countriesIndexCache[level]) return Promise.resolve(S.countriesIndexCache[level]);
  if (S.countryIndexPromises[level]) return S.countryIndexPromises[level];
  const say = (txt, tone) => { if (!silent) setCountriesStatus(txt, tone); };
  S.countryIndexPromises[level] = (async () => {
    try {
      if (level === '10m') say('Downloading 10m index (~5 MB, one time)…', 'warn');else say(`Downloading country index (${level})…`, 'warn');
      await ensureHeavyLibs();
      const topo = await fetchWorldAtlas(level);
      const fc = topojson.feature(topo, topo.objects.countries);
      const feats = (fc.features || []).filter(f => f.geometry);
      const list = [];
      for (let i = 0; i < feats.length; i++) {
        // world-atlas is geostitched across ±180° (Russia, Fiji, Antarctica…);
        // cut those rings at the antimeridian or Leaflet draws them as bands.
        const f = unstitchFeature(feats[i]);
        list.push({
          id: f.id != null ? String(f.id) : `idx-${i}`,
          name: f.properties && f.properties.name || `Country ${i + 1}`,
          feature: f,
          bbox: computeGeoBbox(f.geometry)
        });
        if (i % 60 === 0) {
          say(`Indexing ${i + 1} / ${feats.length}…`, 'warn');
          await nextTick();
        }
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      S.countriesIndexCache[level] = list;
      if (currentCountryLevel() === level) {
        setCountriesStatus(`${list.length} countries ready — type a name, press Enter to load the first match.`, 'ok');
        renderCountryResults();
      }
      return list;
    } catch (err) {
      console.warn('Country index failed:', err);
      say('Could not download the country index — check your connection.', 'warn');
      return silent ? null : [];
    } finally {
      delete S.countryIndexPromises[level];
    }
  })();
  return S.countryIndexPromises[level];
}

export async function ensureCountryIndex() {
  const level = currentCountryLevel();
  const box = document.getElementById('country-results');
  if (box) box.classList.remove('hidden');
  renderRecentCountries();
  if (S.countriesIndexCache[level]) {
    renderCountryResults();
    return S.countriesIndexCache[level];
  }
  renderCountryResults(); // "Building the index…" placeholder
  return buildCountryIndex(level);
}

/**
 * Warm the default index in the background (called by bootstrap once the app
 * is idle) so the first country search answers instantly. Skipped on
 * data-saver connections; never shows errors.
 */
export function prefetchCountryIndex() {
  try {
    const conn = typeof navigator !== 'undefined' && navigator.connection;
    if (conn && conn.saveData) return Promise.resolve(null);
  } catch (e) { /* ignore */ }
  const level = currentCountryLevel();
  return buildCountryIndex(level, { silent: true });
}

// ---- Recent countries: one-tap reload of what you loaded before ----

const RECENT_KEY = 'gs.recentCountries';
const RECENT_MAX = 8;

export function recentCountries() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter(e => e && e.id && e.name) : [];
  } catch (e) {
    return [];
  }
}

export function rememberRecentCountry(entry, level, mode) {
  if (!entry || !entry.id) return;
  const next = [{ id: entry.id, name: entry.name, admin: entry.admin || '', level, mode: mode === 'adm1' ? 'adm1' : 'country' }]
    .concat(recentCountries().filter(e => !(e.id === entry.id && e.mode === (mode === 'adm1' ? 'adm1' : 'country'))))
    .slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch (e) { /* storage full / unavailable */ }
  renderRecentCountries();
}

export function clearRecentCountries() {
  try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* ignore */ }
  renderRecentCountries();
}

export function renderRecentCountries() {
  const host = document.getElementById('country-recent');
  if (!host) return;
  const list = recentCountries();
  if (!list.length) {
    host.innerHTML = '';
    host.classList.add('hidden');
    return;
  }
  host.classList.remove('hidden');
  host.innerHTML = `<span class="text-[9px] uppercase font-bold text-slate-500 shrink-0">Recent</span>` + list.map((e, i) => {
    const copies = loadedCopies(e.id).length;
    return `<button type="button" data-recent-index="${i}" title="Load ${escapeXml(e.name)} again${copies ? ` (${copies} on the map)` : ''}" class="px-2 py-1 rounded-lg border text-[10px] font-semibold whitespace-nowrap transition ${copies ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200' : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-indigo-500'}">${escapeXml(e.name)}${copies > 1 ? ` <span class="font-mono text-emerald-400">×${copies}</span>` : ''}</button>`;
  }).join('') + `<button type="button" data-recent-clear="1" title="Forget the recent list" class="px-1.5 py-1 text-[10px] text-slate-500 hover:text-slate-300">✕</button>`;
}

/** Load a recent entry again — switching the detail level back to the one it was loaded at. */
export async function loadRecentCountry(index) {
  const e = recentCountries()[index];
  if (!e) return;
  const levelSel = document.getElementById('countries-level');
  if (e.mode === 'adm1') {
    const list = S.adm1IndexCache || await ensureAdm1Index();
    const entry = (list || []).find(x => x.id === e.id);
    if (entry) loadCountryFeature(entry, true);
    return;
  }
  if (levelSel && e.level && levelSel.value !== e.level && ['110m', '50m', '10m'].includes(e.level)) levelSel.value = e.level;
  const level = e.level && S.countriesIndexCache[e.level] ? e.level : currentCountryLevel();
  const list = S.countriesIndexCache[level] || await buildCountryIndex(level);
  const entry = (list || []).find(x => x.id === e.id) || (list || []).find(x => x.name === e.name);
  if (!entry) {
    showToast(`${e.name} is not in the ${level} index`);
    return;
  }
  loadCountryFeature(entry, true);
  renderCountryResults();
}

/** Copies of a country / province currently on the map. */
export function loadedCopies(entryId) {
  if (!S.drawnItems) return [];
  return (S.countryLayers || []).filter(l => l && l._countryEntryId === entryId && S.drawnItems.hasLayer(l));
}

/** Enter in the search box loads the first match; Escape clears the box. */
export function onCountrySearchKey(e) {
  if (!e) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(S.countrySearchTimer);
    if (activeIndexList()) renderCountryResults(); // filter for what is typed right now
    const btn = document.querySelector('#country-results [data-country-id]');
    if (btn) loadCountryFeatureById(btn.getAttribute('data-country-id'));
    else ensureActiveIndex().then(() => {
      const first = document.querySelector('#country-results [data-country-id]');
      if (first) loadCountryFeatureById(first.getAttribute('data-country-id'));
    });
  } else if (e.key === 'Escape') {
    const input = document.getElementById('country-search');
    if (input && input.value) {
      input.value = '';
      renderCountryResults();
    }
  }
}

/**
 * Fastest way to a country: open the Map panel, bring the country search into
 * view and focus it (which also kicks off the index). Rail button, mobile menu
 * and the `L` shortcut all land here.
 */
export function openCountrySearch() {
  const drawer = document.getElementById('layers-drawer');
  if (drawer && !drawer.classList.contains('open')) toggleDrawer('layers-drawer');
  const block = document.getElementById('country-loader');
  const input = document.getElementById('country-search');
  if (block && typeof block.scrollIntoView === 'function') {
    try { block.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { block.scrollIntoView(); }
  }
  if (input) {
    input.focus({ preventScroll: true });
    if (input.value) input.select();
  }
  ensureActiveIndex().catch(() => {});
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
    const copies = loadedCopies(e.id).length;
    const loaded = copies > 0;
    const label = mode === 'adm1' && e.admin ? `${e.name} — ${e.admin}` : e.name;
    const tag = !loaded ? 'load' : copies === 1 ? 'loaded ✓ · load again' : `×${copies} on map · load again`;
    return `<button type="button" data-country-id="${e.id}" class="w-full p-2 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition ${loaded ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200' : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-indigo-600 hover:bg-slate-800'}">
          <span class="font-semibold truncate">${escapeXml(label)}</span>
          <span class="text-[9px] font-mono shrink-0 ${loaded ? 'text-emerald-400' : 'text-slate-500'}">${tag}</span>
        </button>`;
  }).join('');
  // clicks are handled once, by the delegated listener at the bottom of this file
  renderRecentCountries();
}

export function loadCountryFeatureById(id) {
  const level = currentCountryLevel();
  const pools = [S.countriesIndexCache[level] || [], S.adm1IndexCache || []];
  let entry = null;
  for (let i = 0; i < pools.length && !entry; i++) entry = pools[i].find(e => e.id === id);
  if (!entry) return;
  loadCountryFeature(entry);
  renderCountryResults();
}

function cloneFeature(feature) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(feature);
  } catch (e) { /* fall through */ }
  return JSON.parse(JSON.stringify(feature));
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

  // Loading the same country again adds another copy (handy for before/after
  // morphs, alternative colourings, or cutting one copy to the coast) — the
  // copies are numbered so they stay apart in the layer lists.
  const copies = loadedCopies(entry.id).length;
  const copyName = copies ? `${entry.name} (${copies + 1})` : entry.name;

  const c = nextUniqueColor();
  // Every copy gets its own feature object: Leaflet keeps the GeoJSON it was
  // given as `layer.feature`, so without a clone the copies (and the index
  // entry) would share one `properties` and overwrite each other's names.
  const feature = cloneFeature(entry.feature);
  const layer = L.geoJSON(feature, {
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
  layer._countryEntryId = entry.id;
  layer.feature.properties.name = copyName;
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
    if (S.splitModeActive) return;
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
  const display = entry.admin && mode === 'adm1' ? `${copyName} — ${entry.admin}` : copyName;
  const typeTxt = entry.feature.geometry.type === 'MultiPolygon' ? 'multi-part polygon (islands included)' : 'polygon';
  setCountriesStatus(`${display} loaded — ${typeTxt} · editable & exportable${copies ? ` · copy ${copies + 1} of ${entry.name}` : ''}`, 'ok');
  showToast(copies ? `Loaded another ${entry.name} (copy ${copies + 1})` : `Loaded ${display} as an editable shape`);
  rememberRecentCountry(entry, currentCountryLevel(), mode);

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
  // (only for the first copy — the provinces are already on the map after that)
  if (mode === 'adm1plus' && !copies) loadAdminUnits(entry, 'ADM1');
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
        if (S.splitModeActive) return;
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
  const _turf = turf || (typeof window !== 'undefined' ? window.turf : null);
  if (!list || !list.length || !_turf) return null;
  const pt = _turf.point([latlng.lng, latlng.lat]);
  const idx = ensureGridIndex(list);
  const candidates = idx && idx.get(gridKey(latlng.lng, latlng.lat)) || list;
  for (let i = 0; i < candidates.length; i++) {
    const ent = candidates[i];
    const b = ent.bbox;
    if (!b) continue;
    if (latlng.lng < b[0] || latlng.lng > b[2] || latlng.lat < b[1] || latlng.lat > b[3]) continue;
    try {
      const __turf = turf || (typeof window !== 'undefined' ? window.turf : null);
      if (__turf && __turf.booleanPointInPolygon(pt, ent.feature)) return ent;
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

  // Always a single shape from a map click, even in Districts mode. A second
  // tap on the same country within half a second is a double-tap, not a
  // request for another copy.
  const now = Date.now();
  if (S._lastMapPick && S._lastMapPick.id === hit.id && now - S._lastMapPick.at < 600) return;
  S._lastMapPick = { id: hit.id, at: now };
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

// Globals kept for the legacy monolith's callers; the result and recent
// buttons themselves are handled ONCE here by delegation (no inline onclick —
// that used to fire the load twice, which matters now that every load adds a copy).
if (typeof window !== 'undefined') {
  window.loadCountryFeatureById = loadCountryFeatureById;
  window.loadCountryFeature = loadCountryFeature;
  if (!window.__countryLoadDelegated) {
    window.__countryLoadDelegated = true;
    document.addEventListener('click', e => {
      if (e.__countryHandled) return;
      const target = e.target && e.target.closest ? e.target : null;
      if (!target) return;
      const btn = target.closest('[data-country-id]');
      if (btn && btn.closest('#country-results')) {
        e.__countryHandled = true;
        const id = btn.getAttribute('data-country-id');
        if (id) {
          try { loadCountryFeatureById(id); } catch (err) { console.warn(err); }
        }
        return;
      }
      const recent = target.closest('[data-recent-index]');
      if (recent && recent.closest('#country-recent')) {
        e.__countryHandled = true;
        loadRecentCountry(Number(recent.getAttribute('data-recent-index'))).catch(() => {});
        return;
      }
      const clear = target.closest('[data-recent-clear]');
      if (clear && clear.closest('#country-recent')) {
        e.__countryHandled = true;
        clearRecentCountries();
      }
    });
  }
}
