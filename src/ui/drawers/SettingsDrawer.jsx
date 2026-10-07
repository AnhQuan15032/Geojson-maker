import { useEffect, useState } from 'react';
import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
import { getSettings, setCloudEnabled, subscribeSettings } from '../../lib/settings';
import { showToast } from '../../engine/uiHelpers';

export function SettingsDrawer() {
  const [cloudEnabled, setCloudEnabledState] = useState(getSettings().cloudEnabled);

  useEffect(() => {
    const unsub = subscribeSettings((s) => setCloudEnabledState(!!s.cloudEnabled));
    return unsub;
  }, []);

  const toggleCloud = (checked) => {
    setCloudEnabled(checked);
    showToast(checked ? 'Cloud sync enabled — maps will sync via Cloudflare' : 'Cloud sync disabled — maps stay local');
    // trigger a storage refresh in case drawer is open
    try {
      const el = document.getElementById('creations-drawer');
      if (el) el.dispatchEvent(new CustomEvent('refresh'));
    } catch {}
  };

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

      {/* 0. CLOUD SYNC — now first, opt-in disabled by default */}
      <div className={`p-3.5 rounded-2xl border space-y-2.5 mb-4 ${cloudEnabled ? 'bg-violet-950/30 border-violet-700/40' : 'bg-slate-800/80 border-slate-700/60'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="cloud" className={`w-4 h-4 ${cloudEnabled ? 'text-violet-400' : 'text-slate-500'}`} />
            Cloud Sync
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black tracking-wide ${cloudEnabled ? 'bg-violet-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {cloudEnabled ? 'ON' : 'OFF'}
            </span>
            {!cloudEnabled && <span className="text-[10px] font-medium text-slate-500">• disabled by default</span>}
          </span>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input type="checkbox" checked={cloudEnabled} onChange={(e) => toggleCloud(e.currentTarget.checked)} className="sr-only peer" />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {cloudEnabled
            ? <>Syncs your maps to <b className="text-violet-300">Cloudflare KV</b> (1 MB quota). Discover, uploads, and <span className="text-slate-200">Discord</span> avatar require it. Disable to keep everything in <b className="text-slate-300">localStorage</b> only.</>
            : <>Cloud is <b className="text-slate-200">off</b>. Maps stay in your browser (still have <b className="text-emerald-300">Discover → Load</b> demos). Turn on to sync across devices via Cloudflare — needs <b className="text-[#5865F2]">Discord sign-in</b>.</>}
        </p>
        <div className="flex gap-2">
          <button onClick={() => { actions.closeDrawers(); setTimeout(()=> { try{ window.dispatchEvent(new CustomEvent('show-welcome', { detail:{force:true}})); }catch{} }, 300); }} className="text-[11px] px-2.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium">
            Show welcome again
          </button>
          {cloudEnabled && (
            <button onClick={() => { actions.toggleDrawer('creations-drawer'); }} className="text-[11px] px-2.5 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-bold">
              Open Discover
            </button>
          )}
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
            <span id="status-latlng-grid-settings" className="text-[10px] font-bold text-slate-400">
              OFF
            </span>
            <input type="checkbox" id="toggle-latlng-grid-settings" onChange={(e) => { actions.toggleLatLngGrid(e.currentTarget.checked) }} className="w-4 h-4 accent-sky-500 rounded" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Overlays an adaptive geographic graticule with coordinates (
          <b className="text-sky-300">°N/°S, °E/°W</b>
          ) directly on the map for precise spatial alignment. Press
          <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300 font-mono text-[9px]">G</kbd>
          anytime to toggle.
        </p>
      </div>

      {/* 2. ISLAND COASTLINE COMBINING */}
      <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-cyan-800/50 space-y-2 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="combine" className="w-4 h-4 text-cyan-400" />
            Unified Island Region (MultiPolygon)
          </span>
          <span className="text-[10px] font-bold text-cyan-400">ACTIVE</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          All islands in a drawn area after cutting coastlines are preserved in a
          <b className="text-cyan-300"> single unified region</b>. Styling, editing, and exporting applies to mainland and all islands together.
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
          Displays coordinate badges (
          <b className="text-emerald-300">P1 • 34.5°N, 36.1°E</b>
          ) and distance increments below each polygon vertex while drawing.
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
