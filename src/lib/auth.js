// Frontend auth helper — Discord-only, Cloudflare Worker /api/auth/*
// Falls back to localStorage mock when Worker not available

const API = '';
let _user = null;
let _listeners = new Set();

function notify() { _listeners.forEach(fn => fn(_user)); }
export function subscribeAuth(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
export function getUser() { return _user; }

export async function fetchMe() {
  try {
    const r = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
    if (!r.ok) throw new Error('no session');
    const j = await r.json();
    _user = j.user || null;
    if (_user) localStorage.setItem('auth_user', JSON.stringify(_user));
    else localStorage.removeItem('auth_user');
    notify();
    return _user;
  } catch (e) {
    try {
      const saved = JSON.parse(localStorage.getItem('auth_user') || localStorage.getItem('demo_auth_user') || 'null');
      if (saved) { _user = saved; notify(); return _user; }
    } catch {}
    _user = null;
    notify();
    return null;
  }
}

export function loginWithDiscord() {
  const url = `${API}/api/auth/discord?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
  location.href = url;
}
// backwards compat
export function loginWith(provider) {
  // only discord is supported now — ignore google
  return loginWithDiscord();
}

export async function logout() {
  try {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  _user = null;
  localStorage.removeItem('auth_user');
  localStorage.removeItem('demo_auth_user');
  notify();
  location.reload();
}

if (typeof window !== 'undefined') {
  fetchMe();
  try {
    const legacy = JSON.parse(localStorage.getItem('demo_auth_user') || 'null');
    if (legacy && !_user) { _user = legacy; }
  } catch {}
}
