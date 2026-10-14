import { Icon } from '../lib/icons';
import actions from '../engine/actions';

export function MobileNav() {
  return (
    <nav id="mobile-nav" className="lg:hidden" aria-label="Primary tools">
      <button onClick={() => { actions.toggleDrawer('layers-drawer') }} data-drawer="layers-drawer" className="mobile-dock-item group">
        <span className="w-10 h-10 grid place-items-center rounded-2xl bg-slate-800 group-[.is-active]:bg-indigo-600/20 group-[.is-active]:text-indigo-400 transition">
          <Icon name="layers-3" className="w-5 h-5" />
        </span>
        <span>Map</span>
      </button>
      <button onClick={() => { actions.openStyleDrawerForActive() }} data-drawer="style-drawer" className="mobile-dock-item group">
        <span className="w-10 h-10 grid place-items-center rounded-2xl bg-slate-800 group-[.is-active]:bg-pink-600/20 group-[.is-active]:text-pink-400 transition">
          <Icon name="palette" className="w-5 h-5" />
        </span>
        <span>Style</span>
      </button>

      {/* FAB — Draw */}
      <button onClick={() => { actions.toggleDrawer('draw-drawer') }} data-drawer="draw-drawer" className="mobile-dock-item mobile-draw-action group">
        <span className="w-[58px] h-[58px] grid place-items-center rounded-[20px] bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_12px_28px_rgba(16,185,129,0.45)] border-[3px] border-slate-900 group-[.is-active]:from-emerald-400 group-[.is-active]:to-teal-500 transition">
          <Icon name="pen-tool" className="w-6 h-6" />
        </span>
        <span className="text-white font-black">Draw</span>
      </button>

      <button onClick={() => { actions.toggleDrawer('image-drawer') }} data-drawer="image-drawer" className="mobile-dock-item group">
        <span className="w-10 h-10 grid place-items-center rounded-2xl bg-slate-800 group-[.is-active]:bg-amber-500/15 group-[.is-active]:text-amber-400 transition">
          <Icon name="image" className="w-5 h-5" />
        </span>
        <span>Overlay</span>
      </button>
      <button onClick={() => { actions.toggleDrawer('export-drawer') }} data-drawer="export-drawer" className="mobile-dock-item group">
        <span className="w-10 h-10 grid place-items-center rounded-2xl bg-slate-800 group-[.is-active]:bg-sky-500/15 group-[.is-active]:text-sky-400 transition">
          <Icon name="share" className="w-5 h-5" />
        </span>
        <span>Export</span>
      </button>
    </nav>
  );
}
