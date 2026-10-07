export const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
export function text(t, status = 200, headers = {}) {
  return new Response(t, { status, headers: { 'content-type': 'text/plain', ...headers } });
}
export function bad(msg, status = 400) { return json({ error: msg }, status); }

export function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
export function setCookie(name, value, opts = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; HttpOnly`;
  if (opts.maxAge) s += `; Max-Age=${opts.maxAge}`;
  if (opts.secure !== false) s += `; Secure`;
  if (opts.domain) s += `; Domain=${opts.domain}`;
  // __Host- requires Secure and no Domain
  return s;
}
export function deleteCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
export function uuid() {
  return crypto.randomUUID();
}
export function bytesOf(str) {
  return new TextEncoder().encode(str).length;
}
export function now() { return Date.now(); }

// simple KV helpers with fallback to in-memory
const mem = new Map();
export async function kvGet(env, ns, key) {
  const kv = env[ns];
  if (kv && kv.get) {
    const v = await kv.get(key, 'text');
    return v ? JSON.parse(v) : null;
  }
  const m = mem.get(`${ns}:${key}`);
  return m ? JSON.parse(m) : null;
}
export async function kvPut(env, ns, key, value, opts = {}) {
  const kv = env[ns];
  const str = JSON.stringify(value);
  if (kv && kv.put) {
    await kv.put(key, str, opts);
  } else {
    mem.set(`${ns}:${key}`, str);
  }
}
export async function kvDel(env, ns, key) {
  const kv = env[ns];
  if (kv && kv.delete) await kv.delete(key);
  else mem.delete(`${ns}:${key}`);
}
export async function kvList(env, ns, prefix) {
  const kv = env[ns];
  if (kv && kv.list) {
    const res = await kv.list({ prefix });
    // fetch each
    const out = [];
    for (const k of res.keys) {
      const v = await kv.get(k.name, 'text');
      if (v) try { out.push(JSON.parse(v)); } catch {}
    }
    return out;
  } else {
    const out = [];
    for (const [k, v] of mem.entries()) {
      if (k.startsWith(`${ns}:${prefix}`)) try { out.push(JSON.parse(v)); } catch {}
    }
    return out;
  }
}
