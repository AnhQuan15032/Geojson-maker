// Local sharing — no Cloudflare needed.
// My Maps in localStorage, Share via URL hash (base64), Discover = local public + demos + hash

export const QUOTA = 1 * 1024 * 1024;

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
export function quotaPercent(used) { return Math.min(100, Math.round(used / QUOTA * 100)); }

// demos (so Discover Load always works)
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
  { id: 'demo_vn', title: 'Vietnam Coastline Study', author:{name:'demo_user', avatar:''}, bytes: 0, createdAt: Date.now()-86400000, preview: '', geojson: DEMO_VN_GJ, isPublic: true },
  { id: 'demo_alpine', title: 'Alpine Borders', author:{name:'geo_artist', avatar:''}, bytes: 0, createdAt: Date.now()-172800000, preview: '', geojson: DEMO_ALPINE_GJ, isPublic: true },
];
DEMO_MAPS.forEach(m=>{ m.bytes = new TextEncoder().encode(JSON.stringify(m.geojson)+(m.preview||'')).length; });

function lsGet() {
  try { return JSON.parse(localStorage.getItem('cloud_maps')||'[]'); } catch { return []; }
}
function lsSet(arr) { try { localStorage.setItem('cloud_maps', JSON.stringify(arr)); } catch {} }
function lsUsage() { return lsGet().reduce((a,m)=>a + (m.bytes||0),0); }

// share link — encode {title, geojson, author} into URL hash #share=...
export function createShareUrl({ title, geojson, preview }) {
  const author = (()=>{ try{ return JSON.parse(localStorage.getItem('auth_user')||'null') || {name:'local', avatar:''}; }catch{ return {name:'local',avatar:''}; }})();
  const payload = { title, geojson, preview, author, ts: Date.now() };
  const json = JSON.stringify(payload);
  // use base64 + encodeURIComponent (URL-safe) — no compression to keep simple; 1 MB maps will be large but share still works for typical small maps
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const url = `${location.origin}${location.pathname}#share=${b64}`;
  return url;
}
export function parseShareHash() {
  try {
    const hash = location.hash || '';
    const m = hash.match(/#share=([^&]+)/);
    if (!m) return null;
    const b64 = m[1];
    const json = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(json);
    if (!payload || !payload.geojson) return null;
    return { id: `shared_${payload.ts||Date.now()}`, title: payload.title||'Shared map', author: payload.author||{name:'shared', avatar:''}, preview: payload.preview||'', geojson: payload.geojson, bytes: new TextEncoder().encode(JSON.stringify(payload.geojson)+(payload.preview||'')).length, createdAt: payload.ts||Date.now(), isPublic: true };
  } catch { return null; }
}
export function consumeShareHash() {
  const shared = parseShareHash();
  if (shared) {
    // clear hash so reload doesn't re-add
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    // optionally auto-save to local as imported?
    return shared;
  }
  return null;
}

export async function getUsage() {
  const used = lsUsage();
  return { usage: used, quota: QUOTA };
}
export async function listMyMaps() {
  return lsGet().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
export async function listDiscover(limit=20) {
  const shared = parseShareHash();
  const localPublic = lsGet().filter(m=>m.isPublic);
  const combined = [];
  const seen = new Set();
  if (shared && !localPublic.some(m=>m.id===shared.id) && !DEMO_MAPS.some(m=>m.id===shared.id)) {
    combined.push(shared);
    seen.add(shared.id);
  }
  for (const m of localPublic) { if (!seen.has(m.id)) { combined.push(m); seen.add(m.id); } }
  for (const m of DEMO_MAPS) { if (!seen.has(m.id)) { combined.push(m); seen.add(m.id); } }
  combined.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  return combined.slice(0, limit);
}
export async function getMap(id) {
  const shared = parseShareHash();
  if (shared && shared.id===id) return shared;
  const demo = DEMO_MAPS.find(m=>m.id===id);
  if (demo) return demo;
  const local = lsGet().find(m=>m.id===id);
  if (local) return local;
  throw new Error('not found');
}
export async function publishMap({ title, geojson, isPublic=false, preview=null }) {
  const bytes = new TextEncoder().encode(JSON.stringify(geojson)+(preview||'')).length;
  const usage = lsUsage();
  if (usage + bytes > QUOTA) throw Object.assign(new Error('QUOTA_EXCEEDED'), { data:{ error:'QUOTA_EXCEEDED' }, status:402 });
  const author = (()=>{ try{ return JSON.parse(localStorage.getItem('auth_user')||'null') || {name:'local', avatar:''}; }catch{ return {name:'local',avatar:''}; }})();
  const doc = { id:`local_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, title, geojson, isPublic, preview, bytes, createdAt: Date.now(), author:{ name: author.name||'local', avatar: author.avatar||'' } };
  const maps = lsGet();
  maps.unshift(doc);
  lsSet(maps);
  return doc;
}
export async function deleteMap(id) {
  const maps = lsGet();
  const pruned = maps.filter(m=>m.id!==id);
  if (pruned.length!==maps.length) lsSet(pruned);
}
export async function uploadGeoJSONFile(file, { isPublic=false }={}) {
  const text = await file.text();
  const gj = JSON.parse(text);
  return publishMap({ title: file.name.replace(/\.geojson$/i,'').replace(/\.json$/i,''), geojson: gj, isPublic });
}
