import { useState } from 'react';
import { Icon } from '../lib/icons';
import actions from '../engine/actions';

export function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header id="mobile-app-header" className="mobile-only flex-col lg:hidden">
        {/* top bar — cleaner: brand + 4 actions */}
        <div className="mobile-topbar flex items-center justify-between px-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white grid place-items-center shrink-0 shadow-md shadow-emerald-900/30">
              <Icon name="map" className="w-4 h-4" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-[13px] font-black tracking-tight text-white truncate">GeoJSON Studio</div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span id="mobile-shape-count" className="font-mono font-bold">0 shapes</span>
                <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                <span id="mobile-coast-status" className="truncate max-w-[110px]">coast loading</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => { actions.toggleDrawer('creations-drawer') }} title="Discover" aria-label="Discover" className="w-8 h-8 grid place-items-center rounded-xl bg-slate-800/80 text-amber-400 active:scale-95 transition">
              <Icon name="compass" className="w-4 h-4" />
            </button>
            <button onClick={() => { actions.toggleDrawer('changelog-drawer') }} title="Changelog" aria-label="Changelog" className="w-8 h-8 grid place-items-center rounded-xl bg-slate-800/80 text-sky-400 active:scale-95 transition">
              <Icon name="scroll-text" className="w-4 h-4" />
            </button>
            <button onClick={() => { window.dispatchEvent(new CustomEvent('show-welcome', {detail:{force:true}})); }} title="Welcome" aria-label="Welcome" className="w-8 h-8 grid place-items-center rounded-xl bg-slate-800/80 text-violet-400 active:scale-95 transition">
              <Icon name="sparkles" className="w-4 h-4" />
            </button>
            <button onClick={() => { openAuthModal() }} id="btn-auth-mobile-top" title="Discord account" aria-label="Account" className="w-8 h-8 grid place-items-center rounded-xl bg-slate-800/80 text-white active:scale-95 transition overflow-hidden border border-slate-700/60">
              <Icon name="user" className="w-4 h-4" />
            </button>
            <button onClick={() => setMenuOpen(v => !v)} aria-label="More" className={`w-8 h-8 grid place-items-center rounded-xl active:scale-95 transition ${menuOpen ? 'bg-slate-700 text-white' : 'bg-slate-800/80 text-slate-300'}`}>
              <Icon name={menuOpen ? 'x' : 'menu'} className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* mode rail — keep but with snap */}
        <div className="mobile-mode-rail" aria-label="Map modes">
          <button onClick={() => { actions.toggleSelectOnMapMode() }} id="btn-pick-mobile" className="mobile-mode-btn">
            <span id="indicator-pick-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
            <Icon name="mouse-pointer-click" className="w-3.5 h-3.5" />
            <span>Pick <b id="text-pick-mobile" className="text-slate-500">OFF</b></span>
          </button>
          <button onClick={() => { actions.toggleDeleteMode() }} id="btn-delete-mobile" className="mobile-mode-btn">
            <span id="indicator-delete-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
            <Icon name="trash-2" className="w-3.5 h-3.5" />
            <span>Delete <b id="text-delete-mobile" className="text-slate-500">OFF</b></span>
          </button>
          <button onClick={() => { actions.toggleMergeMode() }} id="btn-merge-mobile" className="mobile-mode-btn">
            <span id="indicator-merge-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
            <Icon name="combine" className="w-3.5 h-3.5" />
            <span>Merge <b id="text-merge-mobile" className="text-slate-500">OFF</b></span>
          </button>
          <button onClick={() => { actions.toggleSnappingMode() }} id="btn-snap-mobile" className="mobile-mode-btn border-emerald-500/80 bg-emerald-950/80 text-emerald-100">
            <span id="indicator-snap-mobile" className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400"></span>
            <Icon name="magnet" className="w-3.5 h-3.5 text-emerald-400" />
            <span>Snap <b id="text-snap-mobile" className="text-emerald-300">ON</b></span>
          </button>
          <button onClick={() => { actions.toggleLatLngGrid() }} id="btn-grid-mobile" className="mobile-mode-btn">
            <span id="indicator-grid-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
            <Icon name="grid-3x3" className="w-3.5 h-3.5 text-sky-400" />
            <span>Grid <b id="text-grid-mobile" className="text-slate-500">OFF</b></span>
          </button>
          <button onClick={() => { actions.toggleAutoSeaCut() }} id="btn-sea-mobile" className="mobile-mode-btn">
            <span id="indicator-sea-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
            <Icon name="scissors" className="w-3.5 h-3.5" />
            <span>Auto coast <b id="text-sea-mobile" className="text-slate-500">OFF</b></span>
          </button>
        </div>

        {/* overflow menu — slides down from topbar */}
        {menuOpen && (
          <div className="mt-2 mx-1 bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden animate-[dockIn_0.25s_ease]">
            <div className="grid grid-cols-3 gap-1 p-2">
              <button onClick={() => { setMenuOpen(false); toggleMapLegend(); }} className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-slate-800 text-slate-300">
                <span className="w-9 h-9 grid place-items-center rounded-xl bg-emerald-500/15 text-emerald-400"><Icon name="layers-3" className="w-5 h-5" /></span>
                <span className="text-[10px] font-bold">Legend</span>
                <span id="badge-legend-count-header" className="text-[10px] font-mono text-emerald-400">0</span>
              </button>
              <button onClick={() => { setMenuOpen(false); actions.undoHistory(); }} id="btn-undo-mobile-menu" className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-slate-800 text-slate-300">
                <span className="w-9 h-9 grid place-items-center rounded-xl bg-slate-800 text-slate-300"><Icon name="undo-2" className="w-5 h-5" /></span>
                <span className="text-[10px] font-bold">Undo</span>
              </button>
              <button onClick={() => { setMenuOpen(false); actions.redoHistory(); }} id="btn-redo-mobile-menu" className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-slate-800 text-slate-300">
                <span className="w-9 h-9 grid place-items-center rounded-xl bg-slate-800 text-slate-300"><Icon name="redo-2" className="w-5 h-5" /></span>
                <span className="text-[10px] font-bold">Redo</span>
              </button>
              <button onClick={() => { setMenuOpen(false); actions.toggleDrawer('settings-drawer'); }} className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-slate-800 text-slate-300">
                <span className="w-9 h-9 grid place-items-center rounded-xl bg-slate-800 text-slate-300"><Icon name="settings" className="w-5 h-5" /></span>
                <span className="text-[10px] font-bold">Settings</span>
              </button>
              <button onClick={() => { setMenuOpen(false); actions.locateUser(); }} className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-slate-800 text-slate-300">
                <span className="w-9 h-9 grid place-items-center rounded-xl bg-slate-800 text-slate-300"><Icon name="crosshair" className="w-5 h-5" /></span>
                <span className="text-[10px] font-bold">Locate</span>
              </button>
              <button onClick={() => { setMenuOpen(false); actions.startTutorial(); }} className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-slate-800 text-slate-300">
                <span className="w-9 h-9 grid place-items-center rounded-xl bg-slate-800 text-slate-300"><Icon name="circle-help" className="w-5 h-5" /></span>
                <span className="text-[10px] font-bold">Guide</span>
              </button>
            </div>
            <div className="px-3 pb-3">
              <div className="h-px bg-slate-800 mb-2" />
              <p className="text-[10px] text-slate-500 text-center">Cloud sync is off by default — enable in Settings → Cloud Sync</p>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
