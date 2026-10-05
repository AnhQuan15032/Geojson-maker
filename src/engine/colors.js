// Split out of the original single-file engine (see legacy/index.html).
// Origin: UNIQUE COLOR ENGINE

import L from 'leaflet';
import { S } from './state.js';
import { PREVIEW_COLOR } from './constants.js';
import { updateStats } from './quickTools.js';
import { showToast } from './uiHelpers.js';

// ================= UNIQUE COLOR ENGINE =================
export function nextUniqueColor() {
  // Golden angle (137.508 degrees) spreads hues maximally apart
  const hue = Math.round(S.colorSeq * 137.5078 % 360);
  S.colorSeq++;
  // Vary lightness slightly every cycle for extra differentiation
  const light = 50 + Math.floor(S.colorSeq / 12) * 7 % 20;
  return hslToHex(hue, 72, light);
}

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

export function randomizeSelectedColor() {
  if (!S.activeSelectedLayer) return;
  const c = nextUniqueColor();
  const isLine = S.activeSelectedLayer instanceof L.Polyline && !(S.activeSelectedLayer instanceof L.Polygon);
  if (typeof S.activeSelectedLayer.setStyle === 'function') {
    S.activeSelectedLayer.setStyle(isLine ? {
      color: c
    } : {
      fillColor: c,
      color: c
    });
  }
  if (!S.activeSelectedLayer.feature) setupLayerProperties(S.activeSelectedLayer);
  S.activeSelectedLayer.feature.properties.fill = c;
  if (isLine) S.activeSelectedLayer.feature.properties.stroke = c;
  document.getElementById('style-fill-color').value = c;
  document.getElementById('style-fill-color-val').textContent = c;
  updateStats();
  showToast("New unique color applied");
}

export function setupLayerProperties(layer) {
  layer.feature = layer.feature || {
    type: "Feature",
    properties: {},
    geometry: layer.toGeoJSON().geometry
  };
  const p = layer.feature.properties || {};
  layer.feature.properties = {
    name: p.name || `Region #${S.drawnItems.getLayers().length + 1}`,
    fill: p.fill || layer.options.fillColor || PREVIEW_COLOR,
    "fill-opacity": 1,
    stroke: p.stroke || layer.options.color || p.fill || PREVIEW_COLOR,
    "stroke-width": 0,
    "stroke-dasharray": null
  };
}

// ================= LATITUDE-LONGITUDE GRID ALIGNMENT OVERLAY =================
