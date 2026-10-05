import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
export function DrawDrawer() {
  return (
    <div id="draw-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-300 flex items-center gap-2">
          <Icon name="pen-tool" className="w-4 h-4 text-emerald-400" />
          {' Drawing Tools '}
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mb-3 flex items-center gap-1.5">
        <Icon name="wand-2" className="w-3.5 h-3.5 text-emerald-400" />
        {' Every new polygon gets its own unique color, 100% opaque fill and no border. '}
      </p>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <button onClick={() => { actions.setDrawMode('Polygon') }} className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 rounded-xl border border-slate-700 text-xs gap-1.5 transition">
          <Icon name="pentagon" className="w-5 h-5 text-emerald-400" />
          {' Polygon '}
        </button>
        <button onClick={() => { actions.setDrawMode('Line') }} className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 rounded-xl border border-slate-700 text-xs gap-1.5 transition">
          <Icon name="git-commit" className="w-5 h-5 text-emerald-400" />
          {' Line '}
        </button>
        <button onClick={() => { actions.setDrawMode('Rectangle') }} className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 rounded-xl border border-slate-700 text-xs gap-1.5 transition">
          <Icon name="square" className="w-5 h-5 text-emerald-400" />
          {' Rectangle '}
        </button>
        <button onClick={() => { actions.setDrawMode('Marker') }} className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 rounded-xl border border-slate-700 text-xs gap-1.5 transition">
          <Icon name="map-pin" className="w-5 h-5 text-emerald-400" />
          {' Marker '}
        </button>
        <button onClick={() => { actions.toggleEditMode() }} id="btn-edit-mode" className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-xs gap-1.5 transition">
          <Icon name="edit-3" className="w-5 h-5 text-amber-400" />
          {' Edit Nodes '}
        </button>
        <button onClick={() => { actions.deleteSelectedOrLast() }} className="flex flex-col items-center justify-center p-3 bg-rose-950/40 hover:bg-rose-900/60 rounded-xl border border-rose-800 text-xs text-rose-300 gap-1.5 transition">
          <Icon name="trash-2" className="w-5 h-5" />
          {' Delete Shape '}
        </button>
      </div>
      {/* MAGNETIC EDGE & VERTEX SNAPPING CONTROLS */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-emerald-800/60 space-y-3 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="magnet" className="w-4 h-4 text-emerald-400" />
            {' Edge & Vertex Snapping '}
          </span>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span id="snap-global-state" className="text-[10px] font-bold text-emerald-400">
              ON
            </span>
            <input type="checkbox" id="snap-enabled-toggle" checked="" onChange={(e) => { actions.setSnappingEnabled(e.currentTarget.checked) }} className="w-4 h-4 accent-emerald-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {' Magnetically locks new vertices directly to the '}
          <b className="text-slate-200">
            edges, corners, and midpoints
          </b>
          {' of existing shapes while drawing or editing. Guarantees seamless borders with 0 gaps. '}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer">
            <span className="text-[10px] font-medium text-slate-300">
              Edges
            </span>
            <input type="checkbox" id="snap-edges-toggle" checked="" onChange={(e) => { actions.setSnapEdges(e.currentTarget.checked) }} className="w-3.5 h-3.5 accent-emerald-500 rounded" />
          </label>
          <label className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer">
            <span className="text-[10px] font-medium text-slate-300">
              Vertices
            </span>
            <input type="checkbox" id="snap-vertices-toggle" checked="" onChange={(e) => { actions.setSnapVertices(e.currentTarget.checked) }} className="w-3.5 h-3.5 accent-emerald-500 rounded" />
          </label>
          <label className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer">
            <span className="text-[10px] font-medium text-slate-300">
              Midpoints
            </span>
            <input type="checkbox" id="snap-midpoints-toggle" checked="" onChange={(e) => { actions.setSnapMidpoints(e.currentTarget.checked) }} className="w-3.5 h-3.5 accent-emerald-500 rounded" />
          </label>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>
              Magnetic range
            </span>
            <span id="snap-distance-val" className="font-mono text-emerald-400 font-bold">
              25 px
            </span>
          </div>
          <input type="range" min="10" max="60" step="2" defaultValue="25" id="snap-distance-slider" onInput={(e) => { actions.setSnapDistance(e.currentTarget.value) }} className="w-full accent-emerald-400 bg-slate-700 rounded-lg h-2" />
          <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
            <span>
              10px (tight)
            </span>
            <span>
              25px (recommended)
            </span>
            <span>
              60px (wide touch)
            </span>
          </div>
        </div>
      </div>
      {/* POINT COORDINATES LABELS WHILE DRAWING */}
      <div className="bg-slate-800/80 p-3 rounded-2xl border border-sky-800/50 flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-sky-500/15 text-sky-400 rounded-xl shrink-0">
            <Icon name="map-pin" className="w-4 h-4" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-xs font-bold text-slate-200">
              Point Coordinates Text
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              Show coordinates & distance below vertices while drawing
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <input type="checkbox" id="toggle-draw-point-labels-draw-drawer" checked="" onChange={(e) => { actions.toggleDrawingPointLabels(e.currentTarget.checked) }} className="w-4 h-4 accent-sky-500 rounded" />
        </label>
      </div>
      {/* QUICK TOOLS */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <button onClick={() => { actions.duplicateSelectedShape() }} title="Duplicate (Ctrl+D)" className="flex flex-col items-center justify-center p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-[10px] text-slate-200 gap-1 transition active:scale-95">
          <Icon name="copy-plus" className="w-4 h-4 text-emerald-400" />
          {' Duplicate '}
        </button>
        <button onClick={() => { actions.zoomToSelection() }} title="Zoom to selection (F)" className="flex flex-col items-center justify-center p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-[10px] text-slate-200 gap-1 transition active:scale-95">
          <Icon name="scan-search" className="w-4 h-4 text-cyan-400" />
          {' Zoom to '}
        </button>
        <button onClick={() => { actions.fitAllShapes() }} title="Fit all shapes (Shift+F)" className="flex flex-col items-center justify-center p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-[10px] text-slate-200 gap-1 transition active:scale-95">
          <Icon name="maximize" className="w-4 h-4 text-indigo-400" />
          {' Fit all '}
        </button>
        <button onClick={() => { actions.toggleShortcutSheet(true) }} title="Keyboard shortcuts (?)" className="flex flex-col items-center justify-center p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-[10px] text-slate-200 gap-1 transition active:scale-95">
          <Icon name="keyboard" className="w-4 h-4 text-amber-400" />
          {' Keys '}
        </button>
      </div>
      {/* CURVED EDGES WHILE DRAWING */}
      <div className="bg-slate-800/80 p-3 rounded-2xl border border-fuchsia-800/50 space-y-2.5 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="activity" className="w-3.5 h-3.5 text-fuchsia-400" />
            {' Curve While Drawing '}
          </span>
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <span id="draw-curve-state" className="text-[10px] font-bold text-slate-400">
              OFF
            </span>
            <input type="checkbox" id="draw-curve-enabled" onChange={(e) => { actions.setDrawCurveEnabled(e.currentTarget.checked) }} className="w-4 h-4 accent-fuchsia-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {' When ON, a smooth dashed preview follows your clicks as you draw, and the finished polygon/rectangle gets '}
          <b className="text-slate-200">
            curved edges
          </b>
          {' automatically — no extra steps. '}
        </p>
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>
              Curve depth
            </span>
            <span id="draw-curve-depth-val" className="font-mono text-slate-200">
              35%
            </span>
          </div>
          <input type="range" min="5" max="95" step="1" defaultValue="35" id="draw-curve-depth" onInput={(e) => { actions.setDrawCurveDepth(e.currentTarget.value) }} className="w-full accent-fuchsia-400 bg-slate-700 rounded-lg h-2" />
        </div>
        <button onClick={() => { actions.curveAllEdges() }} className="w-full p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-fuchsia-200 flex items-center justify-center gap-1.5 active:scale-[0.98] transition">
          <Icon name="wand-2" className="w-3.5 h-3.5 text-fuchsia-300" />
          {' Curve the selected shape now '}
        </button>
      </div>
      {/* SPLIT SHAPE WITH A LINE */}
      <div className="bg-slate-800/80 p-3 rounded-2xl border border-rose-700/50 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="split" className="w-3.5 h-3.5 text-rose-400" />
            {' Split Shape With A Line '}
          </span>
          <span id="split-status" className="text-[10px] font-mono text-slate-400">
            idle
          </span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {' Draw a line — or a bent polyline — straight across a polygon. It is severed along your exact path into '}
          <b className="text-slate-200">
            two new polygons
          </b>
          {', each with its own unique color. Click point by point for a polyline, double-click / double-tap to finish. '}
        </p>
        <label className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer">
          <span className="text-[10px] font-bold text-slate-300">
            Split only the selected shape
          </span>
          <input type="checkbox" id="split-selected-only" checked="" className="w-4 h-4 accent-rose-500 rounded" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => { actions.startSplitMode() }} id="btn-split" className="col-span-2 p-3 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition">
            <Icon name="split" className="w-4 h-4" />
            {' Draw Split Line '}
          </button>
          <button onClick={() => { actions.cancelSplitMode() }} className="p-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-[11px] font-bold text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="x" className="w-3.5 h-3.5" />
            {' Stop '}
          </button>
        </div>
      </div>
      {/* MERGE REGIONS INTO ONE */}
      <div className="bg-slate-800/80 p-3 rounded-2xl border border-violet-700/50 space-y-2.5 mt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="combine" className="w-3.5 h-3.5 text-violet-400" />
            {' Merge Regions '}
          </span>
          <span id="merge-status" className="text-[10px] font-mono text-slate-400">
            0 picked
          </span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {' Turn on '}
          <b className="text-slate-200">
            Pick
          </b>
          {', then tap the regions you want to fuse — provinces into one country, split halves back together, neighbours into a bloc. They become '}
          <b className="text-slate-200">
            one single shape
          </b>
          {'. '}
        </p>
        <label className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer">
          <span className="text-[10px] font-bold text-slate-300">
            Dissolve inner borders & gaps
          </span>
          <input type="checkbox" id="merge-dissolve" checked="" className="w-4 h-4 accent-violet-500 rounded" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => { actions.toggleMergeMode() }} id="btn-merge-mode" className="p-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="hand" className="w-3.5 h-3.5 text-violet-300" />
            {' Pick '}
          </button>
          <button onClick={() => { actions.executeMerge() }} id="btn-merge-run" className="p-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 active:scale-[0.98] text-white font-bold text-[10px] rounded-xl flex items-center justify-center gap-1.5 transition">
            <Icon name="combine" className="w-3.5 h-3.5" />
            {' Merge '}
          </button>
          <button onClick={() => { actions.clearMergeSelection(true) }} className="p-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="x" className="w-3.5 h-3.5" />
            {' Clear '}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { actions.mergeAllTouching() }} className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-violet-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="git-merge" className="w-3.5 h-3.5" />
            {' Merge all touching '}
          </button>
          <button onClick={() => { actions.mergeAllLoadedUnits() }} className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-violet-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="globe-2" className="w-3.5 h-3.5" />
            {' Merge loaded units '}
          </button>
        </div>
      </div>
    </div>
  );
}
