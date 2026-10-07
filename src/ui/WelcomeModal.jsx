import { useEffect, useState } from 'react';
import { Icon } from '../lib/icons';
import { getSettings, setWelcomeCompleted } from '../lib/settings';
import { getUser } from '../lib/auth';

export function WelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // show only once per browser, and not if already signed in
    const s = getSettings();
    const u = getUser();
    // delay a bit so map loads first
    const t = setTimeout(() => {
      if (!s.welcomeCompleted && !u) {
        // also check if we already have an auth_user in storage (returning user)
        try {
          const hasAuth = localStorage.getItem('auth_user') || localStorage.getItem('demo_auth_user');
          if (!hasAuth) setVisible(true);
          else setWelcomeCompleted(true);
        } catch { setVisible(true); }
      }
    }, 900);
    // also listen for external trigger (e.g., settings "show welcome again")
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

  const goDiscord = () => {
    setWelcomeCompleted(true);
    // go to real Discord OAuth; worker will handle demo fallback if needed
    location.href = '/api/auth/discord';
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
            Draw, sculpt, and export vector maps. Sign in with <b className="text-white">Discord</b> to sync your creations to the cloud.
          </p>
          <div className="relative mt-4 flex items-center gap-2 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full border border-white/15">
              <Icon name="hard-drive" className="w-3.5 h-3.5" /> 1 MB cloud
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full border border-white/15">
              <Icon name="shield-check" className="w-3.5 h-3.5" /> Optional
            </span>
          </div>
        </div>

        {/* body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/15 text-violet-400 grid place-items-center shrink-0 border border-violet-500/20">
              <Icon name="compass" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Discover & Publish</div>
              <div className="text-xs text-slate-400 leading-relaxed">Browse community maps, publish your current canvas, or upload any <span className="text-slate-200">.geojson</span>.</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/15 text-emerald-400 grid place-items-center shrink-0 border border-emerald-500/20">
              <Icon name="cloud-upload" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Cloud is opt-in</div>
              <div className="text-xs text-slate-400 leading-relaxed">Cloud sync is <b className="text-slate-200">disabled by default</b>. Turn it on in <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">Settings → Cloud Sync</span> when you want cross-device storage.</div>
            </div>
          </div>

          <div className="pt-1 grid gap-2">
            <button onClick={goDiscord} className="w-full py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30 active:scale-[0.98] transition">
              <Icon name="message-circle" className="w-5 h-5" />
              Continue with Discord
            </button>
            <button onClick={() => dismiss(true)} className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm active:scale-[0.98] transition">
              Continue without signing in
            </button>
            <p className="text-[11px] text-center text-slate-500">You can enable cloud later in Settings. Local maps work offline.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
