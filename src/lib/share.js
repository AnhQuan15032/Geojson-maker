// No storage — just loadable presets. Discover = demos + continents (real geometries).
// Actual continent load: fetches Natural Earth countries geojson and unions by CONTINENT property.

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ---- Demo maps (keep Discover usable offline) ----
const DEMO_VN_GJ = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Vietnam — central coast', fill: '#10b981' },
    geometry: { type: 'Polygon', coordinates: [[[108.2,16.8],[109.5,16.8],[109.5,15.2],[108.2,15.2],[108.2,16.8]]] }
  },{
    type: 'Feature',
    properties: { name: 'Vietnam — south', fill: '#0ea5e9' },
    geometry: { type: 'Polygon', coordinates: [[[106.5,11.2],[107.8,11.2],[107.8,9.8],[106.5,9.8],[106.5,11.2]]] }
  }]
};
const DEMO_ALPINE_GJ = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Alps — ridge', fill: '#f59e0b' },
    geometry: { type: 'Polygon', coordinates: [[[7.5,46.2],[9.8,46.2],[9.8,45.1],[7.5,45.1],[7.5,46.2]]] }
  }]
};
export const DEMO_MAPS = [
  { id: 'demo_vn', title: 'Vietnam Coastline Study', author:{name:'demo_user', avatar:''}, bytes: 0, createdAt: Date.now()-86400000, preview: '', geojson: DEMO_VN_GJ, isPublic: true, kind: 'demo' },
  { id: 'demo_alpine', title: 'Alpine Borders', author:{name:'geo_artist', avatar:''}, bytes: 0, createdAt: Date.now()-172800000, preview: '', geojson: DEMO_ALPINE_GJ, isPublic: true, kind: 'demo' },
];
DEMO_MAPS.forEach(m=>{ m.bytes = new TextEncoder().encode(JSON.stringify(m.geojson)+(m.preview||'')).length; });

// ---- Continents definitions — colors and fallback rough geometry ----
const CONTINENT_FALLBACKS = {
  'Africa': {
    type: 'Polygon',
    coordinates: [[[-17.3,37.2],[32.1,37.3],[43.2,27.5],[51.4,12.8],[46.3,-4.2],[39.4,-18.7],[22.9,-33.8],[9.6,-34.6],[-8.1,-4.9],[-17.6,7.8],[-17.3,37.2]]]
  },
  'Europe': {
    type: 'Polygon',
    coordinates: [[[-24.7,35.1],[34.9,35.3],[41.2,44.7],[39.8,62.2],[29.1,71.5],[8.2,71.2],[-10.1,59.8],[-24.7,35.1]]]
  },
  'Asia': {
    type: 'Polygon',
    coordinates: [[[26.5,5.2],[50.1,5.0],[72.3,22.8],[85.6,7.5],[108.2,2.1],[122.4,28.6],[139.2,36.5],[144.5,53.1],[142.1,69.8],[67.3,77.1],[35.2,68.3],[26.5,47.8],[26.5,5.2]]]
  },
  'North America': {
    type: 'Polygon',
    coordinates: [[[-168.7,71.5],[-152.3,71.2],[-126.4,61.0],[-94.2,58.3],[-74.8,44.2],[-66.2,28.5],[-82.1,8.1],[-102.3,20.4],[-123.8,25.6],[-148.2,50.2],[-168.7,71.5]]]
  },
  'South America': {
    type: 'Polygon',
    coordinates: [[[-81.3,12.8],[-60.2,12.5],[-34.8,5.2],[-34.2,-28.3],[-48.9,-54.8],[-70.2,-52.1],[-81.3,12.8]]]
  },
  'Oceania': {
    type: 'MultiPolygon',
    coordinates: [[[[112.8,-10.8],[154.3,-10.6],[154.2,-34.5],[112.6,-34.2],[112.8,-10.8]]], [[[166.2,-34.0],[178.5,-34.5],[178.7,-48.2],[165.5,-47.8],[166.2,-34.0]]]]
  },
  'Antarctica': {
    type: 'Polygon',
    coordinates: [[[-180,-75],[180,-75],[180,-85],[-180,-85],[-180,-75]]]
  }
};

export const CONTINENT_DEFS = [
  { id: 'continent_africa', title: 'Africa', continent: 'Africa', color: '#f59e0b' },
  { id: 'continent_europe', title: 'Europe', continent: 'Europe', color: '#3b82f6' },
  { id: 'continent_asia', title: 'Asia', continent: 'Asia', color: '#22c55e' },
  { id: 'continent_north_america', title: 'North America', continent: 'North America', color: '#a855f7' },
  { id: 'continent_south_america', title: 'South America', continent: 'South America', color: '#ec4899' },
  { id: 'continent_oceania', title: 'Oceania', continent: 'Oceania', color: '#06b6d4' },
  { id: 'continent_antarctica', title: 'Antarctica', continent: 'Antarctica', color: '#e2e8f0' },
];

export const CONTINENTS = CONTINENT_DEFS.map((d, i) => ({
  id: d.id,
  title: d.title,
  kind: 'continent',
  color: d.color,
  continent: d.continent,
  author: { name: 'continent', avatar: '' },
  createdAt: Date.now() - 100000 - i*10000,
  preview: '',
  bytes: 0,
  // fallback geometry — will be replaced by real geometry after fetch
  geojson: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: d.title, fill: d.color, continent: d.continent },
      geometry: CONTINENT_FALLBACKS[d.continent]
    }]
  }
}));
CONTINENTS.forEach(m=>{ m.bytes = new TextEncoder().encode(JSON.stringify(m.geojson)).length; });

// Keep a single list for Discover compatibility
export const PRESET_MAPS = [...DEMO_MAPS, ...CONTINENTS];

// ---- Actual continent loader — fetch Natural Earth and union ----
let _countriesCache = null;
let _countriesFetchPromise = null;

async function fetchCountriesGeoJSON() {
  if (_countriesCache) return _countriesCache;
  if (_countriesFetchPromise) return _countriesFetchPromise;
  _countriesFetchPromise = (async () => {
    const urls = [
      'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
      'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson',
      'https://cdn.jsdelivr.net/npm/natural-earth-vector@5.1.2/geojson/ne_110m_admin_0_countries.geojson',
      // fallback to unpkg
      'https://unpkg.com/natural-earth-vector@5.1.2/geojson/ne_110m_admin_0_countries.geojson',
    ];
    let lastErr = null;
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP '+r.status);
        const j = await r.json();
        if (j && j.features && j.features.length > 50) {
          _countriesCache = j;
          return j;
        }
      } catch (e) {
        lastErr = e;
        console.warn('Continent countries fetch failed', url, e.message);
      }
    }
    throw lastErr || new Error('All continent sources failed');
  })();
  try {
    await _countriesFetchPromise;
  } finally {
    // keep promise for reuse, but clear on failure to allow retry
    if (!_countriesCache) _countriesFetchPromise = null;
  }
  return _countriesCache;
}

// Build a real continent FeatureCollection by unioning its countries.
// Uses turf if available for proper merge, otherwise keeps as FeatureCollection of many polys (still loadable).
async function buildRealContinent(continentName, color) {
  const fc = await fetchCountriesGeoJSON();
  const feats = fc.features.filter(f => {
    const c = f.properties.CONTINENT || f.properties.continent;
    // Natural Earth uses "North America", "South America" etc. exactly
    return c === continentName;
  });
  if (feats.length === 0) throw new Error('No countries for '+continentName);
  // If turf is available, try to union into a single (Multi)Polygon for cleaner editing
  let geojson = null;
  try {
    const heavy = await import('../engine/heavyLibs.js').then(m=>m.ensureHeavyLibs()).then(()=> window.turf);
    if (window.turf && feats.length > 1) {
      // progressive union with yield to keep UI responsive
      let acc = feats[0];
      for (let i=1;i<feats.length;i++) {
        try {
          const u = window.turf.union(acc, feats[i]);
          if (u && u.geometry) acc = u;
        } catch (e) {
          // if union fails (e.g., Antarctica crossing antimeridian), keep as FeatureCollection
          console.warn('continent union failed for', continentName, i, e.message);
        }
        if (i % 10 === 0) await new Promise(r=> setTimeout(r, 0));
      }
      // acc is now a Feature with geometry (Polygon or MultiPolygon)
      geojson = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { name: continentName, fill: color, continent: continentName },
          geometry: acc.geometry
        }]
      };
    }
  } catch (e) {
    console.warn('turf not available for continent union', e);
  }
  if (!geojson) {
    // fallback: FeatureCollection of individual country polygons (still editable, one shape per country but grouped)
    // For load semantics we want one collection per continent, so keep many features but set continent name
    geojson = {
      type: 'FeatureCollection',
      features: feats.map(f => ({
        type: 'Feature',
        properties: { name: f.properties.NAME || f.properties.ADMIN || continentName, fill: color, continent: continentName, country: f.properties.ADMIN },
        geometry: f.geometry
      }))
    };
  }
  return geojson;
}

// Cache for built real continents
const _realCache = new Map();

export async function getContinentRealGeoJSON(continentName, color) {
  const key = continentName;
  if (_realCache.has(key)) return _realCache.get(key);
  try {
    const gj = await buildRealContinent(continentName, color);
    _realCache.set(key, gj);
    return gj;
  } catch (e) {
    console.warn('Real continent load failed, using fallback', continentName, e.message);
    // fallback to rough polygon
    const fb = CONTINENT_FALLBACKS[continentName];
    if (!fb) throw e;
    const fallback = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: continentName, fill: color },
        geometry: fb
      }]
    };
    return fallback;
  }
}

// ---- Storage deleted: no localStorage, no quota, no share hash ----
export const QUOTA = 1 * 1024 * 1024;
export function quotaPercent() { return 0; }
export function createShareUrl() { return location.href; }
export function parseShareHash() { return null; }
export function consumeShareHash() { return null; }

export async function getUsage() { return { usage: 0, quota: QUOTA }; }
export async function listMyMaps() { return []; }
export async function listDiscover(limit=20) {
  return PRESET_MAPS.slice(0, limit);
}
export async function getMap(id) {
  // check demos first
  const demo = DEMO_MAPS.find(m=>m.id===id);
  if (demo) return demo;
  // check continents — return real geometry if available
  const contDef = CONTINENT_DEFS.find(c=>c.id===id);
  if (contDef) {
    const base = CONTINENTS.find(c=>c.id===id);
    try {
      const realGj = await getContinentRealGeoJSON(contDef.continent, contDef.color);
      // return a new doc with real geojson (keep same id/title/color)
      const doc = { ...base, geojson: realGj, bytes: new TextEncoder().encode(JSON.stringify(realGj)).length, isReal: true };
      return doc;
    } catch (e) {
      return base;
    }
  }
  const found = PRESET_MAPS.find(m=>m.id===id);
  if (found) return found;
  throw new Error('not found');
}
export async function publishMap() { throw new Error('Storage deleted — use Load instead'); }
export async function deleteMap() {}
export async function uploadGeoJSONFile() { throw new Error('Storage deleted'); }
