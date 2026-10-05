import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
export function ExportDrawer() {
  return (
    <div id="export-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-emerald-400 flex items-center gap-2">
          <Icon name="download" className="w-4 h-4" />
          {' Export Vector, Video & Data '}
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      {/* Multi-Format Export Buttons Grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        {/* Alight Motion XML Project */}
        <button onClick={() => { actions.downloadAlightMotionXML() }} className="col-span-2 p-3.5 bg-gradient-to-r from-rose-600 via-pink-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 transition">
          <Icon name="film" className="w-4 h-4" />
          {' Export Alight Motion Project (.xml) '}
        </button>
        {/* GeoJSON */}
        <button onClick={() => { actions.downloadGeoJSON() }} className="p-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40">
          <Icon name="code-2" className="w-4 h-4" />
          {' Save .geojson '}
        </button>
        {/* SVG Vector */}
        <button onClick={() => { actions.downloadSVG() }} className="p-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-950/40">
          <Icon name="shapes" className="w-4 h-4" />
          {' Export .svg '}
        </button>
        {/* GIS XML / KML */}
        <button onClick={() => { actions.downloadXML() }} className="p-3 bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950/40">
          <Icon name="file-code" className="w-4 h-4" />
          {' GIS .xml (KML) '}
        </button>
        {/* Transparent PNG */}
        <button onClick={() => { actions.downloadTransparentPNG(true) }} className="p-3 bg-cyan-600 hover:bg-cyan-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-950/40">
          <Icon name="sparkles" className="w-4 h-4" />
          {' PNG (Transparent) '}
        </button>
      </div>
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
          <span className="text-slate-400 block text-[10px]">
            Total Land Area
          </span>
          <span id="stat-total-area" className="font-bold text-emerald-400">
            0.00 km²
          </span>
        </div>
        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
          <span className="text-slate-400 block text-[10px]">
            Total Shapes
          </span>
          <span id="stat-feature-count" className="font-bold text-emerald-400">
            0 Items
          </span>
        </div>
      </div>
      {/* GeoJSON Viewer */}
      <textarea id="geojson-textarea" rows="4" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-emerald-300/90 focus:outline-none focus:border-emerald-500/80 resize-none mb-3" placeholder="GeoJSON output will appear here..."></textarea>
      {/* Copy & Load */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { actions.copyGeoJSONToClipboard() }} className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5">
          <Icon name="copy" className="w-3.5 h-3.5" />
          {' Copy Text '}
        </button>
        <label className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-center cursor-pointer text-xs text-emerald-300 font-bold flex items-center justify-center gap-1.5 transition">
          <Icon name="file-up" className="w-3.5 h-3.5" />
          {' Load File '}
          <input type="file" id="import-geojson-input" accept=".geojson,.json" className="hidden" onChange={(e) => { actions.importGeoJSONFile(e) }} />
        </label>
      </div>
    </div>
  );
}
