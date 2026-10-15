import { Icon } from '../lib/icons';
import actions from '../engine/actions';
export function ShortcutSheet() {
  return (
    <div id="shortcut-sheet" role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h3 id="shortcut-title" className="text-xs font-bold uppercase tracking-wide text-emerald-400 flex items-center gap-2">
            <Icon name="keyboard" className="w-4 h-4" />
            {' Keyboard Shortcuts '}
          </h3>
          <button onClick={() => { actions.toggleShortcutSheet(false) }} aria-label="Close shortcuts" className="p-1 text-slate-400 hover:text-white">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-x-5 gap-y-2.5 text-[11px] text-slate-300 max-h-[70vh] overflow-y-auto">
          <div className="flex justify-between gap-2">
            <span>
              Undo
            </span>
            <span>
              <kbd>
                Ctrl
              </kbd>
              <kbd>
                Z
              </kbd>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Redo
            </span>
            <span>
              <kbd>
                Ctrl
              </kbd>
              <kbd>
                Y
              </kbd>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Draw polygon
            </span>
            <kbd>
              D
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Style panel
            </span>
            <kbd>
              S
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Export panel
            </span>
            <kbd>
              E
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Animate panel (vector morph)
            </span>
            <kbd>
              A
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Load country (search box, Enter loads)
            </span>
            <kbd>
              L
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Map & borders
            </span>
            <kbd>
              B
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Overlay panel
            </span>
            <kbd>
              O
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Pick regions
            </span>
            <kbd>
              P
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Merge mode
            </span>
            <kbd>
              M
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Merge the picked regions (in merge mode)
            </span>
            <kbd>
              Enter
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Delete mode
            </span>
            <kbd>
              X
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Cut sea
            </span>
            <kbd>
              C
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Duplicate shape
            </span>
            <span>
              <kbd>
                Ctrl
              </kbd>
              <kbd>
                D
              </kbd>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Zoom to selection
            </span>
            <kbd>
              F
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Fit all shapes
            </span>
            <span>
              <kbd>
                Shift
              </kbd>
              <kbd>
                F
              </kbd>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Delete selected
            </span>
            <kbd>
              Del
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Lat/Lng Grid
            </span>
            <kbd>
              G
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Settings
            </span>
            <kbd>
              ,
            </kbd>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              Close / cancel (also abandons the shape being drawn)
            </span>
            <kbd>
              Esc
            </kbd>
          </div>
          <div className="flex justify-between gap-2 col-span-2 pt-1 border-t border-slate-800">
            <span>
              Show this list
            </span>
            <kbd>
              ?
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
