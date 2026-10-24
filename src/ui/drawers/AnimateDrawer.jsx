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
        <p className="text-[9px] text-slate-500 leading-relaxed">A drawn region can belong to only one morph. Reusing it clears its older From/To slot; the map layer itself stays drawn.</p>
      </div>

      {/* Optional image / flag overlay — media is exported as a matching sidecar file. */}
      <section className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/70 space-y-3 mt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Icon name="image" className="w-3.5 h-3.5 text-violet-300" />
            Region image / flag
          </span>
          <span className="text-[9px] uppercase tracking-wide text-slate-500">Optional</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Add a bitmap that follows every animated region. Size, position offsets and rotation are keyframed from each morph&apos;s start to end.
        </p>
        <label className="block">
          <span className="sr-only">Choose a flag image</span>
          <input id="morph-flag-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { actions.handleMorphFlagUpload(e) }} className="block w-full text-[10px] text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-[10px] file:font-bold file:text-white hover:file:bg-violet-500" />
        </label>
        <div className="flex items-center gap-2 min-w-0">
          <img id="morph-flag-thumbnail" alt="Selected region image preview" hidden className="w-10 h-10 rounded-lg object-cover border border-slate-600 bg-slate-950" />
          <span id="morph-flag-name" className="flex-1 min-w-0 truncate text-[10px] text-slate-300">No image selected</span>
          <button id="btn-clear-morph-flag" type="button" onClick={() => { actions.clearMorphFlag() }} hidden className="px-2 py-1.5 rounded-lg bg-slate-700 hover:bg-rose-600/80 text-[10px] font-bold text-slate-100">Remove</button>
        </div>
        <div id="morph-flag-transform-controls" hidden className="space-y-3 border-t border-slate-700/80 pt-3">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-[10px] text-slate-200">Mask image to the morphing region</span>
            <input id="morph-flag-mask" type="checkbox" defaultChecked onChange={(e) => { actions.setMorphFlagOption('masked', e.currentTarget.checked) }} className="w-4 h-4 accent-violet-500 rounded" />
          </label>
          <p className="text-[9px] text-slate-500 leading-relaxed">Offsets are percentages of the region&apos;s bounding box (+X right, +Y down). Scale is relative to the region&apos;s width and height.</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { suffix: 'from', title: 'At From shape', fields: [['scale', 'Scale (%)', 10, 500, 5, 100], ['x', 'X offset (%)', -100, 100, 1, 0], ['y', 'Y offset (%)', -100, 100, 1, 0], ['rotation', 'Rotation (°)', -360, 360, 1, 0]] },
              { suffix: 'to', title: 'At To shape', fields: [['scale', 'Scale (%)', 10, 500, 5, 100], ['x', 'X offset (%)', -100, 100, 1, 0], ['y', 'Y offset (%)', -100, 100, 1, 0], ['rotation', 'Rotation (°)', -360, 360, 1, 0]] },
            ].map((group) => (
              <div key={group.suffix} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-2 space-y-2">
                <h4 className="text-[9px] uppercase tracking-wide font-bold text-violet-300">{group.title}</h4>
                {group.fields.map(([field, label, min, max, step, initial]) => (
                  <label key={field} className="block">
                    <span className="text-[9px] text-slate-400">{label}</span>
                    <input id={`morph-flag-${field}-${group.suffix}`} type="number" min={min} max={max} step={step} defaultValue={initial} inputMode="decimal" onInput={(e) => { actions.setMorphFlagOption(`${field === 'x' ? 'offsetX' : field === 'y' ? 'offsetY' : field}${group.suffix === 'from' ? 'From' : 'To'}`, e.currentTarget.value) }} className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] font-mono text-slate-100 focus:outline-none focus:border-violet-500" />
                  </label>
                ))}
              </div>
            ))}
          </div>
          <p className="text-[9px] text-amber-200/80 leading-relaxed">Export downloads the XML plus a matching image file. Import the image into Alight Motion first; the XML links to the asset rather than embedding its bytes. Media linking and mask rendering still need in-app verification.</p>
        </div>
      </section>

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
              <option value="custom">Custom (graph editor)</option>
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
          <span className="text-[10px] text-slate-400">Alight Motion canvas / viewport</span>
          <select id="morph-viewport" defaultValue="9:16" onChange={(e) => { actions.setMorphOption('viewport', e.currentTarget.value) }} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-violet-500">
            <option value="9:16">9:16 · Portrait — 1080 × 1920</option>
            <option value="4:5">4:5 · Portrait — 1080 × 1350</option>
            <option value="1:1">1:1 · Square — 1080 × 1080</option>
            <option value="4:3">4:3 · Landscape — 1440 × 1080</option>
            <option value="3:2">3:2 · Landscape — 1620 × 1080</option>
            <option value="16:9">16:9 · Widescreen — 1920 × 1080</option>
          </select>
        </label>
        {/* Graph editor — the curve Alight Motion will play (cubicBezier x1 y1 x2 y2) */}
        <div id="morph-curve-editor" className="rounded-2xl border border-slate-700/80 bg-slate-950 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5">
              <Icon name="spline" className="w-3.5 h-3.5 text-emerald-400" />
              Graph editor
            </span>
            <span id="morph-curve-code" className="text-[9px] font-mono text-emerald-300 truncate">cubicBezier 0.42 0.0 0.58 1.0</span>
          </div>
          <svg id="morph-curve-svg" viewBox="0 0 260 260" role="img" aria-label="Easing curve editor — drag the white handles" className="w-full block rounded-xl touch-none select-none cursor-crosshair" style={{ aspectRatio: '1 / 1', background: '#05070b' }}>
            <rect x="20" y="20" width="220" height="220" fill="#0b0f17" stroke="#1e293b" />
            <g stroke="#1a2333" strokeWidth="1">
              {Array.from({ length: 19 }, (_, i) => 20 + (i + 1) * 11).map((v) => (
                <g key={v}>
                  <line x1={v} y1="20" x2={v} y2="240" opacity={(v - 20) % 55 === 0 ? 1 : 0.45} />
                  <line x1="20" y1={v} x2="240" y2={v} opacity={(v - 20) % 55 === 0 ? 1 : 0.45} />
                </g>
              ))}
            </g>
            <line x1="20" y1="240" x2="240" y2="20" stroke="#334155" strokeDasharray="3 5" />
            <line id="morph-curve-playhead" x1="130" y1="20" x2="130" y2="240" stroke="#f8fafc" strokeWidth="2" strokeDasharray="6 6" opacity="0.5" />
            <line id="morph-curve-l1" x1="20" y1="240" x2="112.4" y2="240" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
            <line id="morph-curve-l2" x1="240" y1="20" x2="147.6" y2="20" stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
            <path id="morph-curve-path" d="M 20 240 C 112.4 240, 147.6 20, 240 20" fill="none" stroke="#2ee8a5" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="20" cy="240" r="7" fill="#2ee8a5" />
            <circle cx="240" cy="20" r="7" fill="#2ee8a5" />
            <circle id="morph-curve-dot" cx="130" cy="130" r="7" fill="#f8fafc" stroke="#2ee8a5" strokeWidth="3" visibility="hidden" />
            <g id="morph-curve-h1" transform="translate(112.4 240)">
              <circle r="30" fill="transparent" />
              <circle r="17" fill="#ffffff" />
            </g>
            <g id="morph-curve-h2" transform="translate(147.6 20)">
              <circle r="30" fill="transparent" />
              <circle r="17" fill="#ffffff" />
            </g>
          </svg>
          <div className="grid grid-cols-4 gap-1.5">
            {[['x1', 'Out x'], ['y1', 'Out y'], ['x2', 'In x'], ['y2', 'In y']].map(([name, label]) => (
              <label key={name} className="block">
                <span className="text-[9px] uppercase text-slate-500 font-bold">{label}</span>
                <input id={`morph-curve-${name}`} type="number" step="0.01" min={name.startsWith('x') ? 0 : -1} max={name.startsWith('x') ? 1 : 2} inputMode="decimal" defaultValue={name === 'x1' ? '0.42' : name === 'y1' ? '0' : name === 'x2' ? '0.58' : '1'} className="w-full mt-0.5 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-emerald-500" />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['easeInOut', 'Smooth'], ['emphasized', 'Cinematic'], ['easeOut', 'Ease out'], ['easeIn', 'Ease in'], ['linear', 'Linear']].map(([key, label]) => (
              <button key={key} type="button" data-easing-preset={key} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95 transition">{label}</button>
            ))}
            <button type="button" id="btn-morph-curve-mirror" title="Swap the in and out handles (play the curve backwards)" className="ml-auto px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95 transition flex items-center gap-1">
              <Icon name="flip-horizontal-2" className="w-3.5 h-3.5" /> Mirror
            </button>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Drag the white handles like in Alight Motion&apos;s graph editor — left handle shapes the start, right handle the landing. The dashed line is the playhead while the preview runs. Exports as <span className="font-mono text-slate-400">cubicBezier x1 y1 x2 y2</span>.
          </p>
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
          <span id="morph-export-label">Export Alight Motion animation (.xml)</span>
        </button>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed mt-3">
        The export uses the selected Alight Motion canvas in <b className="text-slate-400">Web Mercator</b> (the map's own projection, so the
        shapes look exactly as on screen) with one shape layer per morph whose outline points are keyframed
        (<code className="text-slate-400">&lt;path&gt;&lt;contour&gt;&lt;knot&gt;&lt;p&gt;&lt;kf…</code>) — open it in Alight Motion and the shapes
        morph on their own; you can still move the keyframes or change the easing there.
      </p>
    </div>
  );
}
