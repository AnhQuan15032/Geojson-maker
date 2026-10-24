// Split out of the original single-file engine (see legacy/index.html).
// Origin: UI HELPERS

import { S } from './state.js';
import { announce } from './history.js';
import { updateMobileSelectionBar, updateStatsNow } from './quickTools.js';

/**
 * End the running Geoman draw session whatever shape it is. Geoman's own
 * `disableDraw()` only stops the Polygon tool unless told the shape, so a
 * Line / Rectangle / Marker session (or a split blade) would carry on.
 * Returns true when a session was stopped.
 */
export function endDrawSession() {
  const pm = S.map && S.map.pm;
  if (!pm || !pm.globalDrawModeEnabled || !pm.globalDrawModeEnabled()) return false;
  const shape = pm.Draw && typeof pm.Draw.getActiveShape === 'function' ? pm.Draw.getActiveShape() : null;
  if (shape) pm.disableDraw(shape);
  else if (pm.Draw && typeof pm.Draw.disable === 'function') pm.Draw.disable();
  else pm.disableDraw();
  return true;
}

// ================= UI HELPERS =================
export function isMobileAppUI() {
  return window.matchMedia('(max-width: 1023px)').matches;
}

export function mobileHaptic(pattern) {
  if (!isMobileAppUI() || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern || 8);
  } catch (e) {}
}

export function updateMobileDock(openId) {
  document.querySelectorAll('#mobile-nav [data-drawer]').forEach(btn => {
    btn.classList.toggle('is-active', btn.getAttribute('data-drawer') === openId);
  });
}

export function setMobileSheetState(openId) {
  if (!isMobileAppUI()) return;
  document.body.classList.toggle('sheet-open', !!openId);
  updateMobileDock(openId);
  // Leaflet needs a frame to recompute gesture space after sheets move.
  setTimeout(() => {
    if (S.map) S.map.invalidateSize({
      pan: false
    });
  }, 340);
}

export function initMobileAppShell() {
  // Keyboard-safe dock/sheets via the Visual Viewport API.
  if (window.visualViewport) {
    const syncViewport = () => {
      const keyboard = window.visualViewport.height < window.innerHeight * 0.74;
      document.body.classList.toggle('keyboard-open', keyboard);
      if (S.map) requestAnimationFrame(() => S.map.invalidateSize({
        pan: false
      }));
    };
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }

  // Drag the sticky sheet header down to close (portrait mobile).
  document.querySelectorAll('.sheet-drawer').forEach(drawer => {
    const gripZone = drawer.firstElementChild;
    if (!gripZone) return;
    let startY = 0;
    let lastY = 0;
    let startTime = 0;
    let dragging = false;
    gripZone.addEventListener('pointerdown', e => {
      if (!isMobileAppUI() || window.matchMedia('(orientation: landscape) and (max-height: 540px)').matches) return;
      if (!drawer.classList.contains('open') || drawer.scrollTop > 2) return;
      if (e.target.closest('button, input, select, textarea, a')) return;
      startY = lastY = e.clientY;
      startTime = performance.now();
      dragging = true;
      drawer.classList.add('dragging');
      try {
        gripZone.setPointerCapture(e.pointerId);
      } catch (err) {}
    });
    gripZone.addEventListener('pointermove', e => {
      if (!dragging) return;
      lastY = e.clientY;
      const dy = Math.max(0, lastY - startY);
      drawer.style.transform = `translateY(${dy}px)`;
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      drawer.classList.remove('dragging');
      const dy = Math.max(0, lastY - startY);
      const velocity = dy / Math.max(1, performance.now() - startTime);
      drawer.style.transform = '';
      if (dy > 105 || velocity > 0.72) closeDrawers();
    };
    gripZone.addEventListener('pointerup', finish);
    gripZone.addEventListener('pointercancel', finish);
  });

  // Orientation transitions should never leave an inline drag transform.
  window.addEventListener('orientationchange', () => {
    document.querySelectorAll('.sheet-drawer').forEach(d => {
      d.style.transform = '';
      d.classList.remove('dragging');
    });
    setTimeout(() => {
      if (S.map) S.map.invalidateSize({
        pan: false
      });
    }, 280);
  });
  updateMobileSelectionBar();
  updateMobileDock(null);
}

export function toggleDrawer(id) {
  const drawer = document.getElementById(id);
  if (!drawer) {
    showToast(`Coming soon: ${id}`);
    return;
  }
  const isOpen = drawer.classList.contains('open');
  closeDrawers();
  if (!isOpen) {
    mobileHaptic(7);
    drawer.classList.add('open');
    drawer.scrollTop = 0;
    setMobileSheetState(id);
    // Panels that display live data get a fresh (synchronous) stats pass
    if (id === 'export-drawer') updateStatsNow();
  }
}

export function closeDrawers() {
  document.querySelectorAll('.sheet-drawer').forEach(d => {
    d.classList.remove('open', 'dragging');
    d.style.transform = '';
  });
  setMobileSheetState(null);
}

export function showToast(msg) {
  announce(msg);
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('opacity-0', '-translate-y-2');
  toast.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', '-translate-y-2');
  }, 2200);
}

// Legends removed — Map Legend feature deleted
export function toggleMapLegend(){ /* removed */ }

// Auth removed — logins demo deleted
let _authUser = null;
export function refreshAuthUI(user){ _authUser = user || null; }
async function fetchMeAndRefresh(){ return null; }
export async function openAuthModal(){ showToast('Logins removed'); }

export function openUploadCreationModal() {
  // Storage deleted — Upload now just opens a file picker and adds GeoJSON directly to the map
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.geojson,.json,application/geo+json,application/json';
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { importGeoJSONFile } = await import('./geojsonLoader.js');
      await importGeoJSONFile(file);
      showToast(`Loaded “${file.name}”`);
    } catch (err) {
      showToast('Load failed: ' + (err.message||'invalid GeoJSON'));
    }
  };
  input.click();
}
// ==

// ================= INTERACTIVE TUTORIAL =================
