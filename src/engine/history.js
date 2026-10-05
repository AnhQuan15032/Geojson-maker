// Split out of the original single-file engine (see legacy/index.html).
// Origin: UNDO / REDO HISTORY

import L from 'leaflet';
import { S } from './state.js';
import { countCoords } from '../lib/util.js';
import { setupLayerProperties } from './colors.js';
import { HISTORY_LIMIT, HISTORY_MAX_FEATURES, PREVIEW_COLOR, curveStore } from './constants.js';
import { renderCountryResults } from './countries.js';
import { exitCurveEdgeMode } from './curves.js';
import { onFeatureClick } from './exporters/geojson.js';
import { updateCountriesUI } from './merge.js';
import { updateStats } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { mobileHaptic, showToast } from './uiHelpers.js';

export function announce(msg) {
  const el = document.getElementById('a11y-live');
  if (el) el.textContent = msg;
}

export function captureHistory(data) {
  if (S.historyRestoring) return;
  const feats = data && data.features || [];
  if (feats.length > HISTORY_MAX_FEATURES) return;

  // Cheap signature avoids storing duplicate states
  let sig = feats.length + ':';
  for (let i = 0; i < feats.length; i++) {
    const p = feats[i].properties || {};
    sig += (p.name || '') + (p.fill || '') + countCoords(feats[i].geometry ? feats[i].geometry.coordinates : []) + '|';
  }
  if (sig === S.lastHistorySignature) return;
  S.lastHistorySignature = sig;
  const snap = JSON.stringify(data);
  if (S.historyIndex < S.historyStack.length - 1) S.historyStack = S.historyStack.slice(0, S.historyIndex + 1);
  S.historyStack.push(snap);
  if (S.historyStack.length > HISTORY_LIMIT) S.historyStack.shift();
  S.historyIndex = S.historyStack.length - 1;
  updateHistoryButtons();
}

export function updateHistoryButtons() {
  const canUndo = S.historyIndex > 0;
  const canRedo = S.historyIndex >= 0 && S.historyIndex < S.historyStack.length - 1;
  ['btn-undo', 'btn-undo-mobile'].forEach(id => {
    const b = document.getElementById(id);
    if (b) {
      b.disabled = !canUndo;
      b.setAttribute('aria-disabled', String(!canUndo));
    }
  });
  ['btn-redo', 'btn-redo-mobile'].forEach(id => {
    const b = document.getElementById(id);
    if (b) {
      b.disabled = !canRedo;
      b.setAttribute('aria-disabled', String(!canRedo));
    }
  });
}

export function restoreHistoryState(snap) {
  S.historyRestoring = true;
  try {
    const data = JSON.parse(snap);
    S.drawnItems.clearLayers();
    S.countryLayers = [];
    S.countryLayerById = {};
    S.mergeSelection = [];
    curveStore.clear();
    if (S.curveMode) exitCurveEdgeMode();
    S.activeSelectedLayer = null;
    L.geoJSON(data, {
      style: f => {
        const p = f && f.properties || {};
        const c = p.fill || PREVIEW_COLOR;
        const isLine = f && f.geometry && String(f.geometry.type).includes('Line');
        return isLine ? {
          color: p.stroke || c,
          weight: p['stroke-width'] || 3,
          opacity: 1,
          fillOpacity: 0,
          smoothFactor: 2
        } : {
          color: c,
          fillColor: c,
          fillOpacity: 1,
          weight: 0,
          dashArray: null,
          smoothFactor: 2
        };
      },
      onEachFeature: (f, layer) => {
        setupLayerProperties(layer);
        if (f.properties) layer.feature.properties = {
          ...f.properties
        };
        layer.on('click', () => {
          S.activeSelectedLayer = layer;
          populateStyleDrawer(layer);
          onFeatureClick(layer);
        });
        S.drawnItems.addLayer(layer);
      }
    });
    populateStyleDrawer(null);
    S.lastHistorySignature = '';
    updateStats();
    updateCountriesUI();
    renderCountryResults();
  } catch (e) {
    console.warn('History restore failed:', e);
  } finally {
    setTimeout(() => {
      S.historyRestoring = false;
    }, 60);
  }
}

export function undoHistory() {
  if (S.historyIndex <= 0) {
    showToast('Nothing to undo');
    return;
  }
  S.historyIndex--;
  restoreHistoryState(S.historyStack[S.historyIndex]);
  updateHistoryButtons();
  mobileHaptic(6);
  showToast('Undo');
  announce('Undo applied');
}

export function redoHistory() {
  if (S.historyIndex >= S.historyStack.length - 1) {
    showToast('Nothing to redo');
    return;
  }
  S.historyIndex++;
  restoreHistoryState(S.historyStack[S.historyIndex]);
  updateHistoryButtons();
  mobileHaptic(6);
  showToast('Redo');
  announce('Redo applied');
}

// ================= QUICK TOOLS =================
