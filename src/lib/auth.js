// Local-only auth — no Worker needed. Stores display name + avatar in localStorage.
// Kept simple after cloud deletion: users can still share with a name, Discord is optional via display name.

const KEY = 'auth_user';
let _user = null;
let _listeners = new Set();

function notify() { _listeners.forEach(fn => fn(_user)); }
export function subscribeAuth(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
export function getUser() { return _user; }

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export async function fetchMe() {
  const saved = loadLocal();
  _user = saved;
  notify();
  return _user;
}

export function loginWithDiscord() {
  // local-fallback: prompt for display name instead of OAuth when no Worker
  const current = loadLocal();
  const def = current?.name || '';
  const name = prompt('Enter display name for sharing (or cancel to skip):', def || 'Local User');
  if (name === null) return;
  const trimmed = (name || 'Local User').trim() || 'Local User';
  const user = { id: `local_${Date.now()}`, provider: 'local', name: trimmed, email: '', avatar: '', createdAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(user));
  _user = user;
  notify();
  location.reload();
}
export function loginWith() { return loginWithDiscord(); }

export async function logout() {
  _user = null;
  localStorage.removeItem(KEY);
  localStorage.removeItem('demo_auth_user');
  notify();
  location.reload();
}

if (typeof window !== 'undefined') {
  fetchMe();
}
