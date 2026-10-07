export const CHANGELOG = [
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
