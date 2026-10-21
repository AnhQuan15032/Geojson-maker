// Split out of the original single-file engine (see legacy/index.html).
// Origin: QUICK TOOLS

import L from 'leaflet';
import * as lucide from '../lib/icons.js';
import { S } from './state.js';
import { setupLayerProperties } from './colors.js';
import { onFeatureClick } from './exporters/geojson.js';
import { announce } from './history.js';
import { healLayerGeometryIfCorrupted } from './merge.js';
import { invalidateHeavyStats, runHeavyStats, statsEl } from './stats.js';
import { populateStyleDrawer } from './styleInspector.js';
import { mobileHaptic, showToast } from './uiHelpers.js';

// ================= QUICK TOOLS =================
export function duplicateSelectedShape() {
  const src = S.activeSelectedLayer;
  if (!src || !S.drawnItems.hasLayer(src)) {
    showToast('Select a shape to duplicate');
    return;
  }
  const geo = src.toGeoJSON();
  const srcOptions = src.options || {};
  const styleKeys = [
    'stroke', 'color', 'weight', 'opacity', 'lineCap', 'lineJoin', 'dashArray',
    'dashOffset', 'fill', 'fillColor', 'fillOpacity', 'fillRule', 'className',
    'bubblingMouseEvents', 'interactive', 'pane', 'renderer', 'smoothFactor', 'noClip',
  ];
  const copiedStyle = {};
  for (const key of styleKeys) {
    if (srcOptions[key] !== undefined) copiedStyle[key] = srcOptions[key];
  }
  const layer = L.geoJSON(geo, {
    style: () => ({ ...copiedStyle }),
    pointToLayer: (_feature, latlng) => src instanceof L.CircleMarker
      ? L.circleMarker(latlng, { ...srcOptions })
      : L.marker(latlng, { ...srcOptions }),
  }).getLayers()[0];
  if (!layer) {
    showToast('Could not duplicate that shape');
    return;
  }
  setupLayerProperties(layer);
  const originalProperties = geo.properties || {};
  const baseName = String(originalProperties.name || 'Region').replace(/ \(copy( \d+)?\)$/, '');
  layer.feature.properties = {
    ...(layer.feature.properties || {}),
    ...originalProperties,
    name: `${baseName} (copy)`,
  };
  layer.on('click', () => {
    if (S.splitModeActive) return;
    S.activeSelectedLayer = layer;
    populateStyleDrawer(layer);
    onFeatureClick(layer);
  });
  S.drawnItems.addLayer(layer);
  S.activeSelectedLayer = layer;
  populateStyleDrawer(layer);
  updateStats();
  mobileHaptic(8);
  showToast(`Duplicated “${baseName}”`);
  announce('Shape duplicated');
}

export function zoomToSelection() {
  const l = S.activeSelectedLayer;
  if (!l || !S.drawnItems.hasLayer(l)) {
    showToast('Select a shape first');
    return;
  }
  try {
    if (typeof l.getBounds === 'function') S.map.fitBounds(l.getBounds(), {
      padding: [50, 50],
      maxZoom: 12
    });else if (typeof l.getLatLng === 'function') S.map.setView(l.getLatLng(), 12);
    announce('Zoomed to selected shape');
  } catch (e) {
    showToast('Could not zoom to that shape');
  }
}

export function fitAllShapes() {
  if (S.drawnItems.getLayers().length === 0) {
    showToast('Nothing on the map yet');
    return;
  }
  try {
    S.map.fitBounds(S.drawnItems.getBounds(), {
      padding: [40, 40]
    });
    showToast('Fitted every shape in view');
    announce('All shapes fitted in view');
  } catch (e) {
    showToast('Could not fit the shapes');
  }
}

export function toggleShortcutSheet(open) {
  const el = document.getElementById('shortcut-sheet');
  if (!el) return;
  const show = open === undefined ? !el.classList.contains('open') : open;
  el.classList.toggle('open', show);
  if (show) {
    lucide.createIcons();
    announce('Keyboard shortcuts opened');
  }
}

export function updateMobileSelectionBar() {
  const bar = document.getElementById('mobile-selection-bar');
  if (!bar) return;
  let layer = S.activeSelectedLayer;
  const valid = layer && S.drawnItems && S.drawnItems.hasLayer(layer);
  bar.classList.toggle('visible', !!valid);
  if (!valid) return;

  // Auto-heal any layer that has external holes or horizontal artifacts
  layer = healLayerGeometryIfCorrupted(layer);
  const props = layer.feature && layer.feature.properties || {};
  const opts = layer.options || {};
  let type = 'Shape';
  try {
    type = layer.toGeoJSON().geometry.type;
  } catch (e) {}
  const name = props.name || 'Selected shape';
  const color = opts.fillColor || props.fill || opts.color || props.stroke || '#10b981';
  const nameEl = document.getElementById('mobile-selection-name');
  const typeEl = document.getElementById('mobile-selection-type');
  const colorEl = document.getElementById('mobile-selection-color');
  if (nameEl) nameEl.textContent = name;
  if (typeEl) typeEl.textContent = type.replace(/([a-z])([A-Z])/g, '$1 $2');
  if (colorEl) colorEl.style.background = color;
}

export function updateStats() {
  const count = S.drawnItems.getLayers().length;
  const fc = statsEl('stat-feature-count');
  if (fc) fc.textContent = `${count} Items`;
  const mobileCount = document.getElementById('mobile-shape-count');
  if (mobileCount) mobileCount.textContent = `${count} shape${count === 1 ? '' : 's'}`;
  const perf = document.getElementById('perf-chip');
  if (perf && count !== S.heavyStatsCount) perf.textContent = `${count} shapes · stats …`;
  updateMobileSelectionBar();
  invalidateHeavyStats(); // geometry walk happens once, later
}

// Force a synchronous refresh (used when a panel that displays the data opens)

// Force a synchronous refresh (used when a panel that displays the data opens)
export function updateStatsNow() {
  if (S.statsCoalesceTimer) {
    clearTimeout(S.statsCoalesceTimer);
    S.statsCoalesceTimer = null;
  }
  runHeavyStats();
}

export function liveGeoJSONString(pretty) {
  const data = S.drawnItems.toGeoJSON();
  const heavy = data.features.length > 400;
  if (pretty && !heavy) return JSON.stringify(data, null, 2);
  return JSON.stringify(data);
}

export function downloadGeoJSON() {
  const content = liveGeoJSONString(true);
  const blob = new Blob([content], {
    type: "application/geo+json"
  });
  const url = URL.createObjectURL(blob);
  const dl = document.createElement('a');
  dl.href = url;
  dl.download = `map_data_${Date.now()}.geojson`;
  document.body.appendChild(dl);
  dl.click();
  dl.remove();
  URL.revokeObjectURL(url);
  showToast("GeoJSON file exported!");
}

export function copyGeoJSONToClipboard() {
  const content = liveGeoJSONString(true);
  navigator.clipboard.writeText(content).then(() => {
    showToast("GeoJSON copied to clipboard!");
  }).catch(() => {
    showToast("Clipboard blocked by browser — use Save .geojson");
  });
}

// ================= UI HELPERS =================
