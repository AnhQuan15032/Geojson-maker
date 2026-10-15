import { Icon } from '../lib/icons';
import actions from '../engine/actions';

// Floating toolbar shown while Merge mode is on (desktop and mobile): how
// many regions are picked, and the Merge / Clear / Done buttons right where
// the user is tapping — no trip back into the Draw panel. The engine
// (merge.js → updateMergeModeUI / setMergeStatus) toggles `visible`, writes
// the texts and enables the Merge button once two regions are picked.
export function MergeBar() {
  return (
    <div id="merge-bar" role="toolbar" aria-label="Merge picked regions">
      <span className="merge-bar-dot" aria-hidden="true">
        <Icon name="combine" className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div id="merge-bar-title" className="text-[11px] font-bold text-white truncate">
          Merge mode
        </div>
        <div id="merge-bar-hint" className="text-[9px] text-violet-200/80 truncate">
          Tap the regions to fuse
        </div>
      </div>
      <button onClick={() => { actions.clearMergeSelection(true) }} id="btn-merge-bar-clear" className="merge-bar-action text-amber-300" title="Clear the picked regions" aria-label="Clear picked regions">
        <Icon name="x" className="w-4 h-4" />
      </button>
      <button onClick={() => { actions.executeMerge() }} id="btn-merge-bar-run" className="merge-bar-run" title="Fuse the picked regions into one shape">
        <Icon name="git-merge" className="w-4 h-4" />
        <span id="merge-bar-run-label">Merge</span>
      </button>
      <button onClick={() => { actions.toggleMergeMode() }} id="btn-merge-bar-done" className="merge-bar-action text-slate-200" title="Leave merge mode (Esc)" aria-label="Leave merge mode">
        <Icon name="check" className="w-4 h-4" />
      </button>
    </div>
  );
}
