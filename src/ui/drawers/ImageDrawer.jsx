import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
export function ImageDrawer() {
  return (
    <div id="image-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-amber-400 flex items-center gap-2">
          <Icon name="image" className="w-4 h-4" />
          {' Reference Image Manager '}
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-amber-400/80 bg-slate-800/60 rounded-2xl p-3.5 cursor-pointer mb-3.5 transition">
        <Icon name="upload-cloud" className="w-6 h-6 text-amber-400 mb-1" />
        <span className="text-xs text-slate-200 font-medium">
          Upload Map Overlay
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5">
          Maintains aspect ratio automatically
        </span>
        <input type="file" id="image-upload-input" accept="image/*" className="hidden" onChange={(e) => { actions.handleImageUpload(e) }} />
      </label>
      <div id="image-controls" className="space-y-3.5 hidden">
        {/* AUTO-GEOREFERENCE ENGINE */}
        <div className="bg-slate-800/80 p-3 rounded-2xl border border-fuchsia-700/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Icon name="crosshair" className="w-3.5 h-3.5 text-fuchsia-400" />
              {' Auto-Georeference Engine '}
            </span>
            <span id="georef-status-badge" className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              Idle
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            {' Detects the coastlines & borders drawn in your overlay, matches them against real geographic data, and snaps the image to the exact place it belongs. Best with north-up, Mercator-style map images. '}
          </p>
          <div className="flex items-start gap-1.5 text-[10px] text-slate-400 bg-slate-900/60 border border-slate-700/60 rounded-lg p-2 leading-relaxed">
            <Icon name="lightbulb" className="w-3.5 h-3.5 text-fuchsia-400 shrink-0 mt-0.5" />
            {' Pan the map close to the region first — then hit Detect. The engine searches the current view ×3 by default. '}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[9px] uppercase text-slate-400 font-bold">
                Search area
              </span>
              <select id="georef-area" className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-fuchsia-500">
                <option value="view">
                  Current view
                </option>
                <option value="wide" selected="">
                  Wider ×3
                </option>
                <option value="region">
                  Region ×8
                </option>
              </select>
            </label>
            <label className="block">
              <span className="text-[9px] uppercase text-slate-400 font-bold">
                Line detail
              </span>
              <select id="georef-sens" className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-fuchsia-500">
                <option value="low">
                  Few lines
                </option>
                <option value="medium" selected="">
                  Balanced
                </option>
                <option value="high">
                  Detailed
                </option>
              </select>
            </label>
            <label className="flex flex-col items-center justify-center gap-1 bg-slate-900/60 border border-slate-700/60 rounded-lg px-1 py-1">
              <span className="text-[9px] uppercase text-slate-400 font-bold">
                Rotation
              </span>
              <input type="checkbox" id="georef-rot" checked="" className="w-4 h-4 accent-fuchsia-500 rounded" />
            </label>
          </div>
          {/* SEA-COLOUR COASTLINE DETECTION */}
          <div className="bg-slate-900/60 border border-cyan-800/40 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5">
                <Icon name="droplets" className="w-3.5 h-3.5 text-cyan-400" />
                {' Sea colour detection '}
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span id="sea-detect-state" className="text-[9px] font-bold text-cyan-300">
                  ON
                </span>
                <input type="checkbox" id="sea-detect-enabled" checked="" onChange={(e) => { actions.setSeaDetectEnabled(e.currentTarget.checked) }} className="w-3.5 h-3.5 accent-cyan-500 rounded" />
              </label>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">
              Pick the water colour of your map image — the detector then traces the real coast from it instead of guessing from text and borders.
            </p>
            <div className="flex items-center gap-1.5">
              <input type="color" id="sea-color" defaultValue="#a5bfdd" onChange={(e) => { actions.setSeaColor(e.currentTarget.value) }} className="w-8 h-7 rounded-lg bg-transparent border-0 cursor-pointer shrink-0" />
              <button onClick={() => { actions.toggleSeaPickFromOverlay() }} id="btn-sea-pick" className="flex-1 p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold text-cyan-200 flex items-center justify-center gap-1 active:scale-95 transition">
                <Icon name="pipette" className="w-3.5 h-3.5" />
                {' Pick on image '}
              </button>
              <button onClick={() => { actions.autoDetectSeaColor() }} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold text-cyan-200 flex items-center justify-center gap-1 active:scale-95 transition shrink-0">
                <Icon name="wand-sparkles" className="w-3.5 h-3.5" />
                {' Auto '}
              </button>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                <span>
                  Colour tolerance
                </span>
                <span id="sea-tol-val" className="font-mono text-slate-200">
                  60
                </span>
              </div>
              <input type="range" min="10" max="160" step="2" defaultValue="60" id="sea-tolerance" onInput={(e) => { actions.setSeaTolerance(e.currentTarget.value) }} className="w-full accent-cyan-400 bg-slate-700 rounded-lg h-2" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => { actions.detectCoastlineFromSeaColor() }} id="btn-detect-coast" className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-[10px] font-bold text-white flex items-center justify-center gap-1 active:scale-95 transition">
                <Icon name="scan" className="w-3.5 h-3.5" />
                {' Detect coast '}
              </button>
              <button onClick={() => { actions.addDetectedCoastAsShapes() }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold text-slate-200 flex items-center justify-center gap-1 active:scale-95 transition">
                <Icon name="plus-circle" className="w-3.5 h-3.5" />
                {' As shape '}
              </button>
              <button onClick={() => { actions.clearDetectedCoastPreview() }} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1 active:scale-95 transition">
                <Icon name="eraser" className="w-3.5 h-3.5" />
                {' Clear '}
              </button>
            </div>
            <div id="sea-detect-status" className="text-[9px] font-mono text-slate-400">
              Pick the sea colour → Detect coast → georeference matches the coastline instead of captions
            </div>
          </div>
          <button onClick={() => { actions.runGeorefDetection() }} id="btn-georef-run" className="w-full p-3 bg-gradient-to-r from-fuchsia-600 to-rose-600 hover:from-fuchsia-500 hover:to-rose-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-950/50 transition">
            <Icon name="crosshair" className="w-4 h-4" />
            {' Detect Outlines & Place '}
          </button>
          <div id="georef-progress" className="hidden space-y-1.5">
            <div className="flex justify-between text-[10px] text-slate-300">
              <span id="georef-progress-text">
                Analysing…
              </span>
              <span id="georef-progress-pct" className="font-mono">
                0%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
              <div id="georef-progress-bar" className="h-full w-0 bg-gradient-to-r from-fuchsia-500 to-rose-500 transition-all duration-150"></div>
            </div>
          </div>
          <div id="georef-result" className="hidden bg-slate-900/70 border border-fuchsia-700/40 rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-fuchsia-300 flex items-center gap-1.5">
                <Icon name="target" className="w-3.5 h-3.5" />
                <span id="georef-conf-text">
                  —
                </span>
              </span>
              <span id="georef-match-text" className="font-mono text-slate-300">
                —
              </span>
            </div>
            <div id="georef-detail-text" className="text-[10px] text-slate-400 leading-relaxed">
              —
            </div>
            <button onClick={() => { actions.undoGeorefDetection() }} className="w-full p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1.5 transition">
              <Icon name="undo-2" className="w-3.5 h-3.5" />
              {' Undo Detection '}
            </button>
          </div>
        </div>
        {/* AUTO PLACE PANEL */}
        <div className="bg-slate-800/80 p-3 rounded-2xl border border-amber-700/40 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Icon name="sparkles" className="w-3.5 h-3.5 text-amber-400" />
              {' Auto Place Overlay '}
            </span>
            <span className="text-[10px] text-slate-400">
              No stretch
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { actions.autoPlaceOverlay('view') }} className="p-2 bg-slate-700 hover:bg-amber-600/70 active:scale-95 rounded-xl text-[10px] font-bold text-slate-200 flex flex-col items-center gap-1 transition">
              <Icon name="maximize" className="w-4 h-4 text-amber-400" />
              {' Fit View '}
            </button>
            <button onClick={() => { actions.autoPlaceOverlay('shapes') }} className="p-2 bg-slate-700 hover:bg-amber-600/70 active:scale-95 rounded-xl text-[10px] font-bold text-slate-200 flex flex-col items-center gap-1 transition">
              <Icon name="pentagon" className="w-4 h-4 text-emerald-400" />
              {' Fit Shapes '}
            </button>
            <button onClick={() => { actions.autoPlaceOverlay('cover') }} className="p-2 bg-slate-700 hover:bg-amber-600/70 active:scale-95 rounded-xl text-[10px] font-bold text-slate-200 flex flex-col items-center gap-1 transition">
              <Icon name="scan" className="w-4 h-4 text-cyan-400" />
              {' Cover View '}
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-slate-900/60 border border-slate-700/60 rounded-xl p-2 leading-relaxed">
            <Icon name="shield-check" className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {' Pixel-locked to the map projection — the image keeps its true aspect ratio while panning, zooming or moving to any latitude. '}
          </div>
        </div>
        {/* SCALE */}
        <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="check-keep-aspect" checked="" onChange={(e) => { actions.toggleAspectRatioLock(e.currentTarget.checked) }} className="w-4 h-4 accent-amber-400 rounded" />
              <span className="text-xs font-semibold text-slate-200">
                Resize Equally (Lock Aspect)
              </span>
            </label>
            <span id="scale-val" className="font-mono text-xs text-amber-400">
              100%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { actions.adjustScaleRelative(-0.1) }} className="p-2 bg-slate-700 hover:bg-slate-600 active:scale-95 rounded-xl text-slate-200 text-xs font-bold w-9 h-9 flex items-center justify-center">
              -
            </button>
            <input type="range" min="10" max="400" defaultValue="100" id="image-scale-slider" className="w-full accent-amber-400 bg-slate-700 rounded-lg h-2" onInput={(e) => { actions.applyScaleSlider(e.currentTarget.value) }} />
            <button onClick={() => { actions.adjustScaleRelative(0.1) }} className="p-2 bg-slate-700 hover:bg-slate-600 active:scale-95 rounded-xl text-slate-200 text-xs font-bold w-9 h-9 flex items-center justify-center">
              +
            </button>
          </div>
        </div>
        {/* Move Nudge with custom step */}
        <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/70 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              Move Position (Nudge)
            </span>
            <span id="nudge-step-label" className="font-mono text-[10px] text-amber-400">
              step: 8%
            </span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-700/60 rounded-xl p-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">
              Step
            </span>
            <input type="number" id="nudge-amount" defaultValue="8" min="0.1" max="10000" step="0.5" onInput={() => { actions.saveNudgeConfig() }} className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-amber-500" />
            <select id="nudge-unit" onChange={() => { actions.saveNudgeConfig() }} className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-amber-500">
              <option value="percent" selected="">
                % of overlay size
              </option>
              <option value="px">
                screen pixels
              </option>
              <option value="km">
                kilometers
              </option>
            </select>
          </div>
          <label className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer">
            <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5">
              <Icon name="keyboard" className="w-3.5 h-3.5 text-amber-400" />
              {' Arrow keys nudge (Shift ×5 · Alt ×0.2) '}
            </span>
            <input type="checkbox" id="nudge-keys" checked="" onChange={() => { actions.saveNudgeConfig() }} className="w-4 h-4 accent-amber-400 rounded" />
          </label>
          <div className="grid grid-cols-3 gap-1.5 max-w-[200px] mx-auto">
            <div></div>
            <button onClick={() => { actions.nudgeImage(1, 0) }} className="p-2 bg-slate-700 hover:bg-slate-600 active:bg-amber-500 rounded-xl text-slate-200 flex items-center justify-center">
              <Icon name="chevron-up" className="w-4 h-4" />
            </button>
            <div></div>
            <button onClick={() => { actions.nudgeImage(0, -1) }} className="p-2 bg-slate-700 hover:bg-slate-600 active:bg-amber-500 rounded-xl text-slate-200 flex items-center justify-center">
              <Icon name="chevron-left" className="w-4 h-4" />
            </button>
            <button onClick={() => { actions.recenterImageToMap() }} className="p-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl text-[10px] font-bold flex items-center justify-center">
              Center
            </button>
            <button onClick={() => { actions.nudgeImage(0, 1) }} className="p-2 bg-slate-700 hover:bg-slate-600 active:bg-amber-500 rounded-xl text-slate-200 flex items-center justify-center">
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
            <div></div>
            <button onClick={() => { actions.nudgeImage(-1, 0) }} className="p-2 bg-slate-700 hover:bg-slate-600 active:bg-amber-500 rounded-xl text-slate-200 flex items-center justify-center">
              <Icon name="chevron-down" className="w-4 h-4" />
            </button>
            <div></div>
          </div>
          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            Nudges use the reference-zoom projection, so a step means the same distance regardless of your current zoom.
          </p>
        </div>
        {/* Opacity Slider */}
        <div>
          <div className="flex justify-between text-xs text-slate-300 mb-1">
            <span>
              Opacity
            </span>
            <span id="opacity-val" className="font-mono text-amber-400">
              70%
            </span>
          </div>
          <input type="range" min="0" max="100" defaultValue="70" id="image-opacity-slider" className="w-full accent-amber-400 bg-slate-700 rounded-lg h-2" onInput={(e) => { actions.setImageOpacity(e.currentTarget.value) }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { actions.toggleImageHandles() }} id="btn-toggle-handles" className="p-2.5 bg-slate-800 border border-slate-700 text-xs rounded-xl text-amber-300 flex items-center justify-center gap-1.5 active:bg-slate-700">
            <Icon name="lock" className="w-3.5 h-3.5" />
            {' Lock Handles '}
          </button>
          <button onClick={() => { actions.removeReferenceImage() }} className="p-2.5 bg-rose-950/40 border border-rose-800/60 text-xs rounded-xl text-rose-300 flex items-center justify-center gap-1.5 active:bg-rose-900/60">
            <Icon name="trash-2" className="w-3.5 h-3.5" />
            {' Remove '}
          </button>
        </div>
      </div>
    </div>
  );
}
