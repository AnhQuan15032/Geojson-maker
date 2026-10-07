// Central settings — persisted in localStorage, used to gate optional features
const KEY = 'geojson_settings';

const defaults = {
  cloudEnabled: false, // cloud sync disabled by default (request)
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
  // notify listeners
  _listeners.forEach(fn => fn(next));
  return next;
}

let _listeners = new Set();
export function getSettings() { return load(); }
export function setSettings(patch) { return save(patch); }
export function isCloudEnabled() { return !!load().cloudEnabled; }
export function setCloudEnabled(v) { return save({ cloudEnabled: !!v }); }
export function isWelcomeCompleted() { return !!load().welcomeCompleted; }
export function setWelcomeCompleted(v) { return save({ welcomeCompleted: !!v }); }

export function subscribeSettings(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// legacy key migration: if user ever published before, keep cloud on? No — request is disabled by default for everyone
