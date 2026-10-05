import { Icon } from '../lib/icons';
import actions from '../engine/actions';
export function AppHeader() {
  return (
    <header id="app-header" className="absolute top-3 left-3 right-3 lg:left-[96px] lg:right-4 z-30 flex items-center justify-between pointer-events-none">
      <div className="bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg border border-slate-700/60 flex items-center gap-2 pointer-events-auto">
        <Icon name="map" className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-bold text-slate-200">
          GeoJSON Studio
        </span>
        <span id="land-engine-status" className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-semibold">
          Loading Coastlines...
        </span>
        <span id="perf-chip" className="hidden sm:inline bg-slate-800/80 text-slate-400 text-[9px] px-2 py-0.5 rounded-full font-mono" title="Live shape count and stats compute time">
          0 shapes
        </span>
      </div>
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Undo / Redo */}
        <div className="bg-slate-900/90 backdrop-blur-md rounded-full shadow-lg border border-slate-700/60 flex items-center overflow-hidden">
          <button onClick={() => { actions.undoHistory() }} id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo" className="p-2 text-slate-200 hover:text-emerald-300 disabled:opacity-35 active:scale-95 transition">
            <Icon name="undo-2" className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-slate-700"></span>
          <button onClick={() => { actions.redoHistory() }} id="btn-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="p-2 text-slate-200 hover:text-emerald-300 disabled:opacity-35 active:scale-95 transition">
            <Icon name="redo-2" className="w-4 h-4" />
          </button>
        </div>
        {/* Interactive Guide */}
        <button onClick={() => { actions.startTutorial() }} title="Open the interactive guide" aria-label="Open the interactive guide" className="bg-slate-900/90 backdrop-blur-md p-2 rounded-full shadow-lg border border-slate-700/60 text-slate-200 hover:text-emerald-300 active:scale-95 transition">
          <Icon name="help-circle" className="w-4 h-4" />
        </button>
        {/* Select Country / Province On Map (always on the map, never in a panel) */}
        <button onClick={() => { actions.toggleSelectOnMapMode() }} id="btn-pick-header" title="Click any country or province on the map to load it" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <span className="w-2 h-2 rounded-full bg-slate-500" id="indicator-pick-header"></span>
          <span>
            {'Pick: '}
            <b id="text-pick-header" className="text-slate-400">
              OFF
            </b>
          </span>
        </button>
        {/* Delete On Map (always on the map, never in a panel) */}
        <button onClick={() => { actions.toggleDeleteMode() }} id="btn-delete-header" title="Click any shape on the map to delete it" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <span className="w-2 h-2 rounded-full bg-slate-500" id="indicator-delete-header"></span>
          <span>
            {'Delete: '}
            <b id="text-delete-header" className="text-slate-400">
              OFF
            </b>
          </span>
        </button>
        {/* Merge Regions On Map (always on the map, never in a panel) */}
        <button onClick={() => { actions.toggleMergeMode() }} id="btn-merge-header" title="Tap regions on the map to merge them into one" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <span className="w-2 h-2 rounded-full bg-slate-500" id="indicator-merge-header"></span>
          <span>
            {'Merge: '}
            <b id="text-merge-header" className="text-slate-400">
              OFF
            </b>
          </span>
        </button>
        {/* Magnetic Snapping Toggle */}
        <button onClick={() => { actions.toggleSnappingMode() }} id="btn-snap-header" title="Magnetic Snapping: connects vertices to existing shape edges & corners" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" id="indicator-snap-header"></span>
          <Icon name="magnet" className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            {'Snap: '}
            <b id="text-snap-header" className="text-emerald-400">
              ON
            </b>
          </span>
        </button>
        {/* Auto Sea-Cut Toggle */}
        <button onClick={() => { actions.toggleAutoSeaCut() }} id="btn-auto-seacut" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <span className="w-2 h-2 rounded-full bg-slate-500" id="indicator-auto-seacut"></span>
          <span>
            {'Auto-Cut: '}
            <b id="text-auto-seacut" className="text-slate-400">
              OFF
            </b>
          </span>
        </button>
        {/* Latitude-Longitude Grid Alignment Overlay */}
        <button onClick={() => { actions.toggleLatLngGrid() }} id="btn-grid-header" title="Toggle Latitude-Longitude alignment grid overlay" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <span className="w-2 h-2 rounded-full bg-slate-500" id="indicator-grid-header"></span>
          <Icon name="grid-3x3" className="w-3.5 h-3.5 text-sky-400" />
          <span>
            {'Grid: '}
            <b id="text-grid-header" className="text-slate-400">
              OFF
            </b>
          </span>
        </button>
        {/* Map Legend Toggle */}
        <button onClick={() => { toggleMapLegend() }} id="btn-legend-header" title="Toggle Map Legend" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <Icon name="layers-3" className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            {'Legend '}
            <b id="badge-legend-count-header" className="text-emerald-300 font-mono text-[10px]">
              0
            </b>
          </span>
        </button>
        {/* Community Creations Explorer */}
        <button onClick={() => { actions.toggleDrawer('creations-drawer') }} id="btn-creations-header" title="Explore Community Creations" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 flex items-center gap-1.5 active:scale-95 transition">
          <Icon name="compass" className="w-3.5 h-3.5 text-amber-400" />
          <span>
            Community
          </span>
          <span id="badge-creations-count-header" className="bg-amber-500/20 text-amber-300 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold">
            2
          </span>
        </button>
        {/* Upload Creation */}
        <button onClick={() => { openUploadCreationModal() }} id="btn-upload-header" title="Upload and publish creation with preview" className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3 py-1.5 rounded-full shadow-lg shadow-emerald-900/40 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition">
          <Icon name="cloud-upload" className="w-3.5 h-3.5" />
          <span>
            Upload
          </span>
        </button>
        {/* User Auth (Google & Discord) */}
        <button onClick={() => { openAuthModal() }} id="btn-auth-header" title="Sign In with Google or Discord" className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 active:scale-95 transition">
          <Icon name="user" className="w-3.5 h-3.5 text-sky-400" />
          <span id="text-auth-user">
            Sign In
          </span>
        </button>
        {/* Settings & Appearance */}
        <button onClick={() => { actions.toggleDrawer('settings-drawer') }} title="Settings, Theme & Layout" aria-label="Settings" className="bg-slate-900/90 backdrop-blur-md p-2 rounded-full shadow-lg border border-slate-700/60 text-slate-200 hover:text-emerald-300 active:scale-95 transition">
          <Icon name="settings" className="w-4 h-4" />
        </button>
        {/* GPS Recenter */}
        <button onClick={() => { actions.locateUser() }} className="bg-slate-900/90 backdrop-blur-md p-2 rounded-full shadow-lg border border-slate-700/60 text-slate-200 hover:text-white active:scale-95 transition">
          <Icon name="crosshair" className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
