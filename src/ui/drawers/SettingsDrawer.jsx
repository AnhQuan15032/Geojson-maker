import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
export function SettingsDrawer() {
  return (
    <div id="settings-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200 flex items-center gap-2">
          <Icon name="settings" className="w-4 h-4 text-emerald-400" />
          {' Settings & Appearance '}
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      {/* 1. LATITUDE-LONGITUDE GRID OVERLAY */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-sky-800/50 space-y-2.5 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="grid-3x3" className="w-4 h-4 text-sky-400" />
            {' Latitude-Longitude Grid Overlay '}
          </span>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span id="status-latlng-grid-settings" className="text-[10px] font-bold text-slate-400">
              OFF
            </span>
            <input type="checkbox" id="toggle-latlng-grid-settings" onChange={(e) => { actions.toggleLatLngGrid(e.currentTarget.checked) }} className="w-4 h-4 accent-sky-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {' Overlays an adaptive geographic graticule with coordinates ('}
          <b className="text-sky-300">
            °N/°S, °E/°W
          </b>
          {') directly on the map for precise spatial alignment. Press '}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300 font-mono text-[9px]">
            G
          </kbd>
          {' anytime to toggle. '}
        </p>
      </div>
      {/* 2. ISLAND COASTLINE COMBINING */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-cyan-800/50 space-y-2 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="combine" className="w-4 h-4 text-cyan-400" />
            {' Unified Island Region (MultiPolygon) '}
          </span>
          <span className="text-[10px] font-bold text-cyan-400">
            ACTIVE
          </span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {' All islands in a drawn area after cutting coastlines are preserved in a '}
          <b className="text-cyan-300">
            single unified region
          </b>
          {'. Styling, editing, and exporting applies to mainland and all islands together. '}
        </p>
      </div>
      {/* 3. DRAWING POINT LABELS */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-emerald-800/50 space-y-2.5 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="map-pin" className="w-4 h-4 text-emerald-400" />
            {' Vertex Coordinates Text '}
          </span>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span id="status-draw-point-labels" className="text-[10px] font-bold text-emerald-400">
              ON
            </span>
            <input type="checkbox" id="toggle-draw-point-labels" checked="" onChange={(e) => { actions.toggleDrawingPointLabels(e.currentTarget.checked) }} className="w-4 h-4 accent-emerald-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {' Displays coordinate badges ('}
          <b className="text-emerald-300">
            P1 • 34.5°N, 36.1°E
          </b>
          {') and distance increments below each polygon vertex while drawing. '}
        </p>
      </div>
      {/* 4. GUI THEME */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 mb-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="palette" className="w-4 h-4 text-amber-400" />
            {' Custom GUI Theme '}
          </span>
          <span id="label-active-theme" className="text-[10px] font-bold text-amber-300">
            Dark Slate
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" id="theme-options-grid"></div>
      </div>
      {/* 5. GUI LAYOUT */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 mb-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="layout-grid" className="w-4 h-4 text-purple-400" />
            {' Custom GUI Layout '}
          </span>
          <span id="label-active-layout" className="text-[10px] font-bold text-purple-300">
            Default
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2" id="layout-options-grid"></div>
      </div>
      {/* 6. TEXT SIZE (FONT SCALING) */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 mb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="type" className="w-4 h-4 text-teal-400" />
            {' Interface Text Size '}
          </span>
          <span id="label-active-text-size" className="text-[10px] font-mono font-bold text-teal-300">
            100%
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2" id="text-size-options-grid"></div>
      </div>
    </div>
  );
}
