// Split out of the original single-file engine (see legacy/index.html).
// Origin: (preamble)  ·  GUI THEME ENGINE  ·  GUI LAYOUT ENGINE  ·  TEXT SIZE ENGINE  ·  LOAD COUNTRIES AS EDITABLE GEOJSON  ·  CURVED EDGES — ALIGHT MOTION STYLE (v2)  ·  BASE MAPS & BORDERS  ·  COALESCED STATS ENGINE  ·  UNDO / REDO HISTORY  ·  INTERACTIVE TUTORIAL

export const BASE_MAP_LABELS = {
  standard: 'Standard (OSM Streets)',
  voyager: 'Voyager',
  light: 'Light Gray',
  dark: 'Dark Gray',
  satellite: 'Satellite Imagery',
  hybrid: 'Satellite + Labels',
  terrain: 'Terrain (OpenTopoMap)',
  humanitarian: 'Humanitarian (HOT)',
  ml_liberty: 'Liberty (MapLibre vector)',
  ml_bright: 'Bright (MapLibre vector)',
  ml_positron: 'Positron (MapLibre vector)',
  ml_darkmatter: 'Dark Matter (MapLibre vector)'
};

export const PREVIEW_COLOR = '#10b981';

export const LAND_SOURCES = {
  low: {
    file: 'land-110m.json',
    label: '110m'
  },
  medium: {
    file: 'land-50m.json',
    label: '50m'
  },
  high: {
    file: 'land-10m.json',
    label: '10m'
  }
};

export const curveStore = new Map();

export const CURVE_DEFAULT_AMOUNT = 0.35;

export const ADM1_SOURCES = ['https://cdn.jsdelivr.net/npm/natural-earth-vector@5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson', 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector/geojson/ne_50m_admin_1_states_provinces.geojson', 'https://cdn.jsdelivr.net/npm/natural-earth-vector@5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson'];

export const adminMetaCache = {};

export const OVERLAY_REF_ZOOM = 12;

export const GUI_THEMES = [{
  id: 'dark',
  name: 'Dark Slate',
  border: '#475569',
  color: '#0f172a',
  accent: '#38bdf8'
}, {
  id: 'oled',
  name: 'Midnight OLED',
  border: '#334155',
  color: '#000000',
  accent: '#60a5fa'
}, {
  id: 'cyber',
  name: 'Cyberpunk',
  border: '#a855f7',
  color: '#0b0818',
  accent: '#f43f5e'
}, {
  id: 'emerald',
  name: 'Emerald Forest',
  border: '#10b981',
  color: '#04140f',
  accent: '#34d399'
}, {
  id: 'amber',
  name: 'Warm Sunset',
  border: '#f59e0b',
  color: '#160e08',
  accent: '#fbbf24'
}, {
  id: 'navy',
  name: 'Deep Navy',
  border: '#3b82f6',
  color: '#081024',
  accent: '#93c5fd'
}, {
  id: 'light',
  name: 'Clean Light',
  border: '#cbd5e1',
  color: '#ffffff',
  accent: '#0284c7'
}];

export const GUI_LAYOUTS = [{
  id: 'default',
  name: 'Default',
  desc: 'Floating bar + bottom sheet',
  icon: 'layout'
}, {
  id: 'compact',
  name: 'Compact',
  desc: 'Slim header, 20% more canvas',
  icon: 'minimize-2'
}, {
  id: 'rail',
  name: 'Docked Rail',
  desc: 'Expanded sidebar controls',
  icon: 'panel-left'
}, {
  id: 'minimal',
  name: 'Zen Canvas',
  desc: 'Distraction-free HUD',
  icon: 'eye'
}];

export const TEXT_SIZES = [{
  id: 'compact',
  name: '85%',
  label: 'Compact',
  scale: '85%'
}, {
  id: 'normal',
  name: '100%',
  label: 'Normal',
  scale: '100%'
}, {
  id: 'large',
  name: '115%',
  label: 'Large',
  scale: '115%'
}, {
  id: 'xlarge',
  name: '130%',
  label: 'Extra',
  scale: '130%'
}];

export const GRID_CELL = 10;

export const CURVE_REF_ZOOM = 14;

export const MAPLIBRE_STYLES = {
  ml_liberty: {
    style: 'https://tiles.openfreemap.org/styles/liberty',
    label: 'Liberty (vector)'
  },
  ml_bright: {
    style: 'https://tiles.openfreemap.org/styles/bright',
    label: 'Bright (vector)'
  },
  ml_positron: {
    style: 'https://tiles.openfreemap.org/styles/positron',
    label: 'Positron (vector)'
  },
  ml_darkmatter: {
    style: 'https://tiles.openfreemap.org/styles/dark',
    label: 'Dark Matter (vector)'
  }
};

export const statsElCache = {};

export const HISTORY_LIMIT = 30;

export const HISTORY_MAX_FEATURES = 400;

export const TUTORIAL_STEPS = [{
  icon: 'sparkles',
  title: 'Welcome to GeoJSON Studio',
  subtitle: 'draw real geography · export as vectors & video',
  drawer: null,
  body: `<p>Turn rough sketches on any map into <b class="text-emerald-300">real, exportable vector geography</b>.</p>
        <ul class="list-disc pl-4 space-y-1">
          <li><b>Draw</b> regions on 8 base map styles.</li>
          <li><b>Cut</b> them to real coastlines, <b>split</b> and <b>roughen</b> borders.</li>
          <li><b>Load</b> any country's true border by name.</li>
          <li><b>Export</b> to Alight Motion (1080×1920), GeoJSON, SVG, KML or transparent PNG.</li>
        </ul>
        <p class="text-slate-400">This one-minute tour touches every tool. Use ← / → or the buttons below.</p>`
}, {
  icon: 'layers',
  title: 'Base Maps & Borders',
  subtitle: 'Borders button',
  drawer: 'layers-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li><b>8 base styles:</b> Standard, Voyager, Light, Dark, Satellite, Satellite + Labels, Terrain, Humanitarian.</li>
          <li>Overlay <b>country borders</b>, <b>state/province borders</b> and <b>place labels</b> independently.</li>
          <li>Tip: trace on <b>Light/Dark</b> for contrast, then switch to <b>Satellite</b> to verify reality.</li>
        </ul>`
}, {
  icon: 'pen-tool',
  title: 'Draw Shapes',
  subtitle: 'Draw button',
  drawer: 'draw-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li><b>Polygon / Line / Rectangle / Marker</b> — tap the map to place vertices.</li>
          <li>Every polygon gets a <b>unique color, 100% fill and 0 px border</b> automatically.</li>
          <li><b>Edit Nodes</b> lets you drag vertices; <b>Delete Shape</b> removes the selection or the last shape.</li>
        </ul>`
}, {
  icon: 'palette',
  title: 'Style & Rename',
  subtitle: 'Tap any shape, or press Style',
  drawer: 'style-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Tap a shape to select it — the inspector opens with its real name.</li>
          <li><b>Rename</b> it and pick any fill color, or roll a <b>New Unique Color</b>.</li>
          <li>From here you can also <b>Cut Sea</b> or <b>Delete</b> the shape.</li>
        </ul>`
}, {
  icon: 'split',
  title: 'Split Shape With A Line',
  subtitle: 'Draw drawer → Split panel',
  drawer: 'draw-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Press <b>Draw Split Line</b>, then click points straight <b>or bent</b> across a polygon.</li>
          <li>Double-click / double-tap to finish.</li>
          <li>The shape is severed along your exact path into <b>two new polygons</b> — <i>Region (A)</i> and <i>Region (B)</i>.</li>
        </ul>`
}, {
  icon: 'scissors',
  title: 'Sea Cutter',
  subtitle: 'scissors button / Auto-Cut switch',
  drawer: null,
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Draw a rough coastal region, then press <b>Cut Sea</b> — it snaps to the real coastline.</li>
          <li>Enable <b>Auto-Cut</b> (header) to trim every new polygon as you draw it.</li>
          <li>Coastline fidelity is chosen in the Borders drawer: <b>110m / 50m / 10m</b>.</li>
        </ul>`
}, {
  icon: 'globe-2',
  title: 'Load Any Country',
  subtitle: 'Borders → Load Country GeoJSON',
  drawer: 'layers-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Pick a detail level, then <b>search a name</b> — try “Vietnam”.</li>
          <li>It loads as <b>one editable shape</b> with its true border, real name and a unique color, and the map zooms to it.</li>
          <li><b>Clear Loaded</b> removes every country you loaded.</li>
        </ul>`
}, {
  icon: 'waves',
  title: 'Natural Border Detailener',
  subtitle: 'Style drawer → Detailener',
  drawer: 'style-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Fractal midpoint subdivision makes straight borders <b>look like organic coastlines</b>.</li>
          <li>Tune <b>intensity</b>, <b>roughness</b> and <b>depth</b>; roll a <b>Seed</b> for new variants.</li>
          <li>Endpoints never move — area and footprint stay the same. <b>Undo</b> restores the original outline.</li>
        </ul>`
}, {
  icon: 'map-pinned',
  title: 'Make Part Of The Map',
  subtitle: 'Style drawer → Bake Into Map',
  drawer: 'style-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Bakes your shapes into <b>real map tiles</b>: crisp at every zoom, sitting <b>beneath borders and labels</b>.</li>
          <li>Edits, recolors and splits <b>auto-rebake</b>.</li>
          <li><b>Unbake</b> returns them to fully editable vectors.</li>
        </ul>`
}, {
  icon: 'image',
  title: 'Reference Image Overlay',
  subtitle: 'Overlay button',
  drawer: 'image-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Upload a map image and trace over it (opacity, scale, rotate-free handles, never stretched).</li>
          <li><b>Auto Place:</b> Fit View · Fit Shapes · Cover View.</li>
          <li>Fine nudge with a <b>custom step</b> (% · px · km) via the D-pad or <b>arrow keys</b> (Shift ×5, Alt ×0.2).</li>
        </ul>`
}, {
  icon: 'crosshair',
  title: 'Auto-Georeference Engine',
  subtitle: 'Overlay drawer → Detect Outlines & Place',
  drawer: 'image-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li>Extracts the linework from your image and <b>matches it against real coastlines & borders</b>.</li>
          <li>Recovers exact position, scale and rotation — with a confidence score and a two-way alignment readout.</li>
          <li><b>Undo Detection</b> restores the previous placement.</li>
        </ul>`
}, {
  icon: 'download',
  title: 'Export Everything',
  subtitle: 'Export button',
  drawer: 'export-drawer',
  body: `<ul class="list-disc pl-4 space-y-1">
          <li><b>Alight Motion .xml</b> — a 1080×1920 project with native vector paths, ready to animate.</li>
          <li><b>.geojson · .svg · KML .xml · transparent PNG</b> for GIS, design and compositing.</li>
          <li>Live stats (area, shape count) and JSON viewer with copy & load.</li>
        </ul>
        <p class="text-slate-400">That's the whole toolkit — hit the <b>“?”</b> in the header anytime to replay this guide.</p>`
}];

export const DRAWER_BUTTON_LABELS = {
  'draw-drawer': 'Draw',
  'style-drawer': 'Style',
  'layers-drawer': 'Borders',
  'image-drawer': 'Overlay',
  'export-drawer': 'Export',
  'animate-drawer': 'Animate'
};

export const CARD_BASE_CLASS = 'pointer-events-auto w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden transition-all duration-300';

export const TUTORIAL_TARGETS = [{
  targets: ['[onclick="startTutorial()"]'],
  label: 'Reopen this guide'
}, {
  targets: ['#layers-drawer .base-btn', '[onclick="toggleDrawer(\'layers-drawer\')"]'],
  label: 'Base map layers'
}, {
  targets: ['#draw-drawer button[onclick="setDrawMode(\'Polygon\')"]', '[onclick="toggleDrawer(\'draw-drawer\')"]'],
  label: 'Drawing tools'
}, {
  targets: ['#style-prop-name', '[onclick="openStyleDrawerForActive()"]'],
  label: 'Style inspector'
}, {
  targets: ['#btn-split', '[onclick="toggleDrawer(\'draw-drawer\')"]'],
  label: 'Split with a line'
}, {
  targets: ['[onclick="triggerCutSeaNow()"]'],
  label: 'Cut Sea'
}, {
  targets: ['#country-search', '[onclick="toggleDrawer(\'layers-drawer\')"]'],
  label: 'Country search'
}, {
  targets: ['#roughen-amp', '[onclick="openStyleDrawerForActive()"]'],
  label: 'Border detailener'
}, {
  targets: ['#bake-status', '[onclick="openStyleDrawerForActive()"]'],
  label: 'Bake into map'
}, {
  targets: ['#nudge-amount', '[onclick="toggleDrawer(\'image-drawer\')"]'],
  label: 'Nudge step'
}, {
  targets: ['#btn-georef-run', '[onclick="toggleDrawer(\'image-drawer\')"]'],
  label: 'Detect & place'
}, {
  targets: ['[onclick="downloadAlightMotionXML()"]', '[onclick="toggleDrawer(\'export-drawer\')"]'],
  label: 'Alight Motion export'
}];

export const TOUR_BASE_ORDER = ['standard', 'voyager', 'light', 'dark', 'satellite', 'hybrid', 'terrain', 'humanitarian'];
