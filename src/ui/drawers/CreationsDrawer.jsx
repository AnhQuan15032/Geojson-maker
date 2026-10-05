import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';

export function CreationsDrawer() {
  return (
    <div id="creations-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200 flex items-center gap-2">
          <Icon name="compass" className="w-4 h-4 text-amber-400" />
          {' Community Creations '}
          <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono">2</span>
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">Explore what others have drawn — tap to load a creation onto your map.</p>
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700/60 overflow-hidden">
          <div className="h-32 bg-gradient-to-br from-emerald-900/40 via-sky-900/30 to-amber-900/30 grid place-items-center">
            <Icon name="map" className="w-8 h-8 text-emerald-400/70" />
          </div>
          <div className="p-3.5">
            <div className="text-xs font-bold text-white">Vietnam Coastline Study</div>
            <div className="text-[11px] text-slate-400">by demo_user · 12 shapes · 3.4k views</div>
            <button onClick={() => { actions.showToast('Loaded "Vietnam Coastline Study" (demo)'); actions.closeDrawers(); }} className="mt-2 w-full py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white">Load</button>
          </div>
        </div>
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700/60 overflow-hidden">
          <div className="h-32 bg-gradient-to-br from-fuchsia-900/40 via-indigo-900/30 to-slate-900 grid place-items-center">
            <Icon name="mountain" className="w-8 h-8 text-fuchsia-400/70" />
          </div>
          <div className="p-3.5">
            <div className="text-xs font-bold text-white">Alpine Borders</div>
            <div className="text-[11px] text-slate-400">by geo_artist · 8 shapes · 1.2k views</div>
            <button onClick={() => { actions.showToast('Loaded "Alpine Borders" (demo)'); actions.closeDrawers(); }} className="mt-2 w-full py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white">Load</button>
          </div>
        </div>
      </div>
      <button onClick={() => { actions.openUploadCreationModal() }} className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5">
        <Icon name="cloud-upload" className="w-4 h-4" /> Publish your creation
      </button>
    </div>
  );
}
