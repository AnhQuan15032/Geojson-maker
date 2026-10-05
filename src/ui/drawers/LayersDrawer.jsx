import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
export function LayersDrawer() {
  return (
    <div id="layers-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-indigo-400 flex items-center gap-2">
          <Icon name="layers" className="w-4 h-4" />
          {' Map Base & Boundaries '}
        </h3>
        <button onClick={() => { actions.closeDrawers() }} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      <label className="text-[11px] font-semibold text-slate-400 uppercase mb-2 block">
        Base Map Layer
      </label>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button onClick={() => { actions.setBaseMap('standard') }} data-base="standard" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="map" className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Standard
            <br />
            <span className="text-[9px] text-slate-400">
              OSM Streets
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('voyager') }} data-base="voyager" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="compass" className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Voyager
            <br />
            <span className="text-[9px] text-slate-400">
              Clean & colorful
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('light') }} data-base="light" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="sun" className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Light
            <br />
            <span className="text-[9px] text-slate-400">
              Minimal light gray
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('dark') }} data-base="dark" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="moon" className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Dark
            <br />
            <span className="text-[9px] text-slate-400">
              Minimal dark gray
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('satellite') }} data-base="satellite" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="globe" className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Satellite
            <br />
            <span className="text-[9px] text-slate-400">
              Esri imagery
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('hybrid') }} data-base="hybrid" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="layers" className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Satellite +
            <br />
            <span className="text-[9px] text-slate-400">
              Imagery & labels
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('terrain') }} data-base="terrain" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="mountain" className="w-4 h-4 text-orange-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Terrain
            <br />
            <span className="text-[9px] text-slate-400">
              OpenTopoMap
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('humanitarian') }} data-base="humanitarian" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="heart-handshake" className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Humanitarian
            <br />
            <span className="text-[9px] text-slate-400">
              OSM HOT style
            </span>
          </span>
        </button>
      </div>
      <label className="text-[11px] font-semibold text-slate-400 uppercase mb-2 mt-2 block">
        {'Vector Styles '}
        <span className="text-[9px] text-indigo-400 normal-case">
          · powered by MapLibre GL
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button onClick={() => { actions.setBaseMap('ml_liberty') }} data-base="ml_liberty" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="globe" className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Liberty
            <br />
            <span className="text-[9px] text-slate-400">
              Vector · full detail
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('ml_bright') }} data-base="ml_bright" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="sun-medium" className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Bright
            <br />
            <span className="text-[9px] text-slate-400">
              Vector · vivid
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('ml_positron') }} data-base="ml_positron" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="square-dashed-bottom" className="w-4 h-4 text-slate-300 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Positron
            <br />
            <span className="text-[9px] text-slate-400">
              Vector · clean light
            </span>
          </span>
        </button>
        <button onClick={() => { actions.setBaseMap('ml_darkmatter') }} data-base="ml_darkmatter" className="base-btn p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 text-slate-200 flex items-center gap-2 transition active:scale-95">
          <Icon name="moon-star" className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-[11px] font-medium text-left leading-tight">
            Dark Matter
            <br />
            <span className="text-[9px] text-slate-400">
              Vector · crisp dark
            </span>
          </span>
        </button>
      </div>
      <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
        {' Tip: use a Light/Dark minimal base while tracing, then switch to Satellite to verify against real imagery. '}
      </p>
      <label className="text-[11px] font-semibold text-slate-400 uppercase mb-2 block">
        Administrative Borders
      </label>
      <div className="space-y-2">
        <label className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700/70 rounded-xl cursor-pointer">
          <div className="flex items-center gap-2">
            <Icon name="globe-2" className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-200">
              Country Borders
            </span>
          </div>
          <input type="checkbox" id="layer-countries" checked="" onChange={() => { actions.toggleBorderOverlay('countries') }} className="w-4 h-4 accent-indigo-500 rounded" />
        </label>
        <label className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700/70 rounded-xl cursor-pointer">
          <div className="flex items-center gap-2">
            <Icon name="landmark" className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-slate-200">
              State & Province Borders
            </span>
          </div>
          <input type="checkbox" id="layer-states" checked="" onChange={() => { actions.toggleBorderOverlay('states') }} className="w-4 h-4 accent-indigo-500 rounded" />
        </label>
        <label className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700/70 rounded-xl cursor-pointer">
          <div className="flex items-center gap-2">
            <Icon name="tag" className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-slate-200">
              Border & Place Labels
            </span>
          </div>
          <input type="checkbox" id="layer-labels" checked="" onChange={() => { actions.toggleBorderOverlay('labels') }} className="w-4 h-4 accent-indigo-500 rounded" />
        </label>
      </div>
      <label className="text-[11px] font-semibold text-slate-400 uppercase mb-2 mt-4 block">
        Load Country GeoJSON
      </label>
      <div className="bg-slate-800/80 p-3 rounded-2xl border border-indigo-800/50 space-y-2.5 mb-4">
        <label className="block">
          <span className="text-[9px] uppercase text-slate-400 font-bold">
            Detail
          </span>
          <select id="countries-level" onChange={() => { actions.resetCountryIndex() }} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500">
            <option value="110m">
              110m — light
            </option>
            <option value="50m" selected="">
              50m — balanced
            </option>
            <option value="10m">
              10m — full detail
            </option>
          </select>
        </label>
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2">
          <Icon name="search" className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <input id="country-search" placeholder="Search a country — Vietnam, Brazil…" onInput={() => { actions.onCountrySearchInput() }} onFocus={() => { actions.ensureCountryIndex() }} className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none" />
        </div>
        <label className="block">
          <span className="text-[9px] uppercase text-slate-400 font-bold">
            Load as
          </span>
          <select id="countries-load-mode" onChange={() => { actions.onLoadModeChange() }} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500">
            <option value="country" selected="">
              Country outline
            </option>
            <option value="adm1plus">
              Country + all its provinces
            </option>
            <option value="adm1">
              Province / State — search by name
            </option>
            <option value="adm2">
              Districts — pick a country first
            </option>
          </select>
        </label>
        <div id="country-results" className="max-h-44 overflow-y-auto space-y-1.5 pr-1 hidden"></div>
        <label className="flex items-center justify-between p-2 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer">
          <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5">
            <Icon name="waves" className="w-3.5 h-3.5 text-cyan-400" />
            {' Load with real coastline borders '}
          </span>
          <input type="checkbox" id="country-refine" className="w-4 h-4 accent-cyan-500 rounded" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { actions.toggleSelectOnMapMode() }} id="btn-select-on-map" className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="mouse-pointer-click" className="w-3.5 h-3.5 text-indigo-300" />
            <span id="select-on-map-label">
              Select on map: OFF
            </span>
          </button>
          <button onClick={() => { actions.deleteSelectedLoaded() }} className="p-2.5 bg-rose-900/60 hover:bg-rose-800 border border-rose-700/70 rounded-xl text-[10px] font-bold text-rose-100 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="trash-2" className="w-3.5 h-3.5" />
            {' Delete selected '}
          </button>
        </div>
        {/* One single colour for every loaded country / province */}
        <div className="flex items-center gap-1.5 bg-slate-900/60 border border-emerald-800/40 rounded-xl p-2">
          <input type="color" id="single-color" defaultValue="#10b981" className="w-8 h-7 rounded-lg bg-transparent border-0 cursor-pointer shrink-0" />
          <select id="single-color-scope" className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-emerald-500">
            <option value="countries" selected="">
              Loaded countries / provinces
            </option>
            <option value="all">
              Every shape on the map
            </option>
          </select>
          <button onClick={() => { actions.applySingleColorToAll() }} className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[10px] font-bold text-white flex items-center justify-center gap-1 active:scale-95 transition shrink-0">
            <Icon name="paint-bucket" className="w-3.5 h-3.5" />
            {' One colour '}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { actions.removeLoadedCountries() }} className="flex-1 p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[11px] font-bold text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="eraser" className="w-3.5 h-3.5" />
            {' Clear Loaded '}
          </button>
          <span id="countries-count" className="text-[10px] font-mono text-slate-400">
            none
          </span>
        </div>
        <div id="countries-status" className="text-[10px] font-mono text-slate-400 leading-relaxed">
          Search a name to load that exact country — arrives as one editable shape with its real border.
        </div>
      </div>
      <label className="text-[11px] font-semibold text-slate-400 uppercase mb-2 block">
        Coastline Detail Level
      </label>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <button onClick={() => { actions.setCoastlineLevel('low') }} data-coast="low" className="coast-btn p-2 bg-slate-800 border border-slate-700 rounded-xl text-[11px] text-slate-200 hover:bg-slate-700 active:scale-95 transition">
          {' 110m'}
          <br />
          <span className="text-[9px] text-slate-400">
            Fast
          </span>
        </button>
        <button onClick={() => { actions.setCoastlineLevel('medium') }} data-coast="medium" className="coast-btn p-2 bg-slate-800 border border-slate-700 rounded-xl text-[11px] text-slate-200 hover:bg-slate-700 active:scale-95 transition">
          {' 50m'}
          <br />
          <span className="text-[9px] text-slate-400">
            Balanced
          </span>
        </button>
        <button onClick={() => { actions.setCoastlineLevel('high') }} data-coast="high" className="coast-btn p-2 bg-slate-800 border border-slate-700 rounded-xl text-[11px] text-slate-200 hover:bg-slate-700 active:scale-95 transition">
          {' 10m'}
          <br />
          <span className="text-[9px] text-slate-400">
            Max detail
          </span>
        </button>
      </div>
      <div id="coastline-status" className="text-[10px] text-slate-400 mb-1.5 font-mono">
        Loading 50m coastlines...
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        {' Drives the Sea Cutter and the auto-georeference engine. 10m is a bigger download (~6 MB) but traces the finest bays, inlets and islands. For true survey-grade detail, use the live OSM coastline below. '}
      </p>
      {/* SUPER-DETAIL REAL COASTLINE (OSM) */}
      <div className="bg-slate-800/80 p-3 rounded-2xl border border-cyan-800/50 space-y-2.5 mt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Icon name="waves" className="w-3.5 h-3.5 text-cyan-400" />
            {' Super-Detail Coastline '}
          </span>
          <span id="osm-coast-status" className="text-[10px] font-mono text-slate-400">
            not loaded
          </span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          <b className="text-slate-200">
            Real coastline, live from OpenStreetMap
          </b>
          {' — survey-grade detail far beyond Natural Earth. '}
          <b className="text-cyan-300">
            ⚡ Fast coast
          </b>
          {' streams vector tiles, so it loads '}
          <b className="text-slate-200">
            wide areas
          </b>
          {' (any viewport size) in seconds. Then make shapes or countries follow the real coast, or add the coastline to the map. '}
        </p>
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-700/60 rounded-xl p-2">
          <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">
            Snap tolerance
          </span>
          <input type="number" id="osm-tolerance" defaultValue="300" min="20" max="20000" step="10" className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-cyan-500" />
          <span className="text-[10px] text-slate-500">
            meters
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { actions.fetchFastCoastTiles() }} id="btn-osm-fast" className="p-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-[10px] font-bold text-white flex flex-col items-center justify-center gap-1 active:scale-95 transition">
            <Icon name="zap" className="w-4 h-4" />
            {' ⚡ Fast coast (wide area) '}
          </button>
          <button onClick={() => { actions.fetchOsmCoastlineAction() }} id="btn-osm-fetch" className="p-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-cyan-200 flex flex-col items-center justify-center gap-1 active:scale-95 transition">
            <Icon name="microscope" className="w-4 h-4" />
            {' Retina (Overpass) '}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { actions.addOsmCoastAsShape() }} className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-cyan-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="plus-circle" className="w-3.5 h-3.5" />
            {' Add coast to map '}
          </button>
          <button onClick={() => { actions.refineSelectionWithTilesCoast() }} className="p-2.5 bg-teal-700 hover:bg-teal-600 rounded-xl text-[10px] font-bold text-white flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="scan-line" className="w-3.5 h-3.5" />
            {' Borders → real coast '}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { actions.boostCoastDetail() }} className="p-2.5 bg-gradient-to-r from-blue-700 to-cyan-700 hover:from-blue-600 hover:to-cyan-600 rounded-xl text-[10px] font-bold text-white flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="arrow-up-narrow-wide" className="w-3.5 h-3.5" />
            {' Boost selected area '}
          </button>
          <button onClick={() => { actions.simplifySelectedCoast() }} className="p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="scissors-line-dashed" className="w-3.5 h-3.5" />
            {' Simplify selected '}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[9px] uppercase text-slate-400 font-bold">
              Tile quality
            </span>
            <select id="coast-quality" className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-[10px] text-slate-200 focus:outline-none focus:border-cyan-500">
              <option value="72">
                Fast (72 tiles)
              </option>
              <option value="180" selected="">
                High (180 tiles)
              </option>
              <option value="360">
                Extreme (360 tiles)
              </option>
            </select>
          </label>
          <label className="block">
            <span className="text-[9px] uppercase text-slate-400 font-bold">
              Simplify tolerance
            </span>
            <input type="number" id="coast-simplify" defaultValue="50" min="1" max="5000" step="5" className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-cyan-500" />
          </label>
        </div>
        <button onClick={() => { actions.snapSelectionToOsmCoast() }} className="w-full p-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-[11px] rounded-xl flex items-center justify-center gap-2 transition">
          <Icon name="target" className="w-4 h-4" />
          {' Snap selected border onto the coast '}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => { actions.clearOsmCoastline() }} className="flex-1 p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-bold text-slate-300 flex items-center justify-center gap-1.5 active:scale-95 transition">
            <Icon name="eraser" className="w-3.5 h-3.5" />
            {' Clear fetched coast '}
          </button>
          <span className="text-[9px] text-slate-500">
            © OpenStreetMap
          </span>
        </div>
      </div>
    </div>
  );
}
