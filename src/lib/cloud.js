// Cloud storage helper — 1 MB quota via Worker KV
const API = '';
export const QUOTA = 1 * 1024 * 1024;

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(2)} MB`;
}
export function quotaPercent(used) { return Math.min(100, Math.round(used / QUOTA * 100)); }

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
  try { const j = await req('/api/storage/usage'); return j; } 
  catch { // fallback to localStorage mock
    const maps = JSON.parse(localStorage.getItem('cloud_maps')||'[]');
    const used = maps.reduce((a,m)=>a + (m.bytes||0),0);
    return { usage: used, quota: QUOTA };
  }
}
export async function listMyMaps() {
  try { const j = await req('/api/maps'); return j.maps||[]; }
  catch { return JSON.parse(localStorage.getItem('cloud_maps')||'[]'); }
}
export async function listDiscover(limit=20) {
  try { const j = await req(`/api/discover?limit=${limit}`); return j.maps||[]; }
  catch {
    // fallback: return public mock from localStorage + demo
    const all = JSON.parse(localStorage.getItem('cloud_maps')||'[]').filter(m=>m.isPublic);
    if (all.length===0) return [
      { id: 'demo_vn', title: 'Vietnam Coastline Study', author:{name:'demo_user', avatar:''}, bytes: 3400, createdAt: Date.now()-86400000, preview: '' },
      { id: 'demo_alpine', title: 'Alpine Borders', author:{name:'geo_artist', avatar:''}, bytes: 2100, createdAt: Date.now()-172800000, preview: '' },
    ];
    return all;
  }
}
export async function getMap(id) {
  const j = await req(`/api/maps/${id}`);
  return j.map;
}
export async function publishMap({ title, geojson, isPublic=false, preview=null }) {
  const body = { title, geojson, isPublic, preview };
  const bytes = new TextEncoder().encode(JSON.stringify(geojson)+(preview||'')).length;
  // quota check client-side early
  const { usage, quota } = await getUsage();
  if (usage + bytes > (quota||QUOTA)) throw Object.assign(new Error('QUOTA_EXCEEDED'), { data:{ usage, quota } });
  try {
    const j = await req('/api/maps', { method:'POST', body: JSON.stringify(body) });
    return j.map;
  } catch (e) {
    if (e.status===402 || e.data?.error==='QUOTA_EXCEEDED') throw e;
    // fallback to localStorage
    if (!navigator.onLine || e.message.includes('Failed to fetch')) {
      const maps = JSON.parse(localStorage.getItem('cloud_maps')||'[]');
      const newUsed = maps.reduce((a,m)=>a+m.bytes,0) + bytes;
      if (newUsed > QUOTA) throw Object.assign(new Error('QUOTA_EXCEEDED'), { status:402 });
      const doc = { id:`local_${Date.now()}`, title, geojson, isPublic, preview, bytes, createdAt: Date.now(), author:{ name:'local', avatar:'' } };
      maps.unshift(doc);
      localStorage.setItem('cloud_maps', JSON.stringify(maps));
      return doc;
    }
    throw e;
  }
}
export async function deleteMap(id) {
  try { await req(`/api/maps/${id}`, { method:'DELETE' }); }
  catch {
    const maps = JSON.parse(localStorage.getItem('cloud_maps')||'[]');
    localStorage.setItem('cloud_maps', JSON.stringify(maps.filter(m=>m.id!==id)));
  }
}
export async function uploadGeoJSONFile(file, { isPublic=false }={}) {
  const text = await file.text();
  const gj = JSON.parse(text);
  return publishMap({ title: file.name.replace(/\.geojson$/i,'').replace(/\.json$/i,''), geojson: gj, isPublic });
}
