import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
import { S } from '../../engine/state';
export function StyleDrawer() {
  return (
    <div id="style-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-emerald-400 flex items-center gap-2">
          <Icon name="palette" className="w-4 h-4" />
          {' Region Style Inspector '}
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      <div id="no-region-selected" className="py-6 text-center text-slate-400 text-xs">
        <Icon name="mouse-pointer-click" className="w-8 h-8 mx-auto mb-2 text-slate-600" />
        {' Draw or tap on any shape on the map to customize it. '}
      </div>
      <div id="style-editor-controls" className="space-y-4 hidden">
        <div>
          <label className="text-[11px] font-semibold text-slate-400 uppercase block mb-1">
            Region Name
          </label>
          <input type="text" id="style-prop-name" onInput={(e) => { actions.updateActiveFeatureProp('name', e.currentTarget.value) }} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500" placeholder="e.g. Sector A" />
        </div>
        <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/70 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              Fill Color
            </span>
            <div className="flex items-center gap-2">
              <input type="color" id="style-fill-color" onChange={(e) => { actions.updateActiveStyle('fillColor', e.currentTarget.value) }} className="w-7 h-7 rounded-lg bg-transparent border-0 cursor-pointer" />
              <span id="style-fill-color-val" className="font-mono text-xs text-emerald-400">
                #10b981
              </span>
            </div>
          </div>
          <button onClick={() => { actions.randomizeSelectedColor() }} className="w-full p-2.5 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] rounded-xl text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition">
            <Icon name="dices" className="w-4 h-4 text-emerald-400" />
            {' New Unique Color '}
          </button>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-900/60 border border-slate-700/60 rounded-xl p-2">
            <Icon name="info" className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {' Fill is locked at 100% opacity and borders at 0px for clean exports. '}
          </div>
        </div>
        {/* NATURAL BORDER DETAILENER */}
        <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-cyan-800/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Icon name="waves" className="w-3.5 h-3.5 text-cyan-400" />
              {' Natural Border Detailener '}
            </span>
            <span id="roughen-seed" className="font-mono text-[9px] text-slate-400">
              seed —
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            {' Fractal midpoint subdivision adds organic wiggle to straight edges — like real coastlines — without moving the overall shape. '}
          </p>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>
                Detail intensity
              </span>
              <span id="roughen-amp-val" className="font-mono text-slate-200">
                1.5px
              </span>
            </div>
            <input type="range" min="0.3" max="8" step="0.1" defaultValue="1.5" id="roughen-amp" onInput={(e) => { document.getElementById('roughen-amp-val').textContent = e.currentTarget.value + 'px' }} className="w-full accent-cyan-400 bg-slate-700 rounded-lg h-2" />
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>
                Wiggle roughness
              </span>
              <span id="roughen-persist-val" className="font-mono text-slate-200">
                0.60
              </span>
            </div>
            <input type="range" min="0.35" max="0.78" step="0.01" defaultValue="0.6" id="roughen-persist" onInput={(e) => { document.getElementById('roughen-persist-val').textContent = e.currentTarget.value }} className="w-full accent-cyan-400 bg-slate-700 rounded-lg h-2" />
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>
                Detail depth
              </span>
              <span id="roughen-depth-val" className="font-mono text-slate-200">
                4
              </span>
            </div>
            <input type="range" min="1" max="6" step="1" defaultValue="4" id="roughen-depth" onInput={(e) => { document.getElementById('roughen-depth-val').textContent = e.currentTarget.value + ' (×' + Math.pow(2, e.currentTarget.value) + ' segs)' }} className="w-full accent-cyan-400 bg-slate-700 rounded-lg h-2" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { actions.randomizeBorderSeed() }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-slate-200 flex items-center justify-center gap-1 active:scale-95 transition">
              <Icon name="dices" className="w-3.5 h-3.5 text-cyan-300" />
              {' Seed '}
            </button>
            <button onClick={() => { actions.applyBorderDetail() }} className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-[10px] font-bold text-white flex items-center justify-center gap-1 active:scale-95 transition">
              <Icon name="waves" className="w-3.5 h-3.5" />
              {' Detail '}
            </button>
            <button onClick={() => { actions.undoBorderDetail() }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1 active:scale-95 transition">
              <Icon name="undo-2" className="w-3.5 h-3.5" />
              {' Undo '}
            </button>
          </div>
        </div>
        {/* CURVED EDGES */}
        <div id="curve-panel" className="bg-slate-800/80 p-3.5 rounded-2xl border border-fuchsia-800/50 space-y-3 hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Icon name="activity" className="w-3.5 h-3.5 text-fuchsia-400" />
              {' Curved Edges '}
            </span>
            <span id="curve-status" className="text-[10px] font-mono text-slate-400">
              0 / 0 curved
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            {' Alight Motion-style point editor. Press '}
            <b className="text-slate-200">
              Edit Points
            </b>
            {', then tap any vertex to flip it '}
            <b className="text-slate-200">
              corner ⇄ curve
            </b>
            {'; drag the amber Bézier handles to shape the bend, or drag the point to move it. Curve just a few points, or all at once. '}
          </p>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>
                Curve depth
              </span>
              <span id="curve-amount-val" className="font-mono text-slate-200">
                35%
              </span>
            </div>
            <input type="range" min="5" max="95" step="1" defaultValue="35" id="curve-amount" onInput={(e) => { actions.setCurveAmount(e.currentTarget.value) }} className="w-full accent-fuchsia-400 bg-slate-700 rounded-lg h-2" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { actions.toggleCurveEdgeMode() }} id="btn-curve-mode" className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-slate-200 flex items-center justify-center gap-1 active:scale-95 transition">
              <Icon name="pencil-ruler" className="w-3.5 h-3.5 text-fuchsia-300" />
              {' Edit Points '}
            </button>
            <button onClick={() => { actions.curveAllEdges() }} className="p-2 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-xl text-[10px] font-bold text-white flex items-center justify-center gap-1 active:scale-95 transition">
              <Icon name="waves" className="w-3.5 h-3.5" />
              {' Curve All '}
            </button>
            <button onClick={() => { actions.straightenAllEdges() }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1 active:scale-95 transition">
              <Icon name="undo-2" className="w-3.5 h-3.5" />
              {' Straighten '}
            </button>
          </div>
        </div>
        {/* MAKE PART OF THE MAP */}
        <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-emerald-800/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Icon name="map-pinned" className="w-3.5 h-3.5 text-emerald-400" />
              {' Make Part Of The Map '}
            </span>
            <span id="bake-status" className="text-[10px] font-mono text-slate-400">
              Not baked
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            {' Bakes your polygons into the map itself as real tile data — crisp at every zoom, sitting under country borders and labels, indistinguishable from the base map. '}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { actions.bakePolygonsIntoMap() }} className="p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-[11px] font-bold text-white flex items-center justify-center gap-1.5 active:scale-95 transition">
              <Icon name="layers" className="w-3.5 h-3.5" />
              {' Bake Into Map '}
            </button>
            <button onClick={() => { actions.unbakePolygons() }} className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[11px] font-bold text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
              <Icon name="eraser" className="w-3.5 h-3.5" />
              {' Unbake '}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { actions.cutSeaFromPolygon(S.activeSelectedLayer) }} className="flex-1 p-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-900/40">
            <Icon name="scissors" className="w-4 h-4" />
            {' Fix Coastline / Cut Sea '}
          </button>
          <button onClick={() => { actions.deleteSelectedOrLast() }} className="p-2.5 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800 text-rose-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
            <Icon name="trash-2" className="w-4 h-4" />
            {' Delete '}
          </button>
        </div>
      </div>
    </div>
  );
}
