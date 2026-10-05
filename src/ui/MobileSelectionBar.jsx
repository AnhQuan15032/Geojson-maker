import { Icon } from '../lib/icons';
import actions from '../engine/actions';
export function MobileSelectionBar() {
  return (
    <div id="mobile-selection-bar" className="lg:hidden">
      <span id="mobile-selection-color" className="w-3 h-3 rounded-full bg-emerald-400 shrink-0"></span>
      <div className="min-w-0 flex-1 leading-tight">
        <div id="mobile-selection-name" className="text-[11px] font-bold text-white truncate">
          Selected shape
        </div>
        <div id="mobile-selection-type" className="text-[9px] text-slate-400 truncate">
          Polygon
        </div>
      </div>
      <button onClick={() => { actions.triggerCutSeaNow() }} className="mobile-selection-action text-cyan-300" aria-label="Cut sea">
        <Icon name="scissors" className="w-4 h-4" />
      </button>
      <button onClick={() => { actions.openStyleDrawerForActive() }} className="mobile-selection-action text-emerald-300" aria-label="Edit style">
        <Icon name="sliders-horizontal" className="w-4 h-4" />
      </button>
      <button onClick={() => { actions.deleteSelectedOrLast() }} className="mobile-selection-action text-rose-300" aria-label="Delete shape">
        <Icon name="trash-2" className="w-4 h-4" />
      </button>
    </div>
  );
}
