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

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

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
  // also update storage meter if present
  const meter = document.getElementById('storage-meter-text');
  if (meter && user) {
    // fetch usage async
    import('../lib/cloud.js').then(m => m.getUsage().then(u => {
      meter.textContent = `${formatBytes(u.usage)} / ${formatBytes(u.quota)}`;
      const bar = document.getElementById('storage-meter-bar');
      if (bar) bar.style.width = `${Math.min(100, Math.round(u.usage / u.quota * 100))}%`;
    }).catch(()=>{}));
  }
}

async function fetchMeAndRefresh() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      if (j.user) {
        _authUser = j.user;
        try { localStorage.setItem('auth_user', JSON.stringify(j.user)); } catch {}
        refreshAuthUI(j.user);
        return j.user;
      }
    }
  } catch {}
  // fallback to localStorage
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
            <div class="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><i data-lucide="hard-drive" class="w-3.5 h-3.5"></i> <span id="storage-meter-text">Loading…</span></div>
            <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1"><div id="storage-meter-bar" class="h-full bg-emerald-500" style="width:0%"></div></div>
          </div>
          <button id="btn-logout" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm">Sign out</button>
          <p class="text-[10px] text-slate-500 text-center">Cloudflare KV — 1 MB quota</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.remove(); });
    try { window.lucide && window.lucide.createIcons({ root: modal }); } catch {}
    // load usage
    import('../lib/cloud.js').then(m=>m.getUsage().then(u=>{
      const txt = modal.querySelector('#storage-meter-text');
      if (txt) txt.textContent = `${formatBytes(u.usage)} / ${formatBytes(u.quota)}`;
      const bar = modal.querySelector('#storage-meter-bar');
      if (bar) bar.style.width = `${Math.min(100, Math.round(u.usage/u.quota*100))}%`;
    }).catch(()=>{}));
    modal.querySelector('#btn-logout')?.addEventListener('click', async ()=>{
      try { await fetch('/api/auth/logout', { method:'POST', credentials:'include' }); } catch {}
      localStorage.removeItem('auth_user'); localStorage.removeItem('demo_auth_user');
      _authUser=null; refreshAuthUI(null); showToast('Signed out'); modal.remove();
    });
  } else {
    modal.innerHTML = `
      <div class="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 class="text-sm font-bold text-white flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-sky-400"></i> Sign in</h3>
          <button class="p-1 text-slate-400 hover:text-white" onclick="document.getElementById('auth-modal').remove()"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <button id="btn-google-signin" class="w-full py-2.5 rounded-xl bg-white text-slate-900 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-100">
            <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" class="w-4 h-4" onerror="this.style.display='none'"/><span class="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 via-red-500 to-yellow-400" style="display:none"></span> Continue with Google
          </button>
          <button id="btn-discord-signin" class="w-full py-2.5 rounded-xl bg-[#5865F2] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#4752c4]">
            <i data-lucide="message-circle" class="w-4 h-4"></i> Continue with Discord
          </button>
          <p class="text-[10px] text-slate-500 text-center">Secure OAuth via Cloudflare Worker — avatar is saved</p>
          <p class="text-[10px] text-amber-300 text-center">No credentials configured → demo login (still shows avatar)</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.remove(); });
    try { window.lucide && window.lucide.createIcons({ root: modal }); } catch {}
    modal.querySelector('#btn-google-signin')?.addEventListener('click', ()=>{ location.href='/api/auth/google'; });
    modal.querySelector('#btn-discord-signin')?.addEventListener('click', ()=>{ location.href='/api/auth/discord'; });
  }
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
        <label class="block text-xs font-bold text-slate-300">Upload GeoJSON file <span class="font-normal text-slate-500">(.geojson / .json)</span></label>
        <label class="flex items-center gap-2 w-full bg-slate-800 border border-dashed border-slate-600 rounded-xl px-3 py-3 cursor-pointer hover:border-emerald-500">
          <i data-lucide="file-up" class="w-4 h-4 text-slate-400"></i>
          <span class="text-xs text-slate-300">Choose file or drop here</span>
          <input id="upload-file" type="file" accept=".geojson,.json,application/geo+json,application/json" class="hidden"/>
        </label>
        <div id="upload-file-name" class="text-[11px] text-emerald-400 hidden"></div>
        <label class="block text-xs font-bold text-slate-300">Preview</label>
        <div id="upload-preview" class="w-full h-32 bg-slate-800 border border-slate-700 rounded-xl grid place-items-center text-slate-500 text-xs overflow-hidden">No preview — current map will be used</div>
        <div class="bg-slate-800 rounded-xl p-2.5 border border-slate-700/40 flex items-center justify-between">
          <span class="text-[11px] text-slate-400 flex items-center gap-1.5"><i data-lucide="hard-drive" class="w-3.5 h-3.5"></i> Storage</span>
          <span id="upload-storage" class="text-[11px] font-mono text-slate-400">Loading…</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button id="btn-publish-current" class="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Publish current</button>
          <button id="btn-upload-file-go" class="py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm border border-slate-600">Upload file</button>
        </div>
        <p class="text-[10px] text-slate-500 text-center">Cloudflare KV — max 1 MB per user. Public maps appear in Discover.</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.remove(); });
  try { window.lucide && window.lucide.createIcons({ root: modal }); } catch {}
  let selectedFile = null;
  const fileInput = modal.querySelector('#upload-file');
  const fileNameEl = modal.querySelector('#upload-file-name');
  fileInput?.addEventListener('change', (e)=>{
    selectedFile = e.target.files?.[0]||null;
    if (selectedFile) { fileNameEl.textContent = `${selectedFile.name} — ${formatBytes(selectedFile.size)}`; fileNameEl.classList.remove('hidden'); }
    else fileNameEl.classList.add('hidden');
  });
  // preview from map canvas
  try {
    const canvas = document.querySelector('#map canvas');
    const preview = modal.querySelector('#upload-preview');
    if (canvas && preview) {
      const img = document.createElement('img');
      img.src = canvas.toDataURL();
      img.className = 'w-full h-full object-cover';
      preview.innerHTML = '';
      preview.appendChild(img);
    }
  } catch {}
  // storage meter
  import('../lib/cloud.js').then(m=>m.getUsage().then(u=>{
    const el = modal.querySelector('#upload-storage');
    if (el) el.textContent = `${formatBytes(u.usage)} / ${formatBytes(u.quota)}`;
  }).catch(()=>{ const el=modal.querySelector('#upload-storage'); if(el) el.textContent='—'; }));
  // publish current
  modal.querySelector('#btn-publish-current')?.addEventListener('click', async ()=>{
    const name = modal.querySelector('#upload-name')?.value?.trim() || 'Untitled';
    try {
      const { liveGeoJSONString } = await import('./quickTools.js');
      const gj = JSON.parse(liveGeoJSONString(false));
      if (!gj.features || gj.features.length===0) { showToast('Draw something first'); return; }
      let preview = null;
      try { const canvas=document.querySelector('#map canvas'); if(canvas) preview=canvas.toDataURL('image/png'); } catch {}
      const { publishMap } = await import('../lib/cloud.js');
      await publishMap({ title: name, geojson: gj, isPublic: true, preview });
      const badge=document.getElementById('badge-creations-count-header');
      if(badge) badge.textContent=String((parseInt(badge.textContent||'0',10)+1));
      showToast(`Published “${name}”`);
      modal.remove();
      // refresh discover drawer if open
      const d=document.getElementById('creations-drawer');
      if(d && d.classList.contains('open')) { /* trigger refresh via custom event */ d.dispatchEvent(new CustomEvent('refresh')); }
    } catch(e){
      if(e.data?.error==='QUOTA_EXCEEDED' || e.message==='QUOTA_EXCEEDED') showToast(`Quota exceeded — 1 MB limit`);
      else showToast('Publish failed: '+(e.message||'error'));
    }
  });
  modal.querySelector('#btn-upload-file-go')?.addEventListener('click', async ()=>{
    if(!selectedFile){ showToast('Choose a .geojson file first'); return; }
    const name = modal.querySelector('#upload-name')?.value?.trim() || selectedFile.name.replace(/\.geojson$/i,'');
    try {
      const { uploadGeoJSONFile } = await import('../lib/cloud.js');
      await uploadGeoJSONFile(selectedFile, { isPublic: false });
      showToast(`Uploaded “${name}”`);
      modal.remove();
    } catch(e){
      if(e.data?.error==='QUOTA_EXCEEDED') showToast('Quota exceeded — 1 MB');
      else showToast('Upload failed: '+(e.message||'invalid GeoJSON'));
    }
  });
}

// ================= INTERACTIVE TUTORIAL =================
