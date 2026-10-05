// Split out of the original single-file engine (see legacy/index.html).
// Origin: UI HELPERS

import { S } from './state.js';
import { announce } from './history.js';
import { updateMobileSelectionBar, updateStatsNow } from './quickTools.js';

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

// ================= MAP LEGEND (floating panel) =================
export function toggleMapLegend() {
  let el = document.getElementById('map-legend-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'map-legend-container';
    el.className = 'fixed bottom-4 right-4 z-20 w-[280px] bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/60 overflow-hidden';
    el.innerHTML = `
      <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800">
        <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5"><i data-lucide="layers-3" class="w-3.5 h-3.5 text-emerald-400"></i> Map Legend</span>
        <button onclick="document.getElementById('map-legend-container').classList.add('collapsed')" class="p-1 text-slate-400 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div id="legend-body" class="p-3.5 space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
        <div class="text-[11px] text-slate-400">No shapes yet — draw a polygon to see it here.</div>
      </div>
    `;
    document.body.appendChild(el);
    // hydrate icons inside
    try { window.lucide && window.lucide.createIcons({ root: el }); } catch (e) {}
    // initial collapsed state? start collapsed
    el.classList.add('collapsed');
  }
  const collapsed = el.classList.toggle('collapsed');
  // also toggle badge highlight
  const badge = document.getElementById('badge-legend-count-header');
  if (badge) badge.classList.toggle('text-emerald-300', !collapsed);
  if (!collapsed) {
    // refresh legend content from current shapes
    try {
      const body = document.getElementById('legend-body');
      if (body && S.drawnItems) {
        const layers = S.drawnItems.getLayers ? S.drawnItems.getLayers() : [];
        if (layers.length === 0) {
          body.innerHTML = '<div class="text-[11px] text-slate-400">No shapes yet — draw a polygon to see it here.</div>';
        } else {
          body.innerHTML = layers.map((l, i) => {
            const color = l.options && l.options.fillColor ? l.options.fillColor : '#10b981';
            const name = (l.feature && l.feature.properties && l.feature.properties.name) ? l.feature.properties.name : `Shape ${i + 1}`;
            const type = l.feature && l.feature.geometry ? l.feature.geometry.type : 'Shape';
            return `<div class="flex items-center gap-2 p-2 rounded-xl bg-slate-800/80 border border-slate-700/40">
              <span class="w-3 h-3 rounded-full shrink-0" style="background:${color}"></span>
              <span class="text-xs font-medium text-slate-200 truncate">${name}</span>
              <span class="ml-auto text-[10px] font-mono text-slate-500">${type}</span>
            </div>`;
          }).join('');
        }
        // update badge count
        const countEl = document.getElementById('badge-legend-count-header');
        if (countEl) countEl.textContent = String(layers.length);
      }
    } catch (e) {}
    showToast('Map legend opened');
  } else {
    showToast('Map legend closed');
  }
}

// ================= AUTH & COMMUNITY PLACEHOLDERS =================
let _authUser = null;

export function openAuthModal() {
  // Minimal auth placeholder — toggles a fake signed-in state stored in localStorage
  const existing = document.getElementById('auth-modal');
  if (existing) {
    existing.remove();
    return;
  }
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <h3 class="text-sm font-bold text-white flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-sky-400"></i> Sign in</h3>
        <button class="p-1 text-slate-400 hover:text-white" onclick="document.getElementById('auth-modal').remove()"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="p-5 space-y-3">
        <button id="btn-google-signin" class="w-full py-2.5 rounded-xl bg-white text-slate-900 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-100">
          <span class="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 via-red-500 to-yellow-400"></span> Continue with Google
        </button>
        <button id="btn-discord-signin" class="w-full py-2.5 rounded-xl bg-[#5865F2] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#4752c4]">
          <i data-lucide="message-circle" class="w-4 h-4"></i> Continue with Discord
        </button>
        <p class="text-[10px] text-slate-500 text-center">Demo only — no real auth is performed.</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  try { window.lucide && window.lucide.createIcons({ root: modal }); } catch (e) {}
  const setUser = (name) => {
    _authUser = { name };
    try { localStorage.setItem('demo_auth_user', JSON.stringify(_authUser)); } catch (e) {}
    const label = document.getElementById('text-auth-user');
    if (label) label.textContent = name;
    const mobileLabel = document.getElementById('text-auth-user'); // same id used in both headers for now
    showToast(`Signed in as ${name} (demo)`);
    modal.remove();
  };
  modal.querySelector('#btn-google-signin')?.addEventListener('click', () => setUser('Demo User'));
  modal.querySelector('#btn-discord-signin')?.addEventListener('click', () => setUser('Discord Demo'));
  // restore from storage on load
  try {
    const saved = JSON.parse(localStorage.getItem('demo_auth_user') || 'null');
    if (saved && saved.name) {
      _authUser = saved;
      const label = document.getElementById('text-auth-user');
      if (label) label.textContent = saved.name;
    }
  } catch (e) {}
}

export function openUploadCreationModal() {
  const existing = document.getElementById('upload-modal');
  if (existing) { existing.remove(); return; }
  const modal = document.createElement('div');
  modal.id = 'upload-modal';
  modal.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <h3 class="text-sm font-bold text-white flex items-center gap-2"><i data-lucide="cloud-upload" class="w-4 h-4 text-emerald-400"></i> Publish creation</h3>
        <button class="p-1 text-slate-400 hover:text-white" onclick="document.getElementById('upload-modal').remove()"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div class="p-5 space-y-3">
        <label class="block text-xs font-bold text-slate-300">Creation name</label>
        <input id="upload-name" placeholder="e.g. My archipelago" class="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
        <label class="block text-xs font-bold text-slate-300">Preview</label>
        <div id="upload-preview" class="w-full h-32 bg-slate-800 border border-slate-700 rounded-xl grid place-items-center text-slate-500 text-xs">No preview — export PNG first</div>
        <button id="btn-do-upload" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Publish (demo)</button>
        <p class="text-[10px] text-slate-500 text-center">Demo only — creations stay in your browser.</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  try { window.lucide && window.lucide.createIcons({ root: modal }); } catch (e) {}
  // try to copy map canvas as preview if available
  try {
    const canvas = document.querySelector('#map canvas');
    const preview = modal.querySelector('#upload-preview');
    if (canvas && preview) {
      const img = document.createElement('img');
      img.src = canvas.toDataURL();
      img.className = 'w-full h-full object-cover rounded-xl';
      preview.innerHTML = '';
      preview.appendChild(img);
    }
  } catch (e) {}
  modal.querySelector('#btn-do-upload')?.addEventListener('click', () => {
    const name = modal.querySelector('#upload-name')?.value?.trim() || 'Untitled';
    // bump badge
    const badge = document.getElementById('badge-creations-count-header');
    if (badge) badge.textContent = String((parseInt(badge.textContent || '0', 10) + 1));
    showToast(`Published "${name}" (demo — not uploaded)`);
    modal.remove();
  });
}

// ================= INTERACTIVE TUTORIAL =================
