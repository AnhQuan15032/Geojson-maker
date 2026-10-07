// Cloud storage helper — 1 MB quota via Worker KV, with full offline fallback
// Works zero-config: if Worker not available, everything is stored in localStorage.
const API = '';
export const QUOTA = 1 * 1024 * 1024;

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
export function quotaPercent(used) { return Math.min(100, Math.round(used / QUOTA * 100)); }

// ---- demo GeoJSON so Load works without any Cloudflare setup ----
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
const DEMO_MAPS = [
  { id: 'demo_vn', title: 'Vietnam Coastline Study', author:{name:'demo_user', avatar:''}, bytes: 0, createdAt: Date.now()-86400000, preview: '', geojson: DEMO_VN_GJ, isPublic: true },
  { id: 'demo_alpine', title: 'Alpine Borders', author:{name:'geo_artist', avatar:''}, bytes: 0, createdAt: Date.now()-172800000, preview: '', geojson: DEMO_ALPINE_GJ, isPublic: true },
];
DEMO_MAPS.forEach(m=>{ m.bytes = new TextEncoder().encode(JSON.stringify(m.geojson)+(m.preview||'')).length; });

// local fallback helpers
function lsGet() {
  try { return JSON.parse(localStorage.getItem('cloud_maps')||'[]'); } catch { return []; }
}
function lsSet(arr) { try { localStorage.setItem('cloud_maps', JSON.stringify(arr)); } catch {} }
function lsUsage() {
  const maps = lsGet();
  return maps.reduce((a,m)=>a + (m.bytes||0),0);
}

async function req(path, opts={}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts, headers: { 'content-type': 'application/json', ...(opts.headers||{}) } });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) {
    const err = new Error(j.error || `HTTP ${r.status}`);
    err.status = r.status;
    err.data = j;
    throw err;
  }
  return j;
}

export async function getUsage() {
  try {
    const j = await req('/api/storage/usage');
    if (typeof j.usage === 'number') return j;
  } catch {}
  const used = lsUsage();
  return { usage: used, quota: QUOTA };
}
export async function listMyMaps() {
  try {
    const j = await req('/api/maps');
    if (Array.isArray(j.maps)) return j.maps;
  } catch {}
  return lsGet();
}
export async function listDiscover(limit=20) {
  try {
    const j = await req(`/api/discover?limit=${limit}`);
    if (Array.isArray(j.maps) && j.maps.length>0) return j.maps;
  } catch {}
  const localPublic = lsGet().filter(m=>m.isPublic);
  const seen = new Set(localPublic.map(m=>m.id));
  const combined = [...localPublic, ...DEMO_MAPS.filter(m=>!seen.has(m.id))];
  combined.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  return combined.slice(0, limit);
}
export async function getMap(id) {
  const demo = DEMO_MAPS.find(m=>m.id===id);
  if (demo) return demo;
  const local = lsGet().find(m=>m.id===id);
  if (local) return local;
  try {
    const j = await req(`/api/maps/${id}`);
    return j.map || j;
  } catch (e) {
    if (local || demo) return local||demo;
    throw e;
  }
}
export async function publishMap({ title, geojson, isPublic=false, preview=null }) {
  const bytes = new TextEncoder().encode(JSON.stringify(geojson)+(preview||'')).length;
  const { usage, quota } = await getUsage();
  if (usage + bytes > (quota||QUOTA)) throw Object.assign(new Error('QUOTA_EXCEEDED'), { data:{ error:'QUOTA_EXCEEDED' }, status:402 });
  const body = { title, geojson, isPublic, preview };
  try {
    const j = await req('/api/maps', { method:'POST', body: JSON.stringify(body) });
    if (j.map) return j.map;
    return j;
  } catch (e) {
    if (e.status===402 || e.data?.error==='QUOTA_EXCEEDED') throw e;
    const maps = lsGet();
    const newUsed = maps.reduce((a,m)=>a+(m.bytes||0),0) + bytes;
    if (newUsed > QUOTA) throw Object.assign(new Error('QUOTA_EXCEEDED'), { status:402, data:{error:'QUOTA_EXCEEDED'} });
    const author = (()=>{ try{ return JSON.parse(localStorage.getItem('auth_user')||'null') || {name:'local', avatar:''}; }catch{ return {name:'local',avatar:''}; }})();
    const doc = { id:`local_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, title, geojson, isPublic, preview, bytes, createdAt: Date.now(), author:{ name: author.name||'local', avatar: author.avatar||'' } };
    maps.unshift(doc);
    lsSet(maps);
    return doc;
  }
}
export async function deleteMap(id) {
  try { await req(`/api/maps/${id}`, { method:'DELETE' }); } catch {}
  const maps = lsGet();
  const pruned = maps.filter(m=>m.id!==id);
  if (pruned.length!==maps.length) lsSet(pruned);
}
export async function uploadGeoJSONFile(file, { isPublic=false }={}) {
  const text = await file.text();
  const gj = JSON.parse(text);
  return publishMap({ title: file.name.replace(/\.geojson$/i,'').replace(/\.json$/i,''), geojson: gj, isPublic });
}
