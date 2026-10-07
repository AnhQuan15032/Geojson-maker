import { Icon } from '../lib/icons';
import actions from '../engine/actions';
export function MobileHeader() {
  return (
    <header id="mobile-app-header" className="mobile-only flex-col lg:hidden">
      <div className="mobile-topbar flex items-center justify-between px-3">
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center shrink-0">
            <Icon name="map" className="w-4 h-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-[12px] font-black tracking-tight text-white truncate">
              GeoJSON Studio
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
              <span id="mobile-shape-count" className="font-mono">
                0 shapes
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-600"></span>
              <span id="mobile-coast-status" className="truncate max-w-[92px]">
                coast loading
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { toggleMapLegend() }} id="btn-legend-mobile-top" title="Map Legend" aria-label="Legend" className="w-8 h-8 grid place-items-center rounded-xl text-emerald-400 active:bg-slate-800 transition">
            <Icon name="layers-3" className="w-4 h-4" />
          </button>
          <button onClick={() => { actions.toggleDrawer('creations-drawer') }} title="Community Creations" aria-label="Creations" className="w-8 h-8 grid place-items-center rounded-xl text-amber-400 active:bg-slate-800 transition">
            <Icon name="compass" className="w-4 h-4" />
          </button>
          <button onClick={() => { actions.toggleDrawer('changelog-drawer') }} title="Changelog" aria-label="Changelog" className="w-8 h-8 grid place-items-center rounded-xl text-sky-400 active:bg-slate-800 transition">
            <Icon name="scroll-text" className="w-4 h-4" />
          </button>
          <button onClick={() => { openAuthModal() }} id="btn-auth-mobile-top" title="Account" aria-label="Account" className="w-8 h-8 grid place-items-center rounded-xl text-sky-400 active:bg-slate-800 transition overflow-hidden">
            <Icon name="user" className="w-4 h-4" />
          </button>
          <button onClick={() => { actions.undoHistory() }} id="btn-undo-mobile" aria-label="Undo" className="w-8 h-8 grid place-items-center rounded-xl text-slate-300 disabled:opacity-35 active:bg-slate-800 active:scale-95 transition">
            <Icon name="undo-2" className="w-4 h-4" />
          </button>
          <button onClick={() => { actions.redoHistory() }} id="btn-redo-mobile" aria-label="Redo" className="w-8 h-8 grid place-items-center rounded-xl text-slate-300 disabled:opacity-35 active:bg-slate-800 active:scale-95 transition">
            <Icon name="redo-2" className="w-4 h-4" />
          </button>
          <button onClick={() => { actions.toggleDrawer('settings-drawer') }} aria-label="Open settings" className="w-8 h-8 grid place-items-center rounded-xl text-slate-300 active:bg-slate-800 active:scale-95 transition">
            <Icon name="settings" className="w-4 h-4" />
          </button>
          <button onClick={() => { actions.locateUser() }} aria-label="Center on GPS" className="w-8 h-8 grid place-items-center rounded-xl text-slate-300 active:bg-slate-800 active:scale-95 transition">
            <Icon name="crosshair" className="w-4 h-4" />
          </button>
          <button onClick={() => { actions.startTutorial() }} aria-label="Open guide" className="w-8 h-8 grid place-items-center rounded-xl text-slate-300 active:bg-slate-800 active:scale-95 transition">
            <Icon name="circle-help" className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="mobile-mode-rail" aria-label="Map modes">
        <button onClick={() => { actions.toggleSelectOnMapMode() }} id="btn-pick-mobile" className="mobile-mode-btn">
          <span id="indicator-pick-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
          <Icon name="mouse-pointer-click" className="w-3.5 h-3.5" />
          <span>
            {'Pick '}
            <b id="text-pick-mobile" className="text-slate-500">
              OFF
            </b>
          </span>
        </button>
        <button onClick={() => { actions.toggleDeleteMode() }} id="btn-delete-mobile" className="mobile-mode-btn">
          <span id="indicator-delete-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
          <Icon name="trash-2" className="w-3.5 h-3.5" />
          <span>
            {'Delete '}
            <b id="text-delete-mobile" className="text-slate-500">
              OFF
            </b>
          </span>
        </button>
        <button onClick={() => { actions.toggleMergeMode() }} id="btn-merge-mobile" className="mobile-mode-btn">
          <span id="indicator-merge-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
          <Icon name="combine" className="w-3.5 h-3.5" />
          <span>
            {'Merge '}
            <b id="text-merge-mobile" className="text-slate-500">
              OFF
            </b>
          </span>
        </button>
        <button onClick={() => { actions.toggleSnappingMode() }} id="btn-snap-mobile" className="mobile-mode-btn border-emerald-500/80 bg-emerald-950/80 text-emerald-100">
          <span id="indicator-snap-mobile" className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400"></span>
          <Icon name="magnet" className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            {'Snap '}
            <b id="text-snap-mobile" className="text-emerald-300">
              ON
            </b>
          </span>
        </button>
        <button onClick={() => { actions.toggleLatLngGrid() }} id="btn-grid-mobile" className="mobile-mode-btn">
          <span id="indicator-grid-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
          <Icon name="grid-3x3" className="w-3.5 h-3.5 text-sky-400" />
          <span>
            {'Grid '}
            <b id="text-grid-mobile" className="text-slate-500">
              OFF
            </b>
          </span>
        </button>
        <button onClick={() => { actions.toggleAutoSeaCut() }} id="btn-sea-mobile" className="mobile-mode-btn">
          <span id="indicator-sea-mobile" className="w-2 h-2 rounded-full bg-slate-500"></span>
          <Icon name="scissors" className="w-3.5 h-3.5" />
          <span>
            {'Auto coast '}
            <b id="text-sea-mobile" className="text-slate-500">
              OFF
            </b>
          </span>
        </button>
      </div>
    </header>
  );
}
