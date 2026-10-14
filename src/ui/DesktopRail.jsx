import { Icon } from '../lib/icons';
import actions from '../engine/actions';
export function DesktopRail() {
  return (
    <aside id="desktop-rail" className="hidden lg:flex fixed left-4 top-4 bottom-4 z-30 w-[68px] flex-col items-center gap-1.5 bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/60 py-3 overflow-y-auto">
      <div className="p-1.5 bg-emerald-500/15 rounded-xl text-emerald-400 mb-1" title="GeoJSON Studio">
        <Icon name="map" className="w-5 h-5" />
      </div>
      <button onClick={() => { actions.toggleDrawer('draw-drawer') }} title="Drawing Tools" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-emerald-400 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="pen-tool" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Draw
        </span>
      </button>
      <button onClick={() => { actions.triggerCutSeaNow() }} title="Cut Sea From Polygon" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-cyan-400 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="scissors" className="w-5 h-5" />
        <span className="text-[9px] font-bold">
          Cut Sea
        </span>
      </button>
      <button onClick={() => { actions.openStyleDrawerForActive() }} title="Region Style Inspector" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-emerald-400 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="palette" className="w-5 h-5" />
        <span className="text-[9px] font-bold">
          Style
        </span>
      </button>
      <button onClick={() => { actions.toggleLatLngGrid() }} id="btn-grid-rail" title="Toggle Latitude-Longitude alignment grid overlay" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-sky-300 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="grid-3x3" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Grid
        </span>
      </button>
      <button onClick={() => { actions.toggleDrawer('image-drawer') }} title="Reference Image Overlay" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-amber-400 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="image" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Overlay
        </span>
      </button>
      <button onClick={() => { actions.toggleDrawer('layers-drawer') }} title="Maps & Borders" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-indigo-400 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="layers" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Borders
        </span>
      </button>
      <button onClick={() => { actions.openAnimateDrawer() }} id="btn-animate-rail" title="Animate — morph one shape into another and export as Alight Motion keyframes (A)" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-violet-300 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="clapperboard" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Animate
        </span>
      </button>
      <button onClick={() => { actions.toggleDrawer('export-drawer') }} title="Export (Alight Motion, GeoJSON, SVG, KML, PNG)" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-emerald-400 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="download" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Export
        </span>
      </button>
      <button onClick={() => { actions.toggleDrawer('settings-drawer') }} id="btn-settings-rail" title="Settings, Theme & Layout" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-emerald-300 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="settings" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Settings
        </span>
      </button>
      <button onClick={() => { actions.startTutorial() }} title="Interactive Guide" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-emerald-300 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="graduation-cap" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Guide
        </span>
      </button>
      <button onClick={() => { actions.toggleSelectOnMapMode() }} id="btn-pick-rail" title="Pick a country / province by clicking the map" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-indigo-300 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="mouse-pointer-click" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Pick
        </span>
      </button>
      <button onClick={() => { actions.toggleDeleteMode() }} id="btn-delete-rail" title="Delete shapes by clicking the map" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-rose-300 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="trash-2" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Delete
        </span>
      </button>
      <button onClick={() => { actions.toggleMergeMode() }} id="btn-merge-rail" title="Tap regions to merge them into one" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-violet-300 hover:bg-slate-800 active:scale-95 transition">
        <Icon name="combine" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          Merge
        </span>
      </button>
      <div className="flex-1"></div>
      <button onClick={() => { actions.locateUser() }} title="Center on GPS" className="flex flex-col items-center gap-1 p-2.5 w-[56px] rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition">
        <Icon name="crosshair" className="w-5 h-5" />
        <span className="text-[9px] font-medium">
          GPS
        </span>
      </button>
    </aside>
  );
}
