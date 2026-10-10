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

// ================= AUTH & COMMUNITY (Cloudflare) =================
let _authUser = null;

// formatBytes kept for legacy but not used (storage deleted)
function formatBytes(n) { if (n < 1024) return `${n} B`; if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(2)} MB`; }

export function refreshAuthUI(user) {
  _authUser = user || null;
  const label = document.getElementById('text-auth-user');
  const btn = document.getElementById('btn-auth-header');
  const mobileBtn = document.getElementById('btn-auth-mobile-top');
  const avatarWrapId = 'auth-avatar';
  // try to find existing avatar img, or create
  const setBtn = (b, u) => {
    if (!b) return;
    if (u && u.avatar) {
      b.innerHTML = `<img id="${avatarWrapId}" src="${u.avatar}" alt="${u.name}" class="w-6 h-6 rounded-full object-cover"/> <span class="text-[11px] font-bold text-white hidden sm:inline truncate max-w-[90px]">${u.name}</span>`;
      b.classList.add('bg-slate-800');
    } else if (u) {
      b.innerHTML = `<span class="w-6 h-6 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 grid place-items-center text-[10px] font-bold text-white">${(u.name||'U')[0].toUpperCase()}</span> <span class="text-[11px] font-bold text-white hidden sm:inline">${u.name}</span>`;
    } else {
      b.innerHTML = `<i data-lucide="user" class="w-3.5 h-3.5 text-sky-400"></i> <span id="text-auth-user">Sign In</span>`;
      try { window.lucide && window.lucide.createIcons({ root: b }); } catch {}
    }
  };
  if (user) {
    setBtn(btn, user);
    setBtn(mobileBtn, user);
    if (label) label.textContent = user.name;
  } else {
    setBtn(btn, null);
    setBtn(mobileBtn, null);
  }
  // storage deleted — no meter
}

async function fetchMeAndRefresh() {
  try {
    const saved = JSON.parse(localStorage.getItem('auth_user') || localStorage.getItem('demo_auth_user') || 'null');
    if (saved) { _authUser = saved; refreshAuthUI(saved); return saved; }
  } catch {}
  refreshAuthUI(null);
  return null;
}
// auto-run on load
setTimeout(fetchMeAndRefresh, 300);
if (typeof window !== 'undefined') window.addEventListener('focus', fetchMeAndRefresh);

export async function openAuthModal() {
  const existing = document.getElementById('auth-modal');
  if (existing) { existing.remove(); return; }
  // refresh user first
  const user = await fetchMeAndRefresh();
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm';
  if (user) {
    // logged in view
    modal.innerHTML = `
      <div class="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 class="text-sm font-bold text-white flex items-center gap-2"><img src="${user.avatar||''}" class="w-6 h-6 rounded-full object-cover bg-slate-700" onerror="this.style.display='none'"/><span>${user.name}</span></h3>
          <button class="p-1 text-slate-400 hover:text-white" onclick="document.getElementById('auth-modal').remove()"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <div class="bg-slate-800 rounded-2xl p-3 border border-slate-700/40">
            <div class="text-xs font-bold text-white">${user.name}</div>
            <div class="text-[11px] text-slate-400">${user.email||''} · via ${user.provider}</div>
            <div class="mt-2 text-[11px] text-slate-500">No storage — Discover loads continents offline</div>
          </div>
          <button id="btn-logout" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm">Sign out</button>
          <p class="text-[10px] text-slate-500 text-center">Storage deleted</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.remove(); });
    try { window.lucide && window.lucide.createIcons({ root: modal }); } catch {}
    // no storage meter
    modal.querySelector('#btn-logout')?.addEventListener('click', ()=>{
      localStorage.removeItem('auth_user'); localStorage.removeItem('demo_auth_user');
      _authUser=null; refreshAuthUI(null); showToast('Signed out'); modal.remove();
    });
  } else {
    modal.innerHTML = `
      <div class="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 class="text-sm font-bold text-white flex items-center gap-2"><i data-lucide="message-circle" class="w-4 h-4 text-[#5865F2]"></i> Sign in with Discord</h3>
          <button class="p-1 text-slate-400 hover:text-white" onclick="document.getElementById('auth-modal').remove()"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <button id="btn-discord-signin" class="w-full py-3 rounded-xl bg-[#5865F2] text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-[#4752c4] shadow-lg shadow-violet-900/20">
            <i data-lucide="message-circle" class="w-5 h-5"></i> Continue with Discord
          </button>
          <p class="text-[11px] text-slate-400 text-center leading-relaxed">Secure OAuth — your Discord avatar is saved. <br/><span class="text-slate-500">No Discord? You can still share links as Local User.</span></p>
          <div class="bg-slate-800/80 rounded-xl p-3 border border-slate-700/40">
            <div class="text-[11px] font-bold text-slate-300 flex items-center gap-1.5"><i data-lucide="globe-2" class="w-3.5 h-3.5 text-cyan-400"></i> Load continents</div>
            <p class="text-[11px] text-slate-500 mt-1">Open <b class="text-cyan-300">Discover → Continents</b> to add Africa, Europe, Asia… as editable shapes.</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.remove(); });
    try { window.lucide && window.lucide.createIcons({ root: modal }); } catch {}
    modal.querySelector('#btn-discord-signin')?.addEventListener('click', ()=>{
      const name = prompt('Display name:', 'Explorer');
      if(!name) return;
      const user = { id: `local_${Date.now()}`, provider: 'local', name: name.trim()||'Local User', avatar:'', createdAt: Date.now() };
      try { localStorage.setItem('auth_user', JSON.stringify(user)); } catch {}
      try { localStorage.setItem('demo_auth_user', JSON.stringify(user)); } catch {}
      _authUser=user; refreshAuthUI(user); showToast(`Signed in as ${user.name}`); modal.remove();
    });
  }
}

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
