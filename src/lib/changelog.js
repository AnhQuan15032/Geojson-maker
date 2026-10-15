export const CHANGELOG = [
  {
    version: '1.5.1',
    date: '2026-10-15',
    title: 'Drawing — fast clicks never zoom, no hint box under the cursor',
    changes: [
      'Clicking or tapping quickly while drawing places points and never zooms the map — double-click zoom is paused for the draw session only (wheel, pinch, buttons and keyboard still zoom) and comes back once the shape is finished',
      'The "Click first marker to finish" box that trailed the cursor is gone',
      'Esc abandons the shape being drawn; it also really stops Line, Rectangle, Marker and split-line sessions',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-15',
    title: 'Graph editor for the easing, one-key country loading, load a country twice',
    changes: [
      'Animate panel: Alight-Motion-style graph editor — drag the two white handles, type x1 y1 x2 y2, preset chips, Mirror; a dashed playhead rides the curve while the preview runs',
      'The custom curve previews and exports as cubicBezier x1 y1 x2 y2, printed exactly as Alight Motion prints it; it is remembered across reloads',
      'Press L (or the Country rail button / mobile-menu entry) to jump to the country search — now the first block of the Map panel; Enter loads the first match, Esc clears, Recent chips reload in one tap',
      'The country index is warmed during idle time at start-up and kept in Cache Storage, so the first search answers at once — also offline after the first visit; typing filters instantly',
      'Load the same country again: each pick adds another copy (Vietnam (2), (3)…) with its own colour instead of zooming to the existing one',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-10-15',
    title: 'Animator — bridges start on the coast, only what changes moves, dateline shapes whole',
    changes: [
      'Island bridges are planned on the full-detail coastline, so every hair-thin bridge leaves exactly from the drawn shore — never from a point inland',
      'Least-motion matching: coastline the two shapes share stays exactly still; only the region that actually changes moves (Russia → Russia + Ukraine: 364 of 384 points stay put)',
      'Shapes cut at the dateline (Russia, Wrangel Island) are brought round and sewn back together for the animation, so the whole mainland is in the preview and the export, framed tightly',
      'Nothing is dropped while the shape fits the point budget; islands the thinned coast would cut through are dropped instead of drawn across, folded coasts are straightened',
      'Status shows how many points stay put and how many move',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-14',
    title: 'Animator — Mercator export, many morphs, islands bridged',
    changes: [
      'Alight Motion export now uses Web Mercator — the same projection as the map, so exported shapes and animations look exactly like they do on screen',
      'Add as many From → To morphs as you want (Add morph); each becomes its own keyframed layer and its own preview ghost, playing all together or one after another',
      'Islands and holes are animated: every part is joined into one outline by a 0.02 px invisible bridge (like Age of History 2 provinces) — no extra borders, drawn vertices stay put',
      'Point budget is shared across parts by outline length; tiny islands that cannot get 4 points are dropped and reported in the status',
      'Status reports each morph (points, additions, tangles, parts + holes + bridges); the total time shows the play mode',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-10-14',
    title: 'Fix — Russia drew as bands across the map (antimeridian)',
    changes: [
      'Countries and coastlines that cross ±180° (Russia, Fiji, Antarctica, the Cut Sea landmass) are now cut at the antimeridian when they load — no more horizontal bands across the whole world',
      'Cause: the world-atlas data is stitched across the dateline (a ring jumps straight from 179.9°E to 180°W); a flat map draws that jump as a map-wide edge',
      'Antarctica is filled again — it was stored as a pole cap with the coastline as a hole',
      'Applied to the country index, provinces index, Cut Sea landmass, auto-georeference border mesh and GeoJSON import; shapes already drawn are unaffected',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-14',
    title: 'Vector Auto-Animator — morph shape 1 into shape 2',
    changes: [
      'New Animate panel (rail button, mobile menu, shortcut A): draw two shapes and the first morphs into the second',
      'Missing points are added to the sparser shape along its outline (drawn vertices never move); start vertex and winding are aligned so nothing swirls or flips',
      'Every candidate correspondence is checked at 9 intermediate frames — the one with no self-crossings and the least travel wins',
      'Preview on the map as a dashed ghost polygon, with the same timing and easing as the export; Esc stops it',
      'Export as an Alight Motion project (.xml) with keyframed outline points (<path><contour><knot><p><kf …>) — hold, morph duration, hold, optional return (A → B → A), 5 easing presets, optional animated fill colour, optional static layers for the other shapes',
      'Alight Motion exporter refactored into reusable projection / shape / scene builders (same output as before)',
    ],
  },
  {
    version: '1.2.7',
    date: '2026-10-14',
    title: 'Cut Sea — No Islands Mode',
    changes: [
      'New no-islands mode for Cut Sea — keep only the mainland and drop every island inside your drawn area, instead of uniting them into one multi-part region',
      'Islands pill in the header and mobile rail (Islands: ON = united with the mainland, OFF = mainland only), plus a proper toggle in Settings',
      'New one-shot button in the Style panel — Cut Sea (Mainland Only) trims the current selection without changing your saved mode',
      'Works with Auto-Cut: enable the mode once and every coastline trim that follows keeps the mainland only',
      'The result records what happened — islandsRemoved and noIslandsMode properties on the trimmed shape',
      'Fixed — islandCount and the other Cut Sea properties were silently stripped from the shape before export',
    ],
  },
  {
    version: '1.2.6',
    date: '2026-10-14',
    title: 'Draw Split Polygon + Split & Delete Polygon',
    changes: [
      'New polygon blade — draw a closed ring over the selected shape and it is cut into the part inside your ring and the part outside (two editable shapes)',
      'New Split & Delete Polygon — the area you draw is erased and the remainder survives, like a cookie-cutter eraser',
      'Both polygon tools honour the existing lock: only the pre-selected region can be cut, and selection cannot change mid-draw',
      'Robustness — sliver/empty pieces are ignored, unclosed rings are closed, self-intersecting blades are rejected, and a UI refresh error can no longer report a successful cut as failed',
      'Fixed a shape-loss case — a blade that only touches the edge is now a clean no-op instead of removing the shape mid-cut',
    ],
  },
  {
    version: '1.2.5',
    date: '2026-10-14',
    title: 'Simpler UI — Explorer, logins & legends removed',
    changes: [
      'Deleted Map Explorer (Discover drawer) — no demo presets, no featured maps',
      'Deleted the logins demo — Discord/sign-in buttons, auth modal and local auth storage removed (Worker auth + KV storage files deleted)',
      'Deleted Map Legend — floating legend panel, header button and mobile menu entry removed',
      'Moved Load Continents into the Map panel (Map Base & Boundaries) — 7 continents load as editable polygons right next to country search',
      'Welcome screen simplified: no sign-in step, points at Map → Continents instead',
    ],
  },
  {
    version: '1.2.4',
    date: '2026-10-12',
    title: 'Locked split, split & delete, offline turf',
    changes: [
      'Split is now locked to the pre-selected region — you cannot pick another shape while drawing the blade',
      'Added Split & Delete mode — same blade, but the smaller half is removed automatically (trim / erase part of a shape)',
      'Fixed "Turf unavailable" offline — heavy libs expose window.turf/topojson and every consumer falls back to the import',
      'Fixed country Load buttons in Map Base & Boundaries — data-country-id + delegated click handler, works even if inline onclick is blocked',
    ],
  },
  {
    version: '1.2.3',
    date: '2026-10-07',
    title: 'Fix coastline bug, actual continent load',
    changes: [
      'Fixed coastline bug — loadGlobalLandmass now 3-CDN fallback, clears promise, allows retry, validates list',
      'Actual continent load — real Natural Earth 110m countries grouped by CONTINENT and unioned with turf, cached, fallback to rough',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-10-07',
    title: 'Delete storage, fix Load, add continents',
    changes: [
      'Deleted storage — no localStorage, no quota, no My Maps, no Share links',
      'Fixed Load button not clickable — now pointer-events auto, waits for map, both click and touch',
      'Added Load continents — Africa, Europe, Asia, N/S America, Oceania, Antarctica as editable shapes',
      'Discover now shows Continents (7) + Featured demos (2) = 9 presets, no cloud',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-10-07',
    title: 'Share via link (cloud deleted)',
    changes: [
      'Share via link — #share=... URL for any map, no KV needed',
      'Local-only storage 1 MB quota (replaced by delete in 1.2.2)',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-07',
    title: 'Cloud + Auth + Discover',
    changes: [
      'Cloudflare KV storage — 1 MB per-user quota with live meter (opt-in, disabled by default)',
      'Discord OAuth with profile pictures (avatar via cdn.discordapp.com)',
      'Upload GeoJSON (.geojson/.json) or publish current canvas from Upload modal',
      'Discover maps page — public maps, newest first, tap Load to import',
      'Changelog drawer + API (/api/changelog)',
      'Alight Motion export verified fix (M/L close, stroke attrs, large IDs)',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-10-05',
    title: 'Deploy fixes',
    changes: [
      'prepare builds dist if missing — fixes Workers Builds no-dist error',
      'wrangler.json name geojson-maker matches workers.dev hostname',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-05',
    title: 'Vite + React migration',
    changes: [
      'Split 9,415-line single file into 63 Vite + React modules',
      'Tailwind, lucide-react, Vitest parity tests (37)',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-30',
    title: 'Initial',
    changes: [
      'Draw, split, merge, coast tiles, editors',
      'Exporters: Alight Motion, SVG, KML, PNG',
    ],
  },
];

export async function fetchChangelog() {
  try {
    const r = await fetch('/api/changelog', { credentials: 'include' });
    if (r.ok) {
      const j = await r.json();
      if (j.changelog) return j.changelog;
    }
  } catch {}
  return CHANGELOG;
}
