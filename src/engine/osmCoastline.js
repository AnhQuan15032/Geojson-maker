// Split out of the original single-file engine (see legacy/index.html).
// Origin: SUPER-DETAIL COASTLINE (LIVE OPENSTREETMAP)

import L from 'leaflet';
import { S } from './state.js';
import { setupLayerProperties } from './colors.js';
import { onFeatureClick } from './exporters/geojson.js';
import { updateStats } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { showToast } from './uiHelpers.js';

export function setOsmStatus(txt, tone) {
  const el = document.getElementById('osm-coast-status');
  if (!el) return;
  el.textContent = txt;
  el.className = tone === 'ok' ? 'text-[10px] font-mono text-emerald-400' : tone === 'busy' ? 'text-[10px] font-mono text-amber-300' : tone === 'warn' ? 'text-[10px] font-mono text-rose-300' : 'text-[10px] font-mono text-slate-400';
}

export function osmToleranceMeters() {
  const el = document.getElementById('osm-tolerance');
  const v = el ? parseFloat(el.value) : 300;
  return isFinite(v) && v > 0 ? v : 300;
}

export function drawOsmPreview() {
  if (S.osmPreviewLayer) {
    S.map.removeLayer(S.osmPreviewLayer);
    S.osmPreviewLayer = null;
  }
  if (S.osmCoastLines.length === 0) return;

  // Decimate for display only — snapping/detection still use full precision,
  // but drawing 200k vertices every frame is what made the map stutter.
  const total = S.osmCoastLines.reduce((s, l) => s + l.coords.length, 0);
  const MAX_PREVIEW_PTS = 45000;
  const stride = total > MAX_PREVIEW_PTS ? Math.ceil(total / MAX_PREVIEW_PTS) : 1;
  const lls = S.osmCoastLines.map(l => {
    const c = l.coords;
    if (stride <= 1 || c.length <= 6) return c.map(p => L.latLng(p[1], p[0]));
    const out = [];
    for (let i = 0; i < c.length; i += stride) out.push(L.latLng(c[i][1], c[i][0]));
    const last = c[c.length - 1];
    const outLast = out[out.length - 1];
    if (!outLast || outLast.lat !== last[1] || outLast.lng !== last[0]) out.push(L.latLng(last[1], last[0]));
    return out;
  }).filter(arr => arr.length >= 2);
  if (lls.length === 0) return;
  S.osmPreviewLayer = L.polyline(lls, {
    color: '#22d3ee',
    weight: 1.8,
    opacity: 0.95,
    interactive: false,
    smoothFactor: 2
  }).addTo(S.map);
}

export async function fetchOsmCoastline(bounds, silent) {
  if (S.osmFetchBusy) {
    showToast('Still downloading coastline…');
    return false;
  }
  const s = bounds.getSouth(),
    w = bounds.getWest(),
    n = bounds.getNorth(),
    e = bounds.getEast();
  if (e - w > 4 || n - s > 4) {
    showToast('Zoom in first — keep the fetch area under ~4° (needs real coastline detail to be meaningful)');
    return false;
  }
  S.osmFetchBusy = true;
  setOsmStatus('downloading…', 'busy');
  const btn = document.getElementById('btn-osm-fetch');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-60');
  }
  try {
    const q = `[out:json][timeout:30];way["natural"="coastline"](${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)});out geom;`;
    const body = 'data=' + encodeURIComponent(q);
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let json = null,
      lastErr = null;
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const r = await fetch(endpoints[i], {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        json = await r.json();
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!json) throw lastErr || new Error('Overpass unreachable');
    const els = json.elements || [];
    S.osmCoastLines = [];
    let pts = 0;
    els.forEach(el => {
      if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) return;
      const coords = el.geometry.map(p => [p.lon, p.lat]);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      coords.forEach(c => {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
      });
      S.osmCoastLines.push({
        coords,
        bbox: [minX, minY, maxX, maxY]
      });
      pts += coords.length;
    });
    if (S.osmCoastLines.length === 0) {
      setOsmStatus('no coastline here', null);
      if (!silent) showToast('No OSM coastline in this view — pan to a coast and try again');
      return false;
    }
    drawOsmPreview();
    setOsmStatus(`${pts.toLocaleString()} pts · ${S.osmCoastLines.length} ways`, 'ok');
    if (!silent) showToast(`Real coastline fetched — ${pts.toLocaleString()} genuine OSM points`);
    return true;
  } catch (err) {
    console.warn('OSM coastline fetch failed:', err);
    setOsmStatus('download failed', 'warn');
    if (!silent) showToast('Coastline download failed — Overpass may be busy, try again');
    return false;
  } finally {
    S.osmFetchBusy = false;
    const b = document.getElementById('btn-osm-fetch');
    if (b) {
      b.disabled = false;
      b.classList.remove('opacity-60');
    }
  }
}

export function fetchOsmCoastlineAction() {
  fetchOsmCoastline(S.map.getBounds().pad(0.1));
}

export function clearOsmCoastline() {
  S.osmCoastLines = [];
  if (S.osmPreviewLayer) {
    S.map.removeLayer(S.osmPreviewLayer);
    S.osmPreviewLayer = null;
  }
  setOsmStatus('not loaded', null);
  showToast('Fetched coastline cleared');
}

// Insert the real coastline onto the map as one editable, exportable shape

// Insert the real coastline onto the map as one editable, exportable shape
export function addOsmCoastAsShape() {
  if (S.osmCoastLines.length === 0) {
    showToast('Fetch the coastline first (Fetch for view)');
    return;
  }
  const multi = S.osmCoastLines.map(l => l.coords);
  const feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      coordinates: multi
    }
  };
  const layer = L.geoJSON(feature, {
    style: {
      color: '#22d3ee',
      weight: 2,
      opacity: 1,
      fillOpacity: 0,
      interactive: true
    }
  }).getLayers()[0];
  if (!layer) {
    showToast('Could not add coastline');
    return;
  }
  setupLayerProperties(layer);
  layer.feature.properties.name = 'Real Coastline (OSM)';
  layer.feature.properties.stroke = '#22d3ee';
  layer.feature.properties.fill = '#22d3ee';
  layer.feature.properties['stroke-width'] = 2;
  layer.on('click', () => {
    S.activeSelectedLayer = layer;
    populateStyleDrawer(layer);
    onFeatureClick(layer);
  });
  S.drawnItems.addLayer(layer);
  S.activeSelectedLayer = layer;
  updateStats();
  populateStyleDrawer(layer);
  const pts = multi.reduce((s, c) => s + c.length, 0);
  showToast(`Real coastline added as one editable line shape (${pts.toLocaleString()} points)`);
}

// ================= FAST COASTLINE (VECTOR TILES) =================
// Lightning-fast wide-area coverage: OSM vector tiles are streamed and the
// `water` (ocean) layer is decoded in-browser with a tiny zero-dependency
// MVT/protobuf reader. Ocean polygons then cut real coastlines into any
// shape — including countries — far faster than Overpass.
