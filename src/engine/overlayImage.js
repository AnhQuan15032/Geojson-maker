// Split out of the original single-file engine (see legacy/index.html).
// Origin: REFERENCE IMAGE ENGINE

import L from 'leaflet';
import * as lucide from '../lib/icons.js';
import { S } from './state.js';
import { OVERLAY_REF_ZOOM } from './constants.js';
import { cancelSeaPick, hideSeaPickHint } from './seaDetect.js';
import { showToast } from './uiHelpers.js';

// ================= REFERENCE IMAGE ENGINE =================
export function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (event) {
    S.referenceImageRawUrl = event.target.result;
    const imgObj = new Image();
    imgObj.onload = function () {
      S.imageNaturalAspectRatio = imgObj.naturalWidth / imgObj.naturalHeight;
      placeReferenceImage(S.referenceImageRawUrl);
    };
    imgObj.src = S.referenceImageRawUrl;
  };
  reader.readAsDataURL(file);
}

// ---- Projection-locked geometry helpers -------------------------------
// Every size is expressed in pixels at OVERLAY_REF_ZOOM, so the image keeps
// its exact aspect ratio at any latitude, zoom level and pan offset.

// ---- Projection-locked geometry helpers -------------------------------
// Every size is expressed in pixels at OVERLAY_REF_ZOOM, so the image keeps
// its exact aspect ratio at any latitude, zoom level and pan offset.
export function overlayProjectedBounds() {
  const c = S.map.project(S.imageCenter, OVERLAY_REF_ZOOM);
  const nw = S.map.unproject(c.subtract([S.overlayPxW / 2, S.overlayPxH / 2]), OVERLAY_REF_ZOOM);
  const se = S.map.unproject(c.add([S.overlayPxW / 2, S.overlayPxH / 2]), OVERLAY_REF_ZOOM);
  return L.latLngBounds(se, nw);
}

export function overlayCornerLatLng() {
  const c = S.map.project(S.imageCenter, OVERLAY_REF_ZOOM);
  return S.map.unproject(c.add([S.overlayPxW / 2, S.overlayPxH / 2]), OVERLAY_REF_ZOOM);
}

export function viewportPixelSize(zoom, fillRatio) {
  const size = S.map.getSize();
  const f = Math.pow(2, OVERLAY_REF_ZOOM - zoom);
  return L.point(size.x * fillRatio * f, size.y * fillRatio * f);
}

export function containFit(boxW, boxH, ratio) {
  let w = boxW;
  let h = w / ratio;
  if (h > boxH) {
    h = boxH;
    w = h * ratio;
  }
  return L.point(Math.max(w, 20), Math.max(h, 20));
}

export function coverFit(boxW, boxH, ratio) {
  let w = boxW;
  let h = w / ratio;
  if (h < boxH) {
    h = boxH;
    w = h * ratio;
  }
  return L.point(Math.max(w, 20), Math.max(h, 20));
}

export function commitOverlayPlacement(center, fit, msg) {
  S.imageCenter = center;
  S.overlayBasePxW = fit.x;
  S.overlayBasePxH = fit.y;
  S.scaleW = 1.0;
  S.scaleH = 1.0;
  S.overlayPxW = fit.x;
  S.overlayPxH = fit.y;
  refreshImageDisplay();
  syncScaleUI();
  if (msg) showToast(msg);
}

export function syncScaleUI() {
  const pct = Math.round(Math.max(S.scaleW, S.scaleH) * 100);
  const slider = document.getElementById('image-scale-slider');
  if (slider) slider.value = Math.min(Math.max(pct, 10), 400);
  const lbl = document.getElementById('scale-val');
  if (lbl) lbl.textContent = `${pct}%`;
}

// ---- Auto Place -------------------------------------------------------

// ---- Auto Place -------------------------------------------------------
export function autoPlaceOverlay(mode) {
  if (!S.referenceImageLayer || !S.imageCenter) {
    showToast("Upload a reference image first");
    return;
  }
  if (mode === 'shapes') {
    if (S.drawnItems.getLayers().length === 0) {
      showToast("Draw a shape first, then auto place onto it");
      return;
    }
    const b = S.drawnItems.getBounds();
    const nw = S.map.project(b.getNorthWest(), OVERLAY_REF_ZOOM);
    const se = S.map.project(b.getSouthEast(), OVERLAY_REF_ZOOM);
    const fit = containFit(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y), S.imageNaturalAspectRatio);
    const center = S.map.unproject(L.point((nw.x + se.x) / 2, (nw.y + se.y) / 2), OVERLAY_REF_ZOOM);
    commitOverlayPlacement(center, fit, "Overlay fitted onto your shapes");
    return;
  }
  if (mode === 'cover') {
    const viewPx = viewportPixelSize(S.map.getZoom(), 1.02);
    const fit = coverFit(viewPx.x, viewPx.y, S.imageNaturalAspectRatio);
    commitOverlayPlacement(S.map.getCenter(), fit, "Overlay covering the current view");
    return;
  }
  const viewPx = viewportPixelSize(S.map.getZoom(), 0.8);
  const fit = containFit(viewPx.x, viewPx.y, S.imageNaturalAspectRatio);
  commitOverlayPlacement(S.map.getCenter(), fit, "Overlay fitted to the view");
}

export function placeReferenceImage(url) {
  if (S.referenceImageLayer) {
    S.map.removeLayer(S.referenceImageLayer);
    S.referenceImageLayer = null;
  }
  clearImageHandles();

  // Auto place immediately: contain-fit inside the current viewport
  const viewPx = viewportPixelSize(S.map.getZoom(), 0.8);
  const fit = containFit(viewPx.x, viewPx.y, S.imageNaturalAspectRatio);
  S.imageCenter = S.map.getCenter();
  S.overlayBasePxW = fit.x;
  S.overlayBasePxH = fit.y;
  S.scaleW = 1.0;
  S.scaleH = 1.0;
  S.overlayPxW = fit.x;
  S.overlayPxH = fit.y;
  S.referenceImageLayer = L.imageOverlay(url, overlayProjectedBounds(), {
    opacity: 0.7,
    interactive: false,
    zIndex: 350
  }).addTo(S.map);
  createImageControlHandles();
  document.getElementById('image-controls').classList.remove('hidden');
  syncScaleUI();
  showToast("Overlay auto-placed — true aspect ratio locked");
}

export function refreshImageDisplay() {
  if (!S.referenceImageLayer || !S.imageCenter) return;
  S.referenceImageLayer.setBounds(overlayProjectedBounds());
  if (S.centerMoveMarker) S.centerMoveMarker.setLatLng(S.imageCenter);
  if (S.cornerResizeMarker) S.cornerResizeMarker.setLatLng(overlayCornerLatLng());
}

export function createImageControlHandles() {
  clearImageHandles();
  S.centerMoveMarker = L.marker(S.imageCenter, {
    draggable: true,
    zIndexOffset: 1000,
    icon: L.divIcon({
      className: 'move-pin',
      html: `<div class="flex items-center gap-1 bg-cyan-500 text-slate-950 px-2 py-1 rounded-full shadow-2xl border-2 border-white text-[10px] font-black cursor-move select-none"><i data-lucide="move" class="w-3 h-3"></i> MOVE</div>`,
      iconSize: [60, 24],
      iconAnchor: [30, 12]
    })
  }).addTo(S.map);
  S.centerMoveMarker.on('drag', e => {
    S.imageCenter = e.target.getLatLng();
    refreshImageDisplay();
  });
  S.cornerResizeMarker = L.marker(overlayCornerLatLng(), {
    draggable: true,
    zIndexOffset: 1000,
    icon: L.divIcon({
      className: 'scale-pin',
      html: `<div class="flex items-center gap-1 bg-amber-400 text-slate-950 px-2 py-1 rounded-full shadow-2xl border-2 border-white text-[10px] font-black cursor-se-resize select-none"><i data-lucide="maximize-2" class="w-3 h-3"></i> SCALE</div>`,
      iconSize: [65, 24],
      iconAnchor: [32, 12]
    })
  }).addTo(S.map);
  S.cornerResizeMarker.on('drag', e => {
    // Measure in projected pixels → the image can never be distorted
    const c = S.map.project(S.imageCenter, OVERLAY_REF_ZOOM);
    const cp = S.map.project(e.target.getLatLng(), OVERLAY_REF_ZOOM);
    const newW = Math.max(Math.abs(cp.x - c.x) * 2, 20);
    const newH = Math.max(Math.abs(cp.y - c.y) * 2, 20);
    const clamp = v => Math.min(Math.max(v, 0.1), 4);
    if (S.keepAspectRatioLocked) {
      const m = clamp(Math.max(newW / S.overlayBasePxW, newH / S.overlayBasePxH));
      S.scaleW = m;
      S.scaleH = m;
    } else {
      S.scaleW = clamp(newW / S.overlayBasePxW);
      S.scaleH = clamp(newH / S.overlayBasePxH);
    }
    S.overlayPxW = S.overlayBasePxW * S.scaleW;
    S.overlayPxH = S.overlayBasePxH * S.scaleH;
    syncScaleUI();
    refreshImageDisplay();
  });
  lucide.createIcons();
}

// ---- Custom nudge step -------------------------------------------------

// ---- Custom nudge step -------------------------------------------------
export function loadNudgeConfig() {
  try {
    const s = JSON.parse(localStorage.getItem('overlay_nudge') || 'null');
    if (s) {
      S.nudgeAmount = +s.amount || 8;
      S.nudgeUnit = s.unit || 'percent';
      S.nudgeKeysEnabled = s.keys !== false;
    }
  } catch (e) {}
  const a = document.getElementById('nudge-amount');
  const u = document.getElementById('nudge-unit');
  const k = document.getElementById('nudge-keys');
  if (a) a.value = S.nudgeAmount;
  if (u) u.value = S.nudgeUnit;
  if (k) k.checked = S.nudgeKeysEnabled;
  updateNudgeStepLabel();
}

export function saveNudgeConfig() {
  const a = document.getElementById('nudge-amount');
  const u = document.getElementById('nudge-unit');
  const k = document.getElementById('nudge-keys');
  S.nudgeAmount = Math.min(Math.max(parseFloat(a.value) || 8, 0.1), 10000);
  S.nudgeUnit = u.value;
  S.nudgeKeysEnabled = k.checked;
  try {
    localStorage.setItem('overlay_nudge', JSON.stringify({
      amount: S.nudgeAmount,
      unit: S.nudgeUnit,
      keys: S.nudgeKeysEnabled
    }));
  } catch (e) {}
  updateNudgeStepLabel();
}

export function updateNudgeStepLabel() {
  const el = document.getElementById('nudge-step-label');
  if (!el) return;
  const unitTxt = S.nudgeUnit === 'percent' ? `${S.nudgeAmount}% of size` : S.nudgeUnit === 'px' ? `${S.nudgeAmount} px` : `${S.nudgeAmount} km`;
  el.textContent = `step: ${unitTxt}`;
}

// Converts the configured step into reference-zoom pixels for one axis

// Converts the configured step into reference-zoom pixels for one axis
export function nudgeStepRefPx(axis) {
  const span = axis === 'x' ? S.overlayPxW : S.overlayPxH;
  if (S.nudgeUnit === 'percent') return span * (S.nudgeAmount / 100);
  if (S.nudgeUnit === 'px') {
    // Screen pixels: convert through the current zoom level
    return S.nudgeAmount * Math.pow(2, OVERLAY_REF_ZOOM - S.map.getZoom());
  }
  // Kilometers: Mercator metres-per-pixel at the overlay's latitude
  const mpp = 40075016.686 * Math.cos(S.imageCenter.lat * Math.PI / 180) / (256 * Math.pow(2, OVERLAY_REF_ZOOM));
  return S.nudgeAmount * 1000 / Math.max(mpp, 1e-9);
}

export function nudgeImage(dLatDir, dLngDir, mult) {
  if (!S.imageCenter) return;
  const k = mult || 1;
  const c = S.map.project(S.imageCenter, OVERLAY_REF_ZOOM);
  const dx = nudgeStepRefPx('x') * dLngDir * k;
  const dy = nudgeStepRefPx('y') * dLatDir * k; // +lat = up in screen space
  S.imageCenter = S.map.unproject(c.add([dx, -dy]), OVERLAY_REF_ZOOM);
  refreshImageDisplay();
}

export function recenterImageToMap() {
  if (!S.referenceImageLayer) return;
  S.imageCenter = S.map.getCenter();
  refreshImageDisplay();
  showToast("Image centered");
}

export function applyScaleSlider(val) {
  const m = val / 100;
  S.scaleW = m;
  S.scaleH = m;
  S.overlayPxW = S.overlayBasePxW * S.scaleW;
  S.overlayPxH = S.overlayBasePxH * S.scaleH;
  const lbl = document.getElementById('scale-val');
  if (lbl) lbl.textContent = `${val}%`;
  refreshImageDisplay();
}

export function adjustScaleRelative(delta) {
  let currentVal = parseInt(document.getElementById('image-scale-slider').value, 10);
  currentVal = Math.min(Math.max(currentVal + Math.round(delta * 100), 10), 400);
  document.getElementById('image-scale-slider').value = currentVal;
  applyScaleSlider(currentVal);
}

export function toggleAspectRatioLock(checked) {
  S.keepAspectRatioLocked = checked;
  if (checked && S.imageCenter) {
    // Snap back to the image's true aspect ratio (removes any stretch)
    S.scaleH = S.scaleW;
    S.overlayPxW = S.overlayBasePxW * S.scaleW;
    S.overlayPxH = S.overlayBasePxH * S.scaleH;
    refreshImageDisplay();
    syncScaleUI();
    showToast("Aspect ratio locked — no stretch");
  } else if (!checked) {
    showToast("Free resize enabled");
  }
}

export function setImageOpacity(val) {
  document.getElementById('opacity-val').textContent = `${val}%`;
  if (S.referenceImageLayer) S.referenceImageLayer.setOpacity(val / 100);
}

export function toggleImageHandles() {
  S.areImageHandlesLocked = !S.areImageHandlesLocked;
  const btn = document.getElementById('btn-toggle-handles');
  if (S.areImageHandlesLocked) {
    if (S.centerMoveMarker) S.map.removeLayer(S.centerMoveMarker);
    if (S.cornerResizeMarker) S.map.removeLayer(S.cornerResizeMarker);
    btn.innerHTML = `<i data-lucide="unlock" class="w-3.5 h-3.5"></i> Unlock Handles`;
    showToast("Handles locked");
  } else {
    if (S.centerMoveMarker) S.map.addLayer(S.centerMoveMarker);
    if (S.cornerResizeMarker) S.map.addLayer(S.cornerResizeMarker);
    btn.innerHTML = `<i data-lucide="lock" class="w-3.5 h-3.5"></i> Lock Handles`;
    showToast("Handles unlocked");
  }
  lucide.createIcons();
}

export function removeReferenceImage() {
  cancelSeaPick();
  hideSeaPickHint();
  if (S.referenceImageLayer) {
    S.map.removeLayer(S.referenceImageLayer);
    S.referenceImageLayer = null;
    S.referenceImageRawUrl = null;
  }
  S.overlayPxW = 0;
  S.overlayPxH = 0;
  S.overlayBasePxW = 0;
  S.overlayBasePxH = 0;
  S.imageCenter = null;
  clearImageHandles();
  document.getElementById('image-controls').classList.add('hidden');
  document.getElementById('image-upload-input').value = '';
}

export function clearImageHandles() {
  if (S.centerMoveMarker) {
    S.map.removeLayer(S.centerMoveMarker);
    S.centerMoveMarker = null;
  }
  if (S.cornerResizeMarker) {
    S.map.removeLayer(S.cornerResizeMarker);
    S.cornerResizeMarker = null;
  }
}

// ================= AUTO-GEOREFERENCE ENGINE =================
// 1. Extracts the coastline/border linework from the overlay image (Sobel edges).
// 2. Rasterizes real geographic reference linework (offline world-atlas
//    coastlines + country borders) over the search area.
// 3. Template-matches the two with a truncated chamfer-distance objective
//    over a 4-stage coarse→fine scale, offset and rotation search.
// Everything runs in true Web-Mercator space, so the recovered placement
// is geographically exact and never distorted.
