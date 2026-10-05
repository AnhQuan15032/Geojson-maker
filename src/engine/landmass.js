// Split out of the original single-file engine (see legacy/index.html).
// Origin: COASTLINE DETAIL LEVELS

import { S } from './state.js';
import { LAND_SOURCES } from './constants.js';
import { loadGlobalLandmass } from './merge.js';
import { showToast } from './uiHelpers.js';

// ================= CLIENT-SIDE LAND ENGINE & SEA CUTTER =================
// ================= COASTLINE DETAIL LEVELS =================
export function updateCoastlineStatus(state) {
  const lbl = (LAND_SOURCES[S.currentLandLevel] || {}).label || '--';
  const header = document.getElementById('land-engine-status');
  const drawer = document.getElementById('coastline-status');
  const mobile = document.getElementById('mobile-coast-status');
  if (state === 'loading') {
    if (header) {
      header.textContent = `Loading coast ${lbl}...`;
      header.className = 'bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-semibold';
    }
    if (drawer) {
      drawer.textContent = `Loading ${lbl} coastlines...`;
      drawer.className = 'text-[10px] text-amber-300 mb-1.5 font-mono';
    }
    if (mobile) {
      mobile.textContent = `coast ${lbl} loading`;
      mobile.className = 'truncate max-w-[92px] text-amber-300';
    }
  } else if (state === 'ready') {
    if (header) {
      header.textContent = `Coast ${lbl} • ${S.landFeaturesList.length.toLocaleString()} pieces`;
      header.className = 'bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-semibold';
    }
    if (drawer) {
      drawer.textContent = `Ready — ${lbl} · ${S.landFeaturesList.length.toLocaleString()} land pieces`;
      drawer.className = 'text-[10px] text-emerald-300 mb-1.5 font-mono';
    }
    if (mobile) {
      mobile.textContent = `coast ${lbl} ready`;
      mobile.className = 'truncate max-w-[92px] text-emerald-300';
    }
  } else {
    if (header) {
      header.textContent = 'Coastline Offline';
      header.className = 'bg-rose-500/20 text-rose-300 text-[10px] px-2 py-0.5 rounded-full font-semibold';
    }
    if (drawer) {
      drawer.textContent = 'Offline — coastline data unavailable';
      drawer.className = 'text-[10px] text-rose-300 mb-1.5 font-mono';
    }
    if (mobile) {
      mobile.textContent = 'coast offline';
      mobile.className = 'truncate max-w-[92px] text-rose-300';
    }
  }
}

export function highlightCoastlineLevel() {
  document.querySelectorAll('.coast-btn').forEach(btn => {
    const active = btn.getAttribute('data-coast') === S.currentLandLevel;
    btn.classList.toggle('ring-2', active);
    btn.classList.toggle('ring-emerald-500', active);
    btn.classList.toggle('bg-slate-700', active);
    btn.classList.toggle('text-white', active);
  });
}

export function setCoastlineLevel(level) {
  if (!LAND_SOURCES[level] || level === S.currentLandLevel) return;
  S.currentLandLevel = level;
  try {
    localStorage.setItem('coastline_level', level);
  } catch (e) {}
  S.landFeaturesList = S.landCache[level] || [];
  highlightCoastlineLevel();
  updateCoastlineStatus(S.landCache[level] ? 'ready' : 'loading');
  loadGlobalLandmass(level);
  showToast(`Coastline detail: ${LAND_SOURCES[level].label}${level === 'high' ? ' — bigger download, finest detail' : ''}`);
}

// ================= SUPER-DETAIL COASTLINE (LIVE OPENSTREETMAP) =================
// Survey-grade reality instead of generalized Natural Earth: coastline ways
// are pulled live from the Overpass API for the current view, previewed on
// the map, and can either be snapped onto an existing shape's border or
// inserted as an exportable line shape.
