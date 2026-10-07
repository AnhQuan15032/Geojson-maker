import { kvGet, kvPut, kvDel, kvList, bytesOf, MAX_BYTES, json, bad } from './utils.js';
import { getSessionUser } from './auth.js';

function mapId() { return `map_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

async function getUsage(env, userId) {
  const v = await kvGet(env, 'MAPS', `usage:${userId}`);
  return v?.bytes || 0;
}
async function setUsage(env, userId, bytes) {
  await kvPut(env, 'MAPS', `usage:${userId}`, { bytes, updatedAt: Date.now() });
}

// list helpers
async function listUserMaps(env, userId) {
  // we store index as list in KV
  const idx = await kvGet(env, 'MAPS', `index:${userId}`);
  if (!idx || !Array.isArray(idx.ids)) return [];
  const out = [];
  for (const id of idx.ids) {
    const m = await kvGet(env, 'MAPS', `map:${id}`);
    if (m) out.push(m);
  }
  out.sort((a,b)=>b.createdAt - a.createdAt);
  return out;
}
async function addToIndex(env, userId, id) {
  const idx = await kvGet(env, 'MAPS', `index:${userId}`) || { ids: [] };
  idx.ids.unshift(id);
  await kvPut(env, 'MAPS', `index:${userId}`, idx);
}
async function removeFromIndex(env, userId, id) {
  const idx = await kvGet(env, 'MAPS', `index:${userId}`);
  if (!idx) return;
  idx.ids = idx.ids.filter(x=>x!==id);
  await kvPut(env, 'MAPS', `index:${userId}`, idx);
}

export async function handleListMaps(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return bad('unauthorized', 401);
  const maps = await listUserMaps(env, user.id);
  const usage = await getUsage(env, user.id);
  return json({ maps, usage, quota: MAX_BYTES });
}
export async function handleDiscover(req, env) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit')||'20',10), 50);
  // naive: list all maps in KV via list, then filter public
  // In production with many maps, you'd paginate via D1. For now collect from KV.
  // Fallback: if KV list not supported for many, we also keep a global index.
  const globalIdx = await kvGet(env, 'MAPS', 'global:ids') || { ids: [] };
  const out = [];
  for (const id of globalIdx.ids.slice(0, limit*2)) {
    const m = await kvGet(env, 'MAPS', `map:${id}`);
    if (m && m.isPublic) { out.push({ id: m.id, title: m.title, preview: m.preview, author: m.author, createdAt: m.createdAt, bytes: m.bytes }); if (out.length>=limit) break; }
  }
  // if global empty, try kvList scan
  if (out.length===0) {
    const all = await kvList(env, 'MAPS', 'map:');
    for (const m of all) {
      if (m.isPublic) out.push({ id: m.id, title: m.title, preview: m.preview, author: m.author, createdAt: m.createdAt, bytes: m.bytes });
      if (out.length>=limit) break;
    }
    out.sort((a,b)=>b.createdAt - a.createdAt);
  }
  return json({ maps: out.slice(0, limit) });
}
export async function handleGetMap(req, env, id) {
  const m = await kvGet(env, 'MAPS', `map:${id}`);
  if (!m) return bad('not found', 404);
  // public maps are readable without auth, private require owner
  if (!m.isPublic) {
    const user = await getSessionUser(req, env);
    if (!user || user.id !== m.ownerId) return bad('forbidden', 403);
  }
  return json({ map: m });
}
export async function handleCreateMap(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return bad('unauthorized', 401);
  let body;
  try { body = await req.json(); } catch { return bad('invalid json', 400); }
  const title = (body.title || 'Untitled').toString().slice(0, 80);
  const geojson = body.geojson;
  const isPublic = !!body.isPublic;
  const preview = body.preview ? body.preview.toString().slice(0, 200000) : null; // cap preview b64
  if (!geojson || typeof geojson !== 'object') return bad('geojson required', 400);
  let geoStr;
  try { geoStr = JSON.stringify(geojson); } catch { return bad('geojson not serializable', 400); }
  const bytes = bytesOf(geoStr) + (preview ? bytesOf(preview) : 0);
  if (bytes > MAX_BYTES) return bad(`single map exceeds quota (${bytes} > ${MAX_BYTES})`, 413);
  const usage = await getUsage(env, user.id);
  if (usage + bytes > MAX_BYTES) {
    return json({ error: 'QUOTA_EXCEEDED', usage, quota: MAX_BYTES, needed: bytes }, 402);
  }
  // validate geojson roughly
  const t = geojson.type;
  if (!['FeatureCollection','Feature','GeometryCollection','Polygon','MultiPolygon','LineString','MultiLineString','Point','MultiPoint'].includes(t)) {
    // allow but warn
  }
  const id = mapId();
  const doc = {
    id, title, geojson, preview, isPublic,
    ownerId: user.id,
    author: { id: user.id, name: user.name, avatar: user.avatar, provider: user.provider },
    bytes, createdAt: Date.now(),
  };
  await kvPut(env, 'MAPS', `map:${id}`, doc);
  await addToIndex(env, user.id, id);
  // global index
  const g = await kvGet(env, 'MAPS', 'global:ids') || { ids: [] };
  g.ids.unshift(id);
  // keep last 500
  g.ids = g.ids.slice(0, 500);
  await kvPut(env, 'MAPS', 'global:ids', g);
  await setUsage(env, user.id, usage + bytes);
  return json({ map: doc, usage: usage + bytes, quota: MAX_BYTES }, 201);
}
export async function handleDeleteMap(req, env, id) {
  const user = await getSessionUser(req, env);
  if (!user) return bad('unauthorized', 401);
  const m = await kvGet(env, 'MAPS', `map:${id}`);
  if (!m) return bad('not found', 404);
  if (m.ownerId !== user.id) return bad('forbidden', 403);
  await kvDel(env, 'MAPS', `map:${id}`);
  await removeFromIndex(env, user.id, id);
  const g = await kvGet(env, 'MAPS', 'global:ids');
  if (g) { g.ids = g.ids.filter(x=>x!==id); await kvPut(env, 'MAPS', 'global:ids', g); }
  const usage = await getUsage(env, user.id);
  await setUsage(env, user.id, Math.max(0, usage - m.bytes));
  return json({ ok: true, usage: Math.max(0, usage - m.bytes) });
}
export async function handleUsage(req, env) {
  const user = await getSessionUser(req, env);
  if (!user) return bad('unauthorized', 401);
  const usage = await getUsage(env, user.id);
  return json({ usage, quota: MAX_BYTES });
}
export async function handleUploadGeoJSON(req, env) {
  // alias to create, but also supports multipart form with file
  const ct = req.headers.get('content-type')||'';
  if (ct.includes('multipart/form-data') || ct.includes('application/octet-stream')) {
    // try to parse as text
    const text = await req.text();
    try {
      const gj = JSON.parse(text);
      const user = await getSessionUser(req, env);
      if (!user) return bad('unauthorized', 401);
      const bytes = bytesOf(text);
      if (bytes > MAX_BYTES) return bad('file too large', 413);
      const usage = await getUsage(env, user.id);
      if (usage + bytes > MAX_BYTES) return json({ error:'QUOTA_EXCEEDED', usage, quota: MAX_BYTES }, 402);
      const id = mapId();
      const doc = { id, title: 'Uploaded GeoJSON', geojson: gj, isPublic: false, ownerId: user.id, author: { id:user.id, name:user.name, avatar:user.avatar, provider:user.provider }, bytes, createdAt: Date.now() };
      await kvPut(env, 'MAPS', `map:${id}`, doc);
      await addToIndex(env, user.id, id);
      const g = await kvGet(env, 'MAPS', 'global:ids') || { ids: [] }; g.ids.unshift(id); g.ids=g.ids.slice(0,500); await kvPut(env,'MAPS','global:ids',g);
      await setUsage(env, user.id, usage+bytes);
      return json({ map: doc }, 201);
    } catch(e){ return bad('invalid geojson file',400); }
  }
  return handleCreateMap(req, env);
}
