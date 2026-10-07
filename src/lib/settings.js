// Simple settings — only welcome screen now (cloud deleted)
const KEY = 'geojson_settings';

const defaults = {
  welcomeCompleted: false,
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...defaults, ...raw };
  } catch { return { ...defaults }; }
}
function save(patch) {
  const next = { ...load(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  _listeners.forEach(fn => fn(next));
  return next;
}

let _listeners = new Set();
export function getSettings() { return load(); }
export function setSettings(patch) { return save(patch); }
export function isWelcomeCompleted() { return !!load().welcomeCompleted; }
export function setWelcomeCompleted(v) { return save({ welcomeCompleted: !!v }); }

export function subscribeSettings(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
