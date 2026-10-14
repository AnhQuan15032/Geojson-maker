import { useEffect, useState } from 'react';
import { Icon } from '../lib/icons';
import { getSettings, setWelcomeCompleted } from '../lib/settings';

export function WelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const s = getSettings();
    const t = setTimeout(() => {
      if (!s.welcomeCompleted) setVisible(true);
    }, 900);
    const handler = (e) => {
      if (e.detail?.force) setVisible(true);
    };
    window.addEventListener('show-welcome', handler);
    return () => { clearTimeout(t); window.removeEventListener('show-welcome', handler); };
  }, []);

  if (!visible) return null;

  const dismiss = (completed = true) => {
    if (completed) setWelcomeCompleted(true);
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center justify-center p-0 lg:p-4 bg-slate-950/60 backdrop-blur-[6px]">
      <div className="w-full lg:max-w-[420px] bg-slate-900 border border-slate-700/60 rounded-t-[28px] lg:rounded-[28px] shadow-[0_24px_64px_rgba(2,6,23,0.65)] overflow-hidden animate-[dockIn_0.4s_cubic-bezier(.2,.8,.26,1)] max-h-[92dvh] flex flex-col">
        {/* hero */}
        <div className="relative bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-600 p-6 pb-8 text-white overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-emerald-400/15 rounded-full blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur grid place-items-center border border-white/15">
              <Icon name="map" className="w-5 h-5 text-white" />
            </div>
            <button onClick={() => dismiss(true)} className="w-8 h-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 text-white/80">
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
          <h2 className="relative mt-4 text-[22px] font-black leading-tight tracking-tight">
            Welcome to<br/>GeoJSON Studio
          </h2>
          <p className="relative mt-2 text-[13px] leading-relaxed text-white/80">
            Draw, load, and export vector maps. <b className="text-white">Load continents</b> or any country as editable shapes.
          </p>
          <div className="relative mt-4 flex items-center gap-2 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full border border-white/15">
              <Icon name="globe-2" className="w-3.5 h-3.5" /> 7 continents
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full border border-white/15">
              <Icon name="layers" className="w-3.5 h-3.5" /> Map panel
            </span>
          </div>
        </div>

        {/* body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-600/15 text-cyan-400 grid place-items-center shrink-0 border border-cyan-500/20">
              <Icon name="globe-2" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Load continents</div>
              <div className="text-xs text-slate-400 leading-relaxed">Open <span className="text-cyan-300">Map → Continents</span> (the Layers panel) to add Africa, Europe, Asia… as <b className="text-slate-200">editable polygons</b>. Also use search for any country.</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/15 text-emerald-400 grid place-items-center shrink-0 border border-emerald-500/20">
              <Icon name="scissors" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Cut to coastline</div>
              <div className="text-xs text-slate-400 leading-relaxed">Draw a shape, then <b className="text-white">Cut Sea</b> to trim it to real coastlines. Use <b className="text-white">Split</b> to divide shapes.</div>
            </div>
          </div>

          <div className="pt-1 grid gap-2">
            <button onClick={() => dismiss(true)} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 active:scale-[0.98] transition">
              <Icon name="arrow-right" className="w-5 h-5" />
              Start mapping
            </button>
            <p className="text-[11px] text-center text-slate-500">No storage — everything is loaded fresh. Export to GeoJSON / SVG / PNG.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
