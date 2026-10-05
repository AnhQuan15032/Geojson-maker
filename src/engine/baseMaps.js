// Split out of the original single-file engine (see legacy/index.html).
// Origin: BASE MAPS & BORDERS

import L from 'leaflet';
import { S } from './state.js';
import { BASE_MAP_LABELS, MAPLIBRE_STYLES } from './constants.js';
import { showToast } from './uiHelpers.js';

export function ensureMapLibre() {
  if (S.maplibreLibPromise) return S.maplibreLibPromise;
  S.maplibreLibPromise = (async () => {
    // Both packages are code-split: neither is in the initial bundle.
    await import('maplibre-gl');
    await import('@maplibre/maplibre-gl-leaflet');
    if (typeof L.maplibreGL !== 'function') {
      S.maplibreLibPromise = null;
      throw new Error('MapLibre GL bridge unavailable');
    }
  })();
  return S.maplibreLibPromise;
}

export async function setBaseMap(type) {
  let layer = S.baseTileLayers[type];

  // Vector styles are created on first pick (MapLibre JS loads lazily)
  if (!layer && MAPLIBRE_STYLES[type]) {
    const prevKey = S.activeBaseKey;
    showToast('Loading MapLibre vector style…');
    try {
      await ensureMapLibre();
      layer = L.maplibreGL({
        style: MAPLIBRE_STYLES[type].style,
        attribution: '© OpenMapTiles · © OpenStreetMap'
      });
      S.baseTileLayers[type] = layer;
    } catch (e) {
      console.warn('MapLibre style failed:', e);
      showToast('MapLibre styles need a connection — staying on the raster layers');
      S.activeBaseKey = prevKey;
      return;
    }
  }
  if (!layer) return;
  Object.values(S.baseTileLayers).forEach(l => {
    if (S.map.hasLayer(l)) S.map.removeLayer(l);
  });
  layer.addTo(S.map); // works for tile layers, layerGroups and MapLibre layers
  S.activeBaseKey = type;
  highlightActiveBase();

  // Terrain is capped at z17 — nudge the user if they zoom deeper
  if (type === 'terrain' && S.map.getZoom() > 17) {
    showToast('Terrain layer max zoom is 17');
  } else {
    showToast(`Base map: ${BASE_MAP_LABELS[type] || type}`);
  }
}

export function highlightActiveBase() {
  document.querySelectorAll('.base-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-base') === S.activeBaseKey;
    btn.classList.toggle('ring-2', isActive);
    btn.classList.toggle('ring-emerald-500', isActive);
    btn.classList.toggle('border-emerald-500', isActive);
    btn.classList.toggle('bg-slate-700', isActive);
    btn.classList.toggle('text-white', isActive);
  });
}

export function toggleBorderOverlay(type) {
  const checkbox = document.getElementById(`layer-${type}`);
  const layer = S.borderOverlays[type];
  if (!layer) return;
  if (checkbox.checked) {
    S.map.addLayer(layer);
    showToast(`${type} borders enabled`);
  } else {
    S.map.removeLayer(layer);
    showToast(`${type} borders disabled`);
  }
}

// ================= GEOJSON STATS & EXPORT =================
