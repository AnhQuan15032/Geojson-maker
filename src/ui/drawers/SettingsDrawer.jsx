import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';

export function SettingsDrawer() {
  return (
    <div id="settings-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200 flex items-center gap-2">
          <Icon name="settings" className="w-4 h-4 text-emerald-400" />
          Settings & Appearance
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      {/* 0. STORAGE DELETED + CONTINENTS */}
      <div className="p-3.5 rounded-2xl border bg-slate-800/80 border-slate-700/50 space-y-2.5 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 grid place-items-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20"><Icon name="trash-2" className="w-4 h-4" /></span>
          <span className="text-xs font-bold text-slate-200">Storage deleted</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300 font-black">OFF</span>
          <span className="w-7 h-7 grid place-items-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 ml-auto"><Icon name="globe-2" className="w-4 h-4" /></span>
          <span className="text-xs font-bold text-cyan-200">Continents</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          No saving — <b className="text-slate-200">Draw, Load, Export</b> only. Use <b className="text-cyan-300">Map → Continents</b> in the <b className="text-slate-200">Map</b> panel to load Africa, Europe, Asia, N/S America, Oceania, Antarctica as editable shapes.
        </p>
        <div className="flex gap-2">
          <button onClick={() => { actions.closeDrawers(); setTimeout(()=> { try{ window.dispatchEvent(new CustomEvent('show-welcome', { detail:{force:true}})); }catch{} }, 300); }} className="text-[11px] px-2.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium">
            Show welcome again
          </button>
          <button onClick={() => { actions.toggleDrawer('layers-drawer'); }} className="text-[11px] px-2.5 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold">
            Open Map
          </button>
        </div>
      </div>

      {/* 1. LATITUDE-LONGITUDE GRID OVERLAY */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-sky-800/50 space-y-2.5 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="grid-3x3" className="w-4 h-4 text-sky-400" />
            Latitude-Longitude Grid Overlay
          </span>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span id="status-latlng-grid-settings" className="text-[10px] font-bold text-slate-400">OFF</span>
            <input type="checkbox" id="toggle-latlng-grid-settings" onChange={(e) => { actions.toggleLatLngGrid(e.currentTarget.checked) }} className="w-4 h-4 accent-sky-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Overlays an adaptive geographic graticule with coordinates (<b className="text-sky-300">°N/°S, °E/°W</b>) directly on the map for precise spatial alignment. Press
          <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300 font-mono text-[9px]">G</kbd> anytime to toggle.
        </p>
      </div>

      {/* 2. ISLAND HANDLING WHEN CUTTING SEA */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-cyan-800/50 space-y-2.5 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="waves" className="w-4 h-4 text-cyan-400" />
            Cut Sea — No Islands Mode
          </span>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span id="status-cut-no-islands" className="text-[10px] font-bold text-slate-400">OFF</span>
            <input type="checkbox" id="toggle-cut-no-islands" onChange={() => { actions.toggleCutSeaNoIslands() }} className="w-4 h-4 accent-cyan-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          <b className="text-slate-200">OFF (default)</b> — every island inside the drawn area is preserved and united with the mainland into
          <b className="text-cyan-300"> one single region</b> (MultiPolygon), so styling, editing and exporting apply to all of them together.
        </p>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          <b className="text-amber-300">ON</b> — only the
          <b className="text-slate-200"> largest landmass (mainland)</b> is kept; all islands are dropped. Use it to clean up archipelagos, or grab a single clean outline. Applies to
          <b className="text-slate-200"> Cut Sea</b>, the
          <b className="text-slate-200"> Auto-Cut</b> toggle and the one-shot button in the Style panel.
        </p>
      </div>

      {/* 3. DRAWING POINT LABELS */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-emerald-800/50 space-y-2.5 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="map-pin" className="w-4 h-4 text-emerald-400" />
            Vertex Coordinates Text
          </span>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span id="status-draw-point-labels" className="text-[10px] font-bold text-emerald-400">ON</span>
            <input type="checkbox" id="toggle-draw-point-labels" checked="" onChange={(e) => { actions.toggleDrawingPointLabels(e.currentTarget.checked) }} className="w-4 h-4 accent-emerald-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Displays coordinate badges (<b className="text-emerald-300">P1 • 34.5°N, 36.1°E</b>) and distance increments below each polygon vertex while drawing.
        </p>
      </div>

      {/* 4. GUI THEME */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 mb-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="palette" className="w-4 h-4 text-amber-400" />
            Custom GUI Theme
          </span>
          <span id="label-active-theme" className="text-[10px] font-bold text-amber-300">Dark Slate</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" id="theme-options-grid"></div>
      </div>

      {/* 5. GUI LAYOUT */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 mb-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="layout-grid" className="w-4 h-4 text-purple-400" />
            Custom GUI Layout
          </span>
          <span id="label-active-layout" className="text-[10px] font-bold text-purple-300">Default</span>
        </div>
        <div className="grid grid-cols-2 gap-2" id="layout-options-grid"></div>
      </div>

      {/* 6. TEXT SIZE (FONT SCALING) */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 mb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="type" className="w-4 h-4 text-teal-400" />
            Interface Text Size
          </span>
          <span id="label-active-text-size" className="text-[10px] font-mono font-bold text-teal-300">100%</span>
        </div>
        <div className="grid grid-cols-4 gap-2" id="text-size-options-grid"></div>
      </div>
    </div>
  );
}
