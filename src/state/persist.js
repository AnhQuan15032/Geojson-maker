/**
 * Workspace persistence (localStorage).
 *
 * The map itself always boots empty — nothing is drawn for you. What we do
 * restore is *your own* previous session, and only when one exists; heavy
 * embedded images (large data: URLs) and un-shareable blob: URLs are dropped
 * first so we never blow the storage quota.
 */

const KEY = 'geojson-maker.workspace.v1';
const MAX_EMBEDDED = 200 * 1024;    // bytes of data: URL we're willing to keep

export function canPersist() {
  try {
    const probe = '__gm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function trimImageUrls(data) {
  let dropped = 0;
  const check = (image) => {
    if (!image || typeof image !== 'object' || typeof image.url !== 'string') return;
    const url = image.url;
    if (url.startsWith('blob:') || (url.startsWith('data:') && url.length > MAX_EMBEDDED)) {
      image.url = null;
      image.unavailable = true;
      dropped++;
    }
  };
  for (const feature of data.features || []) {
    check(feature.style && feature.style['image-fill']);
    check(feature.properties && feature.properties['x-image-fill']);
  }
  check(data.defaultStyle && data.defaultStyle['image-fill']);
  return dropped;
}

export function saveWorkspace(store, view) {
  if (!canPersist()) return { ok: false, reason: 'storage-unavailable' };
  try {
    const data = store.serialize({ center: view.camera.center, zoom: view.camera.zoom });
    const dropped = trimImageUrls(data);
    const json = JSON.stringify(data);
    window.localStorage.setItem(KEY, json);
    store.markSaved();
    return { ok: true, bytes: json.length, dropped };
  } catch (err) {
    // Quota exceeded: retry once without any embedded images at all.
    try {
      const data = store.serialize({ center: view.camera.center, zoom: view.camera.zoom });
      for (const feature of data.features || []) {
        if (feature.style && feature.style['image-fill']) feature.style['image-fill'].url = null;
        if (feature.properties) delete feature.properties['x-image-fill'];
      }
      const json = JSON.stringify(data);
      window.localStorage.setItem(KEY, json);
      store.markSaved();
      return { ok: true, bytes: json.length, dropped: -1 };
    } catch {
      return { ok: false, reason: err && err.name === 'QuotaExceededError' ? 'quota' : 'error' };
    }
  }
}

export function loadWorkspace() {
  if (!canPersist()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearWorkspace() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function workspaceSummary() {
  const data = loadWorkspace();
  if (!data) return null;
  return {
    features: (data.features || []).length,
    savedAt: data.savedAt || null,
    bytes: 0,
  };
}

export { KEY };
