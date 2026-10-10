// No storage — just loadable presets. Discover = demos + continents.
// Load buttons work offline, no localStorage quota, no cloud.

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ---- Demo maps (keep Discover usable) ----
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

// ---- Continents — loadable as editable shapes (rough but recognizable, single Polygon/MultiPolygon each) ----
export const CONTINENTS = [
  {
    id: 'continent_africa',
    title: 'Africa',
    kind: 'continent',
    color: '#f59e0b',
    author: { name: 'continent', avatar: '' },
    createdAt: Date.now() - 100000,
    preview: '',
    bytes: 0,
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Africa', fill: '#f59e0b' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-17.3,37.2],[32.1,37.3],[43.2,27.5],[51.4,12.8],[46.3,-4.2],[39.4,-18.7],[22.9,-33.8],[9.6,-34.6],[-8.1,-4.9],[-17.6,7.8],[-17.3,37.2]
          ]]
        }
      }]
    }
  },
  {
    id: 'continent_europe',
    title: 'Europe',
    kind: 'continent',
    color: '#3b82f6',
    author: { name: 'continent', avatar: '' },
    createdAt: Date.now() - 110000,
    preview: '',
    bytes: 0,
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Europe', fill: '#3b82f6' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-24.7,35.1],[34.9,35.3],[41.2,44.7],[39.8,62.2],[29.1,71.5],[8.2,71.2],[-10.1,59.8],[-24.7,35.1]
          ]]
        }
      }]
    }
  },
  {
    id: 'continent_asia',
    title: 'Asia',
    kind: 'continent',
    color: '#22c55e',
    author: { name: 'continent', avatar: '' },
    createdAt: Date.now() - 120000,
    preview: '',
    bytes: 0,
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Asia', fill: '#22c55e' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [26.5,5.2],[50.1,5.0],[72.3,22.8],[85.6,7.5],[108.2,2.1],[122.4,28.6],[139.2,36.5],[144.5,53.1],[142.1,69.8],[67.3,77.1],[35.2,68.3],[26.5,47.8],[26.5,5.2]
          ]]
        }
      }]
    }
  },
  {
    id: 'continent_north_america',
    title: 'North America',
    kind: 'continent',
    color: '#a855f7',
    author: { name: 'continent', avatar: '' },
    createdAt: Date.now() - 130000,
    preview: '',
    bytes: 0,
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'North America', fill: '#a855f7' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-168.7,71.5],[-152.3,71.2],[-126.4,61.0],[-94.2,58.3],[-74.8,44.2],[-66.2,28.5],[-82.1,8.1],[-102.3,20.4],[-123.8,25.6],[-148.2,50.2],[-168.7,71.5]
          ]]
        }
      }]
    }
  },
  {
    id: 'continent_south_america',
    title: 'South America',
    kind: 'continent',
    color: '#ec4899',
    author: { name: 'continent', avatar: '' },
    createdAt: Date.now() - 140000,
    preview: '',
    bytes: 0,
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'South America', fill: '#ec4899' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-81.3,12.8],[-60.2,12.5],[-34.8,5.2],[-34.2,-28.3],[-48.9,-54.8],[-70.2,-52.1],[-81.3,12.8]
          ]]
        }
      }]
    }
  },
  {
    id: 'continent_oceania',
    title: 'Oceania',
    kind: 'continent',
    color: '#06b6d4',
    author: { name: 'continent', avatar: '' },
    createdAt: Date.now() - 150000,
    preview: '',
    bytes: 0,
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Oceania — Australia', fill: '#06b6d4' },
        geometry: { type: 'Polygon', coordinates: [[[112.8,-10.8],[154.3,-10.6],[154.2,-34.5],[112.6,-34.2],[112.8,-10.8]]] }
      },{
        type: 'Feature',
        properties: { name: 'Oceania — New Zealand', fill: '#0891b2' },
        geometry: { type: 'Polygon', coordinates: [[[166.2,-34.0],[178.5,-34.5],[178.7,-48.2],[165.5,-47.8],[166.2,-34.0]]] }
      }]
    }
  },
  {
    id: 'continent_antarctica',
    title: 'Antarctica',
    kind: 'continent',
    color: '#e2e8f0',
    author: { name: 'continent', avatar: '' },
    createdAt: Date.now() - 160000,
    preview: '',
    bytes: 0,
    geojson: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Antarctica', fill: '#e2e8f0' },
        geometry: { type: 'Polygon', coordinates: [[[-180,-75],[180,-75],[180,-85],[-180,-85],[-180,-75]]] }
      }]
    }
  },
];
CONTINENTS.forEach(m=>{ m.bytes = new TextEncoder().encode(JSON.stringify(m.geojson)).length; });

// Keep a single list for Discover compatibility
export const PRESET_MAPS = [...DEMO_MAPS, ...CONTINENTS];

// ---- Storage deleted: no localStorage, no quota, no share hash ----
// Provide no-op shims so old imports don't crash, but they do nothing.
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
  const found = PRESET_MAPS.find(m=>m.id===id) || DEMO_MAPS.find(m=>m.id===id) || CONTINENTS.find(m=>m.id===id);
  if (found) return found;
  throw new Error('not found');
}
export async function publishMap() { throw new Error('Storage deleted — use Load instead'); }
export async function deleteMap() {}
export async function uploadGeoJSONFile() { throw new Error('Storage deleted'); }
