import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';

// Vector auto-animator: pick a start shape and an end shape, preview the
// morph on the map, export it as an Alight Motion project with keyframed
// outline points. The engine (src/engine/animator.js) fills the chips / status
// by id, so the ids here are part of its contract.
export function AnimateDrawer() {
  return (
    <div id="animate-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-violet-300 flex items-center gap-2">
          <Icon name="clapperboard" className="w-4 h-4" />
          {' Vector Animator '}
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1" aria-label="Close">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
        Draw <b className="text-slate-200">shape 1</b>, draw <b className="text-slate-200">shape 2</b>, then animate: every point of the first
        outline travels to a point of the second one. Missing points are added to the sparser shape first, the start vertex and winding are
        aligned, and the path is checked so the outline never crosses itself mid-way. Add as many From → To morphs as you like — each one
        becomes its own animated layer. Islands and holes are kept: the parts are joined by hair-thin bridges (0.02 px, invisible) so the
        shape stays one outline with no extra borders, like an Age of History province.
      </p>

      {/* Morph tracks (From / To pairs) — rows are rendered by the engine (src/engine/animator.js) */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/70 space-y-2.5">
        <div id="morph-tracks" className="space-y-2"></div>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button onClick={() => { actions.autoPickMorphShapes() }} className="col-span-2 p-2 bg-violet-600/80 hover:bg-violet-500 active:scale-[0.98] rounded-xl text-[10px] font-bold text-white flex items-center justify-center gap-1.5 transition" title="Fill the active morph with the last two shapes drawn">
            <Icon name="sparkles" className="w-3.5 h-3.5" />
            Use last two shapes
          </button>
          <button id="btn-morph-add-track" onClick={() => { actions.addMorphTrack() }} className="p-2 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] rounded-xl text-[10px] font-bold text-slate-100 flex items-center justify-center gap-1.5 transition" title="Add another From → To morph">
            <Icon name="plus-circle" className="w-3.5 h-3.5" />
            Add morph
          </button>
        </div>
        <p id="morph-status" className="text-[10px] text-slate-400 leading-relaxed">
          Draw two polygons: the first is the start, the second is what it turns into.
        </p>
      </div>

      {/* Timing */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/70 space-y-3 mt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Icon name="timer" className="w-3.5 h-3.5 text-violet-300" />
            Timing
          </span>
          <span id="morph-total-time" className="text-[10px] font-mono text-violet-300">2.5 s total</span>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Morph duration</span>
            <span id="morph-duration-val" className="font-mono text-slate-200">1.5 s</span>
          </div>
          <input type="range" min="0.2" max="8" step="0.1" defaultValue="1.5" id="morph-duration" onInput={(e) => { actions.setMorphOption('duration', e.currentTarget.value) }} className="w-full accent-violet-400 bg-slate-700 rounded-lg h-2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>Hold start</span>
              <span id="morph-hold-start-val" className="font-mono text-slate-200">0.5 s</span>
            </div>
            <input type="range" min="0" max="5" step="0.1" defaultValue="0.5" id="morph-hold-start" onInput={(e) => { actions.setMorphOption('holdStart', e.currentTarget.value) }} className="w-full accent-violet-400 bg-slate-700 rounded-lg h-2" />
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>Hold end</span>
              <span id="morph-hold-end-val" className="font-mono text-slate-200">0.5 s</span>
            </div>
            <input type="range" min="0" max="5" step="0.1" defaultValue="0.5" id="morph-hold-end" onInput={(e) => { actions.setMorphOption('holdEnd', e.currentTarget.value) }} className="w-full accent-violet-400 bg-slate-700 rounded-lg h-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] text-slate-400">Easing</span>
            <select id="morph-easing" defaultValue="easeInOut" onChange={(e) => { actions.setMorphOption('easing', e.currentTarget.value) }} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-violet-500">
              <option value="easeInOut">Smooth (ease in-out)</option>
              <option value="emphasized">Cinematic (slow landing)</option>
              <option value="easeOut">Ease out (quick start)</option>
              <option value="easeIn">Ease in (slow start)</option>
              <option value="linear">Linear (constant speed)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-400">Point budget</span>
            <select id="morph-max-points" defaultValue="400" onChange={(e) => { actions.setMorphOption('maxPoints', e.currentTarget.value) }} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-violet-500">
              <option value="120">120 — light</option>
              <option value="250">250</option>
              <option value="400">400 — balanced</option>
              <option value="800">800 — detailed</option>
              <option value="1500">1500 — max (heavy in AM)</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] text-slate-400">Several morphs play</span>
          <select id="morph-sequence" defaultValue="together" onChange={(e) => { actions.setMorphOption('sequence', e.currentTarget.value) }} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-violet-500">
            <option value="together">All together (same keyframes)</option>
            <option value="sequence">One after another (Morph 1, then 2, …)</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-[10px] text-slate-300 flex items-center gap-1.5">
            <Icon name="repeat" className="w-3.5 h-3.5 text-violet-300" />
            Return to start (A → B → A)
          </span>
          <input type="checkbox" id="morph-pingpong" onChange={(e) => { actions.setMorphOption('pingPong', e.currentTarget.checked) }} className="w-4 h-4 accent-violet-500 rounded" />
        </label>
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-[10px] text-slate-300">Animate fill colour (From → To)</span>
          <input type="checkbox" id="morph-animate-color" defaultChecked onChange={(e) => { actions.setMorphOption('animateColor', e.currentTarget.checked) }} className="w-4 h-4 accent-violet-500 rounded" />
        </label>
        <label className="flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-[10px] text-slate-300">Include the other shapes as static layers (Mercator, same fit)</span>
          <input type="checkbox" id="morph-include-others" onChange={(e) => { actions.setMorphOption('includeOthers', e.currentTarget.checked) }} className="w-4 h-4 accent-violet-500 rounded" />
        </label>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-2.5 mt-3">
        <button id="btn-morph-preview" onClick={() => { actions.toggleMorphPreview() }} className="p-3 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold text-slate-100 flex items-center justify-center gap-2 transition">
          <Icon name="play" className="w-4 h-4 text-violet-300 morph-icon-play" />
          <Icon name="circle-stop" className="w-4 h-4 text-rose-300 morph-icon-stop" />
          <span data-label>Preview on map</span>
          <span id="morph-preview-clock" className="font-mono text-[10px] text-slate-400"></span>
        </button>
        <button id="btn-morph-export" onClick={() => { actions.downloadAlightMotionMorph() }} className="p-3.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-violet-950/50 transition">
          <Icon name="film" className="w-4 h-4" />
          {' Export Alight Motion animation (.xml) '}
        </button>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed mt-3">
        The export is a 1080×1920 Alight Motion project in <b className="text-slate-400">Web Mercator</b> (the map's own projection, so the
        shapes look exactly as on screen) with one shape layer per morph whose outline points are keyframed
        (<code className="text-slate-400">&lt;path&gt;&lt;contour&gt;&lt;knot&gt;&lt;p&gt;&lt;kf…</code>) — open it in Alight Motion and the shapes
        morph on their own; you can still move the keyframes or change the easing there.
      </p>
    </div>
  );
}
