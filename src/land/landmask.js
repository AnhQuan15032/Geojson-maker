/**
 * Coastline data for "Cut sea".
 *
 * The land mask is not bundled: a useful coastline is megabytes, and shipping a
 * crude one would make the feature lie about where the shore is. Instead the
 * app downloads Natural Earth on demand (trying several mirrors), caches what
 * fits in localStorage, and always accepts a file of your own — which also
 * means the feature works with a better/local dataset than anything I could
 * pick for you.
 */

import { Emitter } from '../core/util.js';
import { bboxOfGeometry } from '../core/geo.js';
import { parseGeoJSON } from '../core/geojson.js';
import { buildIndex, clipGeometryToLand } from './clipping.js';

const MIRRORS = [
  (file) => `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${file}`,
  (file) => `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/${file}`,
  (file) => `https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/${file}`,
];

export const LAND_SOURCES = {
  ne110: {
    key: 'ne110',
    label: 'Natural Earth 1:110m',
    detail: 'smallest download, coarse coastline',
    file: 'ne_110m_land.geojson',
    lakesFile: 'ne_110m_lakes.geojson',
  },
  ne50: {
    key: 'ne50',
    label: 'Natural Earth 1:50m',
    detail: 'balanced — good for most countries',
    file: 'ne_50m_land.geojson',
    lakesFile: 'ne_50m_lakes.geojson',
  },
  ne10: {
    key: 'ne10',
    label: 'Natural Earth 1:10m',
    detail: 'detailed coastline, large download',
    file: 'ne_10m_land.geojson',
    lakesFile: 'ne_10m_lakes.geojson',
  },
};

export const DEFAULT_SOURCE = 'ne50';
const CACHE_PREFIX = 'geojson-maker.land.v1.';
const CACHE_LIMIT = 2 * 1024 * 1024;   // bytes of GeoJSON we're willing to store

/* ------------------------------------------------------------- preparation */

/** Pull every polygon (as a list of rings) out of any GeoJSON document. */
export function collectPolygons(geojson) {
  const out = [];
  const pushGeometry = (geometry) => {
    if (!geometry || typeof geometry !== 'object') return;
    if (geometry.type === 'Polygon') {
      out.push(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      for (const poly of geometry.coordinates || []) out.push(poly);
    } else if (geometry.type === 'GeometryCollection') {
      for (const child of geometry.geometries || []) pushGeometry(child);
    }
  };

  if (!geojson || typeof geojson !== 'object') return out;
  if (Array.isArray(geojson)) {
    for (const item of geojson) pushGeometry(item && item.type === 'Feature' ? item.geometry : item);
  } else if (geojson.type === 'FeatureCollection') {
    for (const feature of geojson.features || []) pushGeometry(feature && feature.geometry);
  } else if (geojson.type === 'Feature') {
    pushGeometry(geojson.geometry);
  } else {
    pushGeometry(geojson);
  }
  return out;
}

/**
 * Turn polygons into indexable land features: a flat ring list (even-odd fill
 * handles holes), plus a bbox and a rect for fast rejection.
 */
export function prepareFeatures(polygons) {
  const features = [];
  for (const rings of polygons) {
    if (!Array.isArray(rings) || !rings.length) continue;
    const clean = rings
      .filter((ring) => Array.isArray(ring) && ring.length >= 4)
      .map((ring) => ring.map((p) => [Number(p[0]), Number(p[1])]).filter((p) => isFinite(p[0]) && isFinite(p[1])));
    const kept = clean.filter((ring) => ring.length >= 3);
    if (!kept.length) continue;
    const bbox = bboxOfGeometry({ type: 'Polygon', coordinates: kept });
    if (!bbox) continue;
    features.push({
      rings: kept,
      bbox,
      rect: { minX: bbox.minLng, maxX: bbox.maxLng, minY: bbox.minLat, maxY: bbox.maxLat },
    });
  }
  return features;
}

export function buildLand(landFeatures, lakeFeatures = []) {
  return {
    features: landFeatures,
    index: buildIndex(landFeatures, 5),
    lakes: lakeFeatures,
    lakeIndex: buildIndex(lakeFeatures, 5),
    hasLakes: lakeFeatures.length > 0,
  };
}

/* ---------------------------------------------------------------- fetching */

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: 'application/geo+json, application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchWithMirrors(file) {
  const tried = [];
  let lastError = null;
  for (const build of MIRRORS) {
    const url = build(file);
    try {
      const text = await fetchText(url);
      const head = (text || '').trimStart().charAt(0);
      if (!head) throw new Error('empty response');
      if (head !== '{' && head !== '[') throw new Error('the response was not JSON');
      return { text, url, tried };
    } catch (err) {
      tried.push(url);
      lastError = err;
    }
  }
  throw new Error(`every mirror failed for ${file}${lastError ? ` (${lastError.message})` : ''}`);
}

function cacheGet(key) {
  try { return window.localStorage.getItem(CACHE_PREFIX + key); } catch { return null; }
}

function cacheSet(key, text) {
  if (!text || text.length > CACHE_LIMIT) return false;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, text);
    return true;
  } catch {
    return false;   // quota: fine, we just won't cache it
  }
}

function cacheDrop(key) {
  try { window.localStorage.removeItem(CACHE_PREFIX + key); } catch { /* ignore */ }
}

/* ----------------------------------------------------------------- service */

export class LandService extends Emitter {
  constructor() {
    super();
    this.state = {
      status: 'empty',       // empty | loading | ready | error
      source: null,          // 'ne50' | 'custom'
      label: '',
      detail: '',
      features: 0,
      lakes: 0,
      bytes: 0,
      cached: false,
      error: null,
      loadedAt: null,
    };
    this.land = null;
    this.lakesLand = null;
    this._busy = null;
  }

  get isReady() { return this.state.status === 'ready' && !!this.land; }
  get isLoading() { return this.state.status === 'loading'; }

  _set(patch) {
    Object.assign(this.state, patch);
    this.emit('state', this.state);
  }

  /** Restore a cached dataset without touching the network. */
  restoreCached(sourceKey = DEFAULT_SOURCE) {
    const source = LAND_SOURCES[sourceKey];
    if (!source) return false;
    const cached = cacheGet(sourceKey);
    if (!cached) return false;
    try {
      const geojson = JSON.parse(cached);
      this._adopt(collectPolygons(geojson), source.label,
        `${source.detail} · restored from this browser`, sourceKey, cached.length, true);
      return this.isReady;
    } catch {
      cacheDrop(sourceKey);
      return false;
    }
  }

  _adopt(polygons, label, detail, source, bytes, cached) {
    const features = prepareFeatures(polygons);
    if (!features.length) {
      this.land = null;
      this._set({ status: 'error', error: 'That file contained no polygons.', label, source });
      return false;
    }
    this.land = buildLand(features, []);
    this._set({
      status: 'ready',
      source,
      label,
      detail,
      features: features.length,
      lakes: 0,
      bytes,
      cached,
      error: null,
      loadedAt: new Date().toISOString(),
    });
    return true;
  }

  /** Download a Natural Earth land layer (and remember it if it fits). */
  async load(sourceKey = DEFAULT_SOURCE, { force = false } = {}) {
    const source = LAND_SOURCES[sourceKey];
    if (!source) { this._set({ status: 'error', error: `Unknown coastline source "${sourceKey}".` }); return false; }
    if (this._busy) return this._busy;

    if (!force) {
      const cached = cacheGet(sourceKey);
      if (cached) {
        try {
          const polygons = collectPolygons(JSON.parse(cached));
          if (this._adopt(polygons, source.label, `${source.detail} · restored from this browser`, sourceKey, cached.length, true)) {
            return true;
          }
        } catch {
          cacheDrop(sourceKey);
        }
      }
    }

    this._set({ status: 'loading', source: sourceKey, label: source.label, detail: source.detail, error: null });
    this._busy = (async () => {
      try {
        const { text, url } = await fetchWithMirrors(source.file);
        let polygons;
        try {
          polygons = collectPolygons(JSON.parse(text));
        } catch (err) {
          throw new Error(`The coastline download was not valid GeoJSON (${err.message}).`);
        }
        if (!polygons.length) throw new Error('That download contained no polygons.');
        const stored = cacheSet(sourceKey, text);
        const ok = this._adopt(polygons, source.label, source.detail, sourceKey, text.length, stored);
        if (ok) this._set({ detail: `${source.detail} · ${stored ? 'cached in this browser' : url}` });
        return ok;
      } catch (err) {
        this.land = null;
        this._set({
          status: 'error',
          error: err && err.message ? err.message : String(err),
          label: source.label,
          detail: source.detail,
        });
        return false;
      } finally {
        this._busy = null;
      }
    })();
    return this._busy;
  }

  /** Download the matching lakes layer so lakes can be cut too. */
  async loadLakes(sourceKey = this.state.source) {
    const source = LAND_SOURCES[sourceKey];
    if (!source || !this.land) return false;
    try {
      const { text } = await fetchWithMirrors(source.lakesFile);
      const features = prepareFeatures(collectPolygons(JSON.parse(text)));
      if (!features.length) return false;
      this.land.lakes = features;
      this.land.lakeIndex = buildIndex(features, 5);
      this.land.hasLakes = true;
      this._set({ lakes: features.length });
      return true;
    } catch {
      return false;
    }
  }

  /** Use a GeoJSON document of your own as the land mask. */
  async loadFromText(text, label = 'custom file') {
    let polygons = [];
    try {
      polygons = collectPolygons(JSON.parse(text));
    } catch {
      const parsed = parseGeoJSON(text);
      polygons = parsed.features.flatMap((f) => collectPolygons(f.geometry));
    }
    if (!polygons.length) {
      this._set({ status: 'error', error: 'No polygons found in that file.', source: 'custom', label });
      return false;
    }
    return this._adopt(polygons, label, 'your own coastline data', 'custom', text.length, false);
  }

  async loadFromFile(file) {
    const text = await file.text();
    return this.loadFromText(text, file.name || 'custom file');
  }

  /** Forget the coastline: both the in-memory mask and anything cached here. */
  clear() {
    for (const key of Object.keys(LAND_SOURCES)) cacheDrop(key);
    this.land = null;
    this._set({
      status: 'empty', source: null, label: '', detail: '', features: 0, lakes: 0,
      bytes: 0, cached: false, error: null, loadedAt: null,
    });
  }

  /** Intersect a geometry with the loaded land mask. */
  clip(geometry, options = {}) {
    if (!this.isReady) return { geometry: null, empty: true, stats: {}, error: 'no-land-data' };
    const opts = { ...options };
    if (opts.cutLakes && !this.land.hasLakes) opts.cutLakes = false;
    return clipGeometryToLand(geometry, this.land, opts);
  }

  static get CACHE_PREFIX() { return CACHE_PREFIX; }
  static get CACHE_LIMIT() { return CACHE_LIMIT; }
}

export { CACHE_PREFIX, CACHE_LIMIT, MIRRORS };
