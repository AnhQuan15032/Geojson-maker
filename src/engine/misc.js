// Split out of the original single-file engine (see legacy/index.html).
// Origin: LATITUDE-LONGITUDE GRID ALIGNMENT OVERLAY  ·  DRAWING POINT LABELS (TEXT BELOW VERTICES)  ·  GUI THEME ENGINE  ·  GUI LAYOUT ENGINE  ·  TEXT SIZE ENGINE  ·  SETTINGS INITIALIZER  ·  MAGNETIC EDGE & VERTEX SNAPPING ENGINE

import L from 'leaflet';
import * as lucide from '../lib/icons.js';
import { S } from './state.js';
import { GUI_LAYOUTS, GUI_THEMES, TEXT_SIZES } from './constants.js';
import { mobileHaptic, showToast } from './uiHelpers.js';

export function toggleLatLngGrid(forceState) {
  if (typeof forceState === 'boolean') {
    S.latLngGridEnabled = forceState;
  } else {
    S.latLngGridEnabled = !S.latLngGridEnabled;
  }
  try {
    localStorage.setItem('carto_latlng_grid', S.latLngGridEnabled ? '1' : '0');
  } catch (e) {}
  mobileHaptic(S.latLngGridEnabled ? [6, 20, 6] : 6);
  updateLatLngGridUI();
  if (S.latLngGridEnabled) {
    renderLatLngGrid();
    showToast("Lat-Long alignment grid ON");
  } else {
    if (S.latLngGridLayerGroup) S.latLngGridLayerGroup.clearLayers();
    showToast("Lat-Long alignment grid OFF");
  }
}

export function updateLatLngGridUI() {
  const stateText = S.latLngGridEnabled ? 'ON' : 'OFF';

  // Header button
  const headerText = document.getElementById('text-grid-header');
  const headerInd = document.getElementById('indicator-grid-header');
  const headerBtn = document.getElementById('btn-grid-header');
  if (headerText) {
    headerText.textContent = stateText;
    headerText.className = S.latLngGridEnabled ? 'text-sky-300 font-bold' : 'text-slate-400';
  }
  if (headerInd) {
    headerInd.className = S.latLngGridEnabled ? 'w-2 h-2 rounded-full bg-sky-400 shadow-sm shadow-sky-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }
  if (headerBtn) {
    if (S.latLngGridEnabled) {
      headerBtn.classList.add('border-sky-500/80', 'bg-sky-950/80', 'text-sky-100');
    } else {
      headerBtn.classList.remove('border-sky-500/80', 'bg-sky-950/80', 'text-sky-100');
    }
  }

  // Mobile button
  const mobText = document.getElementById('text-grid-mobile');
  const mobInd = document.getElementById('indicator-grid-mobile');
  const mobBtn = document.getElementById('btn-grid-mobile');
  if (mobText) {
    mobText.textContent = stateText;
    mobText.className = S.latLngGridEnabled ? 'text-sky-300' : 'text-slate-500';
  }
  if (mobInd) {
    mobInd.className = S.latLngGridEnabled ? 'w-2 h-2 rounded-full bg-sky-400 shadow-sm shadow-sky-400' : 'w-2 h-2 rounded-full bg-slate-500';
  }
  if (mobBtn) {
    if (S.latLngGridEnabled) {
      mobBtn.classList.add('border-sky-500/80', 'bg-sky-950/80', 'text-sky-100');
    } else {
      mobBtn.classList.remove('border-sky-500/80', 'bg-sky-950/80', 'text-sky-100');
    }
  }

  // Rail button
  const railBtn = document.getElementById('btn-grid-rail');
  if (railBtn) {
    if (S.latLngGridEnabled) {
      railBtn.classList.add('text-sky-300', 'bg-slate-800');
    } else {
      railBtn.classList.remove('text-sky-300', 'bg-slate-800');
    }
  }

  // Settings drawer toggle
  const setCheck = document.getElementById('toggle-latlng-grid-settings');
  const setStatus = document.getElementById('status-latlng-grid-settings');
  if (setCheck) setCheck.checked = S.latLngGridEnabled;
  if (setStatus) {
    setStatus.textContent = stateText;
    setStatus.className = S.latLngGridEnabled ? 'text-[10px] font-bold text-sky-400' : 'text-[10px] font-bold text-slate-400';
  }
}

export function renderLatLngGrid() {
  if (!S.map || !S.latLngGridEnabled) return;
  if (!S.latLngGridLayerGroup) {
    S.latLngGridLayerGroup = new L.LayerGroup().addTo(S.map);
  }
  S.latLngGridLayerGroup.clearLayers();
  const bounds = S.map.getBounds();
  const zoom = S.map.getZoom();

  // Adaptive intervals based on zoom level for optimal readability
  let step = 10;
  if (zoom <= 2) step = 30;else if (zoom <= 4) step = 15;else if (zoom <= 6) step = 5;else if (zoom <= 8) step = 2;else if (zoom <= 10) step = 1;else if (zoom <= 12) step = 0.5;else if (zoom <= 14) step = 0.1;else if (zoom <= 16) step = 0.02;else if (zoom <= 18) step = 0.005;else step = 0.001;
  const south = Math.max(-85, bounds.getSouth());
  const north = Math.min(85, bounds.getNorth());
  const west = bounds.getWest();
  const east = bounds.getEast();
  const startLat = Math.floor(south / step) * step;
  const endLat = Math.ceil(north / step) * step;
  const startLng = Math.floor(west / step) * step;
  const endLng = Math.ceil(east / step) * step;
  const lonSpan = east - west;
  const latSpan = north - south;
  const labelLngLeft = west + lonSpan * 0.04;
  const labelLngRight = east - lonSpan * 0.04;
  const labelLatBottom = south + latSpan * 0.06;
  const labelLatTop = north - latSpan * 0.06;
  const precision = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const formatLat = lat => {
    if (Math.abs(lat) < 1e-5) return "0° Equator";
    if (Math.abs(lat - 23.4365) < step / 2) return "23.4°N Tropic of Cancer";
    if (Math.abs(lat + 23.4365) < step / 2) return "23.4°S Tropic of Capricorn";
    if (Math.abs(lat - 66.56) < step / 2) return "66.6°N Arctic Circle";
    if (Math.abs(lat + 66.56) < step / 2) return "66.6°S Antarctic Circle";
    return `${Math.abs(lat).toFixed(precision)}°${lat >= 0 ? 'N' : 'S'}`;
  };
  const formatLng = lng => {
    let norm = ((lng + 180) % 360 + 360) % 360 - 180;
    if (Math.abs(norm) < 1e-5) return "0° Prime Meridian";
    if (Math.abs(Math.abs(norm) - 180) < 1e-5) return "180° Antimeridian";
    return `${Math.abs(norm).toFixed(precision)}°${norm >= 0 ? 'E' : 'W'}`;
  };

  // 1. Draw Parallels (Latitude lines)
  const latLineBuffer = Math.max(1, lonSpan * 0.1);
  for (let lat = startLat; lat <= endLat + 1e-6; lat += step) {
    if (lat < -85.001 || lat > 85.001) continue;
    const isSpecial = Math.abs(lat) < 1e-5 || Math.abs(Math.abs(lat) - 23.4365) < step / 2;
    const style = isSpecial ? {
      color: '#f59e0b',
      weight: 1.5,
      opacity: 0.85,
      dashArray: '6, 4',
      interactive: false
    } : {
      color: '#38bdf8',
      weight: 1,
      opacity: 0.42,
      dashArray: '3, 4',
      interactive: false
    };
    const polyline = L.polyline([[lat, west - latLineBuffer], [lat, east + latLineBuffer]], style);
    S.latLngGridLayerGroup.addLayer(polyline);
    const lblText = formatLat(lat);
    const iconL = L.divIcon({
      className: 'latlng-grid-label-div',
      html: `<div class="latlng-grid-label">${lblText}</div>`,
      iconAnchor: [0, 10]
    });
    S.latLngGridLayerGroup.addLayer(L.marker([lat, labelLngLeft], {
      icon: iconL,
      interactive: false
    }));
    if (lonSpan > 2) {
      const iconR = L.divIcon({
        className: 'latlng-grid-label-div',
        html: `<div class="latlng-grid-label">${lblText}</div>`,
        iconAnchor: [48, 10]
      });
      S.latLngGridLayerGroup.addLayer(L.marker([lat, labelLngRight], {
        icon: iconR,
        interactive: false
      }));
    }
  }

  // 2. Draw Meridians (Longitude lines)
  const maxLines = 150;
  let lineCount = 0;
  for (let lng = startLng; lng <= endLng + 1e-6 && lineCount < maxLines; lng += step, lineCount++) {
    let norm = ((lng + 180) % 360 + 360) % 360 - 180;
    const isSpecial = Math.abs(norm) < 1e-5 || Math.abs(Math.abs(norm) - 180) < 1e-5;
    const style = isSpecial ? {
      color: '#f59e0b',
      weight: 1.5,
      opacity: 0.85,
      dashArray: '6, 4',
      interactive: false
    } : {
      color: '#38bdf8',
      weight: 1,
      opacity: 0.42,
      dashArray: '3, 4',
      interactive: false
    };
    const polyline = L.polyline([[-85, lng], [85, lng]], style);
    S.latLngGridLayerGroup.addLayer(polyline);
    const lngText = formatLng(lng);
    const iconB = L.divIcon({
      className: 'latlng-grid-label-div',
      html: `<div class="latlng-grid-label">${lngText}</div>`,
      iconAnchor: [24, 0]
    });
    S.latLngGridLayerGroup.addLayer(L.marker([labelLatBottom, lng], {
      icon: iconB,
      interactive: false
    }));
    if (latSpan > 4) {
      const iconT = L.divIcon({
        className: 'latlng-grid-label-div',
        html: `<div class="latlng-grid-label">${lngText}</div>`,
        iconAnchor: [24, 18]
      });
      S.latLngGridLayerGroup.addLayer(L.marker([labelLatTop, lng], {
        icon: iconT,
        interactive: false
      }));
    }
  }
}

// ================= DRAWING POINT LABELS (TEXT BELOW VERTICES) =================

export function toggleDrawingPointLabels(forceState) {
  if (typeof forceState === 'boolean') {
    S.showDrawingPointLabels = forceState;
  } else {
    S.showDrawingPointLabels = !S.showDrawingPointLabels;
  }
  try {
    localStorage.setItem('carto_draw_point_labels', S.showDrawingPointLabels ? '1' : '0');
  } catch (e) {}
  mobileHaptic(S.showDrawingPointLabels ? [6, 18] : 6);
  updateDrawingPointLabelsUI();
  if (!S.showDrawingPointLabels) {
    clearDrawingPointLabels();
    showToast("Point coordinate labels OFF");
  } else {
    showToast("Point coordinate labels ON");
    if (S.activeDrawingWorkingLayer) {
      updateDrawingPointLabels(S.activeDrawingWorkingLayer);
    } else if (S.activeSelectedLayer) {
      showPointLabelsForLayer(S.activeSelectedLayer);
    }
  }
}

export function updateDrawingPointLabelsUI() {
  const stateText = S.showDrawingPointLabels ? 'ON' : 'OFF';
  const chkSettings = document.getElementById('toggle-draw-point-labels');
  const stSettings = document.getElementById('status-draw-point-labels');
  if (chkSettings) chkSettings.checked = S.showDrawingPointLabels;
  if (stSettings) {
    stSettings.textContent = stateText;
    stSettings.className = S.showDrawingPointLabels ? 'text-[10px] font-bold text-emerald-400' : 'text-[10px] font-bold text-slate-400';
  }
  const chkDraw = document.getElementById('toggle-draw-point-labels-draw-drawer');
  if (chkDraw) chkDraw.checked = S.showDrawingPointLabels;
}

export function clearDrawingPointLabels() {
  if (S.drawingPointMarkersGroup) {
    S.drawingPointMarkersGroup.clearLayers();
  }
}

export function formatCoordBrief(lat, lng) {
  const n = lat >= 0 ? `${lat.toFixed(3)}°N` : `${(-lat).toFixed(3)}°S`;
  const e = lng >= 0 ? `${lng.toFixed(3)}°E` : `${(-lng).toFixed(3)}°W`;
  return `${n}, ${e}`;
}

export function updateDrawingPointLabels(source) {
  if (!S.map || !S.showDrawingPointLabels) return;
  if (!S.drawingPointMarkersGroup) {
    S.drawingPointMarkersGroup = new L.LayerGroup().addTo(S.map);
  }
  S.drawingPointMarkersGroup.clearLayers();
  if (!source) return;
  let pts = [];
  if (Array.isArray(source)) {
    pts = source;
  } else if (typeof source.getLatLngs === 'function') {
    const raw = source.getLatLngs();
    const walk = arr => {
      if (!arr) return;
      if (arr instanceof L.LatLng) pts.push(arr);else if (Array.isArray(arr)) {
        if (arr.length > 0 && arr[0] instanceof L.LatLng) {
          arr.forEach(ll => pts.push(ll));
        } else {
          arr.forEach(walk);
        }
      }
    };
    walk(raw);
  }
  if (pts.length === 0) return;
  pts.forEach((ll, idx) => {
    let distText = '';
    if (idx > 0) {
      const prev = pts[idx - 1];
      const m = prev.distanceTo(ll);
      distText = m >= 1000 ? ` (+${(m / 1000).toFixed(1)}km)` : ` (+${Math.round(m)}m)`;
    }
    const badgeHtml = `
          <div class="point-coord-pill">
            <span class="text-sky-300 font-bold">P${idx + 1}</span> • ${formatCoordBrief(ll.lat, ll.lng)}${distText}
          </div>
        `;
    const icon = L.divIcon({
      className: 'point-coord-label-div',
      html: badgeHtml,
      iconAnchor: [0, -14]
    });
    const marker = L.marker(ll, {
      icon,
      interactive: false
    });
    S.drawingPointMarkersGroup.addLayer(marker);
  });
}

export function showPointLabelsForLayer(layer) {
  if (!layer || !S.showDrawingPointLabels) return;
  updateDrawingPointLabels(layer);
}

// ================= GUI THEME ENGINE =================

export function setGuiTheme(themeKey, notify = true) {
  const found = GUI_THEMES.find(t => t.id === themeKey) || GUI_THEMES[0];
  S.currentGuiTheme = found.id;
  document.documentElement.setAttribute('data-theme', found.id);
  document.body.setAttribute('data-theme', found.id);
  try {
    localStorage.setItem('carto_gui_theme', found.id);
  } catch (e) {}
  const label = document.getElementById('label-active-theme');
  if (label) label.textContent = found.name;
  renderThemeOptions();
  if (notify) {
    mobileHaptic(8);
    showToast(`Theme changed: ${found.name}`);
  }
}

export function renderThemeOptions() {
  const container = document.getElementById('theme-options-grid');
  if (!container) return;
  container.innerHTML = GUI_THEMES.map(t => {
    const active = t.id === S.currentGuiTheme;
    return `
          <button onclick="setGuiTheme('${t.id}')"
            class="flex items-center gap-2 p-2 rounded-xl border text-left transition active:scale-95 ${active ? 'border-amber-400 bg-amber-500/15 shadow-md shadow-amber-900/30' : 'border-slate-700/60 bg-slate-800/60 hover:bg-slate-700/50'}">
            <div class="w-4 h-4 rounded-full border shadow-inner shrink-0" style="background:${t.color}; border-color:${t.accent}"></div>
            <div class="min-w-0">
              <div class="text-[11px] font-bold truncate ${active ? 'text-amber-300' : 'text-slate-200'}">${t.name}</div>
            </div>
          </button>
        `;
  }).join('');
}

// ================= GUI LAYOUT ENGINE =================

export function setGuiLayout(layoutKey, notify = true) {
  const found = GUI_LAYOUTS.find(l => l.id === layoutKey) || GUI_LAYOUTS[0];
  S.currentGuiLayout = found.id;
  document.documentElement.setAttribute('data-layout', found.id);
  document.body.setAttribute('data-layout', found.id);
  try {
    localStorage.setItem('carto_gui_layout', found.id);
  } catch (e) {}
  const label = document.getElementById('label-active-layout');
  if (label) label.textContent = found.name;
  renderLayoutOptions();
  if (S.map) {
    setTimeout(() => S.map.invalidateSize({
      pan: false
    }), 120);
  }
  if (notify) {
    mobileHaptic(8);
    showToast(`Layout changed: ${found.name}`);
  }
}

export function renderLayoutOptions() {
  const container = document.getElementById('layout-options-grid');
  if (!container) return;
  container.innerHTML = GUI_LAYOUTS.map(l => {
    const active = l.id === S.currentGuiLayout;
    return `
          <button onclick="setGuiLayout('${l.id}')"
            class="flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition active:scale-95 ${active ? 'border-purple-400 bg-purple-500/15 shadow-md shadow-purple-900/30' : 'border-slate-700/60 bg-slate-800/60 hover:bg-slate-700/50'}">
            <div class="p-1.5 rounded-lg shrink-0 ${active ? 'bg-purple-500/25 text-purple-300' : 'bg-slate-700/50 text-slate-400'}">
              <i data-lucide="${l.icon}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold ${active ? 'text-purple-300' : 'text-slate-200'}">${l.name}</div>
              <div class="text-[9px] text-slate-400 truncate">${l.desc}</div>
            </div>
          </button>
        `;
  }).join('');
  lucide.createIcons();
}

// ================= TEXT SIZE ENGINE =================

export function setTextSize(sizeKey, notify = true) {
  const found = TEXT_SIZES.find(s => s.id === sizeKey) || TEXT_SIZES[1];
  S.currentTextSize = found.id;
  document.documentElement.style.fontSize = found.scale;
  document.documentElement.style.setProperty('--app-font-scale', found.scale);
  try {
    localStorage.setItem('carto_gui_text_size', found.id);
  } catch (e) {}
  const label = document.getElementById('label-active-text-size');
  if (label) label.textContent = found.name;
  renderTextSizeOptions();
  if (S.map) {
    setTimeout(() => S.map.invalidateSize({
      pan: false
    }), 120);
  }
  if (notify) {
    mobileHaptic(8);
    showToast(`Text size: ${found.label} (${found.name})`);
  }
}

export function renderTextSizeOptions() {
  const container = document.getElementById('text-size-options-grid');
  if (!container) return;
  container.innerHTML = TEXT_SIZES.map(s => {
    const active = s.id === S.currentTextSize;
    return `
          <button onclick="setTextSize('${s.id}')"
            class="flex flex-col items-center justify-center p-2 rounded-xl border text-center transition active:scale-95 ${active ? 'border-teal-400 bg-teal-500/15 shadow-md shadow-teal-900/30' : 'border-slate-700/60 bg-slate-800/60 hover:bg-slate-700/50'}">
            <span class="text-xs font-mono font-bold ${active ? 'text-teal-300' : 'text-slate-200'}">${s.name}</span>
            <span class="text-[9px] ${active ? 'text-teal-400' : 'text-slate-400'}">${s.label}</span>
          </button>
        `;
  }).join('');
}

// ================= SETTINGS INITIALIZER =================

// ================= SETTINGS INITIALIZER =================
export function initGuiSettings() {
  // 1. Theme
  let savedTheme = 'dark';
  try {
    savedTheme = localStorage.getItem('carto_gui_theme') || 'dark';
  } catch (e) {}
  setGuiTheme(savedTheme, false);

  // 2. Layout
  let savedLayout = 'default';
  try {
    savedLayout = localStorage.getItem('carto_gui_layout') || 'default';
  } catch (e) {}
  setGuiLayout(savedLayout, false);

  // 3. Text Size
  let savedSize = 'normal';
  try {
    savedSize = localStorage.getItem('carto_gui_text_size') || 'normal';
  } catch (e) {}
  setTextSize(savedSize, false);

  // 4. Lat-Long Grid
  let savedGrid = false;
  try {
    savedGrid = localStorage.getItem('carto_latlng_grid') === '1';
  } catch (e) {}
  if (savedGrid) {
    toggleLatLngGrid(true);
  } else {
    updateLatLngGridUI();
  }

  // 5. Drawing Point Labels
  let savedPointLabels = true;
  try {
    const val = localStorage.getItem('carto_draw_point_labels');
    if (val === '0') savedPointLabels = false;
  } catch (e) {}
  S.showDrawingPointLabels = savedPointLabels;
  updateDrawingPointLabelsUI();
}

// ================= LAZY HEAVY LIBRARIES (Lightweight Init) =================

export function applySnappingOptionsToMap() {
  if (!S.map || !S.map.pm) return;
  S.map.pm.setGlobalOptions({
    layerGroup: S.drawnItems,
    snappable: S.snappingEnabled,
    snapDistance: S.snappingDistance,
    snapSegment: S.snappingEnabled && S.snapToEdges,
    snapVertex: S.snappingEnabled && S.snapToVertices,
    snapMiddle: S.snappingEnabled && S.snapToMidpoints,
    allowSelfIntersection: false
  });
}

export function toggleSnappingMode() {
  setSnappingEnabled(!S.snappingEnabled);
  showToast(`Magnetic Snapping: ${S.snappingEnabled ? 'ON (connects to edges & corners)' : 'OFF'}`);
}

export function setSnappingEnabled(val) {
  S.snappingEnabled = !!val;
  try {
    localStorage.setItem('gjs_snapping_enabled', S.snappingEnabled ? '1' : '0');
  } catch (e) {}
  updateSnappingUI();
  applySnappingOptionsToMap();
  if (!S.snappingEnabled) hideSnapIndicator();
}

export function setSnapEdges(val) {
  S.snapToEdges = !!val;
  try {
    localStorage.setItem('gjs_snap_edges', S.snapToEdges ? '1' : '0');
  } catch (e) {}
  applySnappingOptionsToMap();
  showToast(`Edge snapping: ${S.snapToEdges ? 'ON' : 'OFF'}`);
}

export function setSnapVertices(val) {
  S.snapToVertices = !!val;
  try {
    localStorage.setItem('gjs_snap_vertices', S.snapToVertices ? '1' : '0');
  } catch (e) {}
  applySnappingOptionsToMap();
  showToast(`Vertex snapping: ${S.snapToVertices ? 'ON' : 'OFF'}`);
}

export function setSnapMidpoints(val) {
  S.snapToMidpoints = !!val;
  try {
    localStorage.setItem('gjs_snap_midpoints', S.snapToMidpoints ? '1' : '0');
  } catch (e) {}
  applySnappingOptionsToMap();
  showToast(`Midpoint snapping: ${S.snapToMidpoints ? 'ON' : 'OFF'}`);
}

export function setSnapDistance(val) {
  S.snappingDistance = parseInt(val, 10) || 25;
  try {
    localStorage.setItem('gjs_snap_distance', String(S.snappingDistance));
  } catch (e) {}
  const valEl = document.getElementById('snap-distance-val');
  if (valEl) valEl.textContent = `${S.snappingDistance} px`;
  applySnappingOptionsToMap();
}

export function showSnapIndicator(latlng, isEdge) {
  if (!S.map || !S.snappingEnabled) return;
  const html = `
        <div class="relative flex items-center justify-center pointer-events-none" style="transform: translate(-50%, -50%);">
          <div class="absolute w-8 h-8 rounded-full border-2 border-emerald-400 bg-emerald-500/25 animate-ping opacity-75"></div>
          <div class="relative w-4 h-4 rounded-full border-2 border-white bg-emerald-400 shadow-md shadow-emerald-500/90 flex items-center justify-center">
            <div class="w-1.5 h-1.5 rounded-full bg-slate-950"></div>
          </div>
          <div class="absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap bg-slate-900/95 backdrop-blur-md border border-emerald-500/80 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md shadow-xl z-50">
            ${isEdge ? '🧲 Snapped to edge' : '🎯 Snapped to vertex'}
          </div>
        </div>
      `;
  if (S.snapIndicatorLayer) {
    S.snapIndicatorLayer.setLatLng(latlng);
    const el = S.snapIndicatorLayer.getElement();
    if (el) el.innerHTML = html;
  } else {
    const snapIcon = L.divIcon({
      className: 'snap-cursor-div',
      html,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
    S.snapIndicatorLayer = L.marker(latlng, {
      icon: snapIcon,
      interactive: false,
      zIndexOffset: 9999
    }).addTo(S.map);
  }
  mobileHaptic(12);
}

export function hideSnapIndicator() {
  if (S.snapIndicatorLayer && S.map) {
    S.map.removeLayer(S.snapIndicatorLayer);
    S.snapIndicatorLayer = null;
  }
}

export function initMapSnappingEvents() {
  if (!S.map) return;
  S.map.on('pm:snap', e => {
    if (!S.snappingEnabled) return;
    const latlng = e.snapLatLng || e.marker && e.marker.getLatLng();
    if (!latlng) return;
    const isEdge = !!(e.segment || e.snapInfo && e.snapInfo.segment);
    showSnapIndicator(latlng, isEdge);
  });
  S.map.on('pm:unsnap', () => {
    hideSnapIndicator();
  });
  S.map.on('pm:drawend', () => {
    hideSnapIndicator();
  });
  S.map.on('pm:create', () => {
    hideSnapIndicator();
  });
}

export function updateSnappingUI() {
  // Desktop header
  const indH = document.getElementById('indicator-snap-header');
  const txtH = document.getElementById('text-snap-header');
  if (indH) indH.className = S.snappingEnabled ? 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400' : 'w-2 h-2 rounded-full bg-slate-500';
  if (txtH) {
    txtH.textContent = S.snappingEnabled ? 'ON' : 'OFF';
    txtH.className = S.snappingEnabled ? 'text-emerald-400' : 'text-slate-400';
  }

  // Mobile top bar
  const btnM = document.getElementById('btn-snap-mobile');
  const indM = document.getElementById('indicator-snap-mobile');
  const txtM = document.getElementById('text-snap-mobile');
  if (btnM) {
    if (S.snappingEnabled) {
      btnM.classList.add('border-emerald-500/80', 'bg-emerald-950/80', 'text-emerald-100');
    } else {
      btnM.classList.remove('border-emerald-500/80', 'bg-emerald-950/80', 'text-emerald-100');
    }
  }
  if (indM) indM.className = S.snappingEnabled ? 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400' : 'w-2 h-2 rounded-full bg-slate-500';
  if (txtM) {
    txtM.textContent = S.snappingEnabled ? 'ON' : 'OFF';
    txtM.className = S.snappingEnabled ? 'text-emerald-300' : 'text-slate-500';
  }

  // Drawer controls
  const stateEl = document.getElementById('snap-global-state');
  if (stateEl) {
    stateEl.textContent = S.snappingEnabled ? 'ON' : 'OFF';
    stateEl.className = S.snappingEnabled ? 'text-[10px] font-bold text-emerald-400' : 'text-[10px] font-bold text-slate-400';
  }
  const chkMain = document.getElementById('snap-enabled-toggle');
  if (chkMain) chkMain.checked = S.snappingEnabled;
  const chkEdges = document.getElementById('snap-edges-toggle');
  if (chkEdges) chkEdges.checked = S.snapToEdges;
  const chkVerts = document.getElementById('snap-vertices-toggle');
  if (chkVerts) chkVerts.checked = S.snapToVertices;
  const chkMids = document.getElementById('snap-midpoints-toggle');
  if (chkMids) chkMids.checked = S.snapToMidpoints;
  const slider = document.getElementById('snap-distance-slider');
  if (slider) slider.value = S.snappingDistance;
  const distVal = document.getElementById('snap-distance-val');
  if (distVal) distVal.textContent = `${S.snappingDistance} px`;
}

// ================= DRAW TOOLS =================

if (typeof window !== 'undefined') {
  window.setGuiTheme = setGuiTheme;
  window.setGuiLayout = setGuiLayout;
  window.setTextSize = setTextSize;
  window.initGuiSettings = initGuiSettings;
  window.toggleLatLngGrid = toggleLatLngGrid;
  window.toggleDrawingPointLabels = toggleDrawingPointLabels;
  window.toggleSnappingMode = toggleSnappingMode;
  window.setSnappingEnabled = setSnappingEnabled;
  window.setSnapEdges = setSnapEdges;
  window.setSnapVertices = setSnapVertices;
  window.setSnapMidpoints = setSnapMidpoints;
  window.setSnapDistance = setSnapDistance;
}
