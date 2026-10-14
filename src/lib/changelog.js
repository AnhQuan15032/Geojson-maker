export const CHANGELOG = [
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
