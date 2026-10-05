import { Icon } from '../lib/icons';
import actions from '../engine/actions';
export function TutorialOverlay() {
  return (
    <div id="tutorial-overlay" className="fixed inset-0 z-[70] hidden pointer-events-none">
      <div id="tutorial-pos" className="w-full h-full flex items-center justify-center p-4 transition-all duration-300">
        <div id="tutorial-card" className="pointer-events-auto w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl shadow-black/60 flex flex-col max-h-[88vh] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-500/15 rounded-lg text-emerald-400">
                <Icon name="graduation-cap" className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold tracking-wide uppercase text-slate-200">
                GeoJSON Studio Guide
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span id="tutorial-counter" className="text-[10px] font-mono text-slate-400">
                1 / 12
              </span>
              <button onClick={() => { actions.endTutorial(true) }} title="Close guide" className="p-1 text-slate-400 hover:text-white">
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-5 overflow-y-auto">
            <div className="flex items-start gap-3 mb-3.5">
              <div id="tutorial-icon-box" className="p-2.5 bg-slate-800 rounded-xl text-emerald-400 shrink-0">
                <Icon name="sparkles" className="w-5 h-5" id="tutorial-icon" />
              </div>
              <div className="min-w-0">
                <h4 id="tutorial-title" className="text-sm font-bold text-white leading-tight">
                  Welcome
                </h4>
                <p id="tutorial-subtitle" className="text-[10px] text-slate-400 font-mono mt-0.5">
                  —
                </p>
              </div>
            </div>
            <div id="tutorial-body" className="text-xs text-slate-300 leading-relaxed space-y-2.5"></div>
          </div>
          {/* Interactive action button for the current step */}
          <div id="tutorial-cta-wrap" className="px-5 pb-3.5 hidden">
            <button onClick={() => { actions.tutorialCTA() }} id="tutorial-cta" className="w-full px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-emerald-600/60 rounded-xl text-[11px] font-bold text-emerald-300 flex items-center justify-center gap-2 active:scale-[0.98] transition">
              Action
            </button>
          </div>
          <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => { actions.minimizeTutorial() }} title="Minimize the guide and keep working" className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 shrink-0 active:scale-95 transition">
                <Icon name="minus" className="w-3.5 h-3.5" />
              </button>
              <div id="tutorial-dots" className="flex items-center gap-1.5 flex-wrap"></div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => { actions.tutorialPrev() }} id="tutorial-prev" className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[11px] font-bold text-slate-200 active:scale-95 transition">
                Back
              </button>
              <button onClick={() => { actions.tutorialNext() }} id="tutorial-next" className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl text-[11px] font-bold text-white active:scale-95 transition">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TourSpot() {
  return (
    <div id="tour-spot" className="hidden pointer-events-none fixed z-[65] rounded-2xl transition-all duration-200" style={{ boxShadow: '0 0 0 2px rgba(52,211,153,.95), 0 0 0 9999px rgba(2,6,23,.62), 0 0 30px rgba(52,211,153,.45)' }}>
      <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400/80 tour-ring"></div>
    </div>
  );
}

export function TourCall() {
  return (
    <div id="tour-call" className="hidden pointer-events-none fixed z-[66]">
      <div id="tour-call-inner" className="bg-emerald-500 text-slate-950 text-[10px] font-black px-2.5 py-1 rounded-full shadow-xl shadow-emerald-900/50 whitespace-nowrap flex items-center gap-1">
        <Icon name="mouse-pointer-click" className="w-3 h-3" />
        <span id="tour-call-text">
          here
        </span>
      </div>
    </div>
  );
}

export function TutorialPill() {
  return (
    <button id="tutorial-pill" onClick={() => { actions.expandTutorial() }} className="hidden fixed bottom-24 right-4 z-[75] bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold pl-3.5 pr-4 py-2.5 rounded-full shadow-2xl shadow-emerald-950/60 items-center gap-2 active:scale-95 transition">
      <Icon name="graduation-cap" className="w-4 h-4" />
      <span id="tutorial-pill-text">
        Guide
      </span>
    </button>
  );
}
