// Split out of the original single-file engine (see legacy/index.html).
// Origin: REGION STYLE INSPECTOR

import L from 'leaflet';
import { S } from './state.js';
import { setupLayerProperties } from './colors.js';
import { CURVE_DEFAULT_AMOUNT, PREVIEW_COLOR, curveStore } from './constants.js';
import { exitCurveEdgeMode, updateCurveButtons, updateCurveStatusUI } from './curves.js';
import { getLastDrawnPolygon } from './merge.js';
import { updateMobileSelectionBar, updateStats } from './quickTools.js';
import { toggleDrawer } from './uiHelpers.js';

// ================= REGION STYLE INSPECTOR =================
export function openStyleDrawerForActive() {
  if (!S.activeSelectedLayer) {
    S.activeSelectedLayer = getLastDrawnPolygon();
  }
  populateStyleDrawer(S.activeSelectedLayer);
  toggleDrawer('style-drawer');
}

export function populateStyleDrawer(layer) {
  const noSel = document.getElementById('no-region-selected');
  const controls = document.getElementById('style-editor-controls');
  if (!layer) {
    noSel.classList.remove('hidden');
    controls.classList.add('hidden');
    updateMobileSelectionBar();
    return;
  }
  noSel.classList.add('hidden');
  controls.classList.remove('hidden');
  const props = layer.feature && layer.feature.properties || {};
  const opts = layer.options || {};
  const nameVal = props.name || `Region`;
  const fillVal = opts.fillColor || props.fill || opts.color || PREVIEW_COLOR;
  document.getElementById('style-prop-name').value = nameVal;
  document.getElementById('style-fill-color').value = rgbToHex(fillVal);
  document.getElementById('style-fill-color-val').textContent = fillVal;

  // ---- Curved edges panel (polygons only) ----
  const isPolygonLayer = layer instanceof L.Polygon;
  if (S.curveMode && (!isPolygonLayer || S.curveModeLayer !== layer)) exitCurveEdgeMode();
  const curvePanel = document.getElementById('curve-panel');
  if (curvePanel) {
    curvePanel.classList.toggle('hidden', !isPolygonLayer);
    if (isPolygonLayer) {
      const st = curveStore.get(layer);
      const amt = st ? st.amount : CURVE_DEFAULT_AMOUNT;
      const slider = document.getElementById('curve-amount');
      if (slider) slider.value = Math.round(amt * 100);
      const amtLbl = document.getElementById('curve-amount-val');
      if (amtLbl) amtLbl.textContent = `${Math.round(amt * 100)}%`;
      updateCurveStatusUI(layer);
      updateCurveButtons();
    }
  }
  updateMobileSelectionBar();
}

export function updateActiveStyle(property, value) {
  if (!S.activeSelectedLayer || property !== 'fillColor') return;
  const isLine = S.activeSelectedLayer instanceof L.Polyline && !(S.activeSelectedLayer instanceof L.Polygon);
  if (typeof S.activeSelectedLayer.setStyle === 'function') {
    S.activeSelectedLayer.setStyle(isLine ? {
      color: value
    } : {
      fillColor: value,
      color: value
    });
  }
  if (!S.activeSelectedLayer.feature) setupLayerProperties(S.activeSelectedLayer);
  S.activeSelectedLayer.feature.properties.fill = value;
  if (isLine) S.activeSelectedLayer.feature.properties.stroke = value;
  document.getElementById('style-fill-color-val').textContent = value;
  updateStats();
}

export function updateActiveFeatureProp(key, val) {
  if (!S.activeSelectedLayer) return;
  if (!S.activeSelectedLayer.feature) setupLayerProperties(S.activeSelectedLayer);
  S.activeSelectedLayer.feature.properties[key] = val;
  updateStats();
}

export function rgbToHex(col) {
  if (!col) return '#10b981';
  if (String(col).startsWith('#')) return col;
  return '#10b981';
}

// ================= GEOJSON LOADER =================
