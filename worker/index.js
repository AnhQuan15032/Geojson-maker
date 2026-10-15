const CHANGELOG = [
  { version: '1.5.0', date: '2026-10-15', title: 'Graph editor, one-key country loading, load a country twice', changes: ['Animate panel: Alight-Motion-style graph editor — drag the white handles, type values, presets, Mirror, playhead on the curve', 'Custom curve previews and exports as cubicBezier x1 y1 x2 y2, remembered across reloads', 'Press L to jump to the country search (first block of the Map panel); Enter loads the first match; Recent chips; index warmed at start-up and cached offline', 'Loading a loaded country adds another copy — Vietnam (2), (3)…'] },
  { version: '1.4.1', date: '2026-10-15', title: 'Animator — bridges on the coast, least-motion morph, dateline shapes whole', changes: ['Island bridges leave exactly from the drawn coastline, never from inland', 'Only the region that changes moves — shared coastline stays still (Russia → Russia + Ukraine: 364 of 384 points stay put)', 'Shapes cut at the dateline are brought round and sewn back together for the animation', 'Nothing is dropped while the shape fits the budget; islands a thinned coast would cut through are dropped instead of drawn across'] },
  { version: '1.4.0', date: '2026-10-14', title: 'Animator — Mercator export, many morphs, islands bridged', changes: ['Alight Motion export now uses Web Mercator — the same projection as the map', 'Add as many From → To morphs as you want; each becomes its own keyframed layer, playing all together or one after another', 'Islands and holes are animated as one outline joined by 0.02 px invisible bridges (Age of History 2 style) — no extra borders', 'Point budget shared across parts; tiny islands that cannot get 4 points are dropped and reported'] },
  { version: '1.3.1', date: '2026-10-14', title: 'Fix — Russia drew as bands across the map (antimeridian)', changes: ['Countries and coastlines crossing ±180° (Russia, Fiji, Antarctica, Cut Sea landmass) are cut at the antimeridian on load — no more map-wide bands', 'Cause: world-atlas data is stitched across the dateline; a flat map draws the jump as a world-wide edge', 'Antarctica is filled again', 'Applied to the country index, provinces index, Cut Sea landmass, georeference border mesh and GeoJSON import'] },
  { version: '1.3.0', date: '2026-10-14', title: 'Vector Auto-Animator — morph shape 1 into shape 2', changes: ['New Animate panel (rail button, mobile menu, shortcut A) — the first shape morphs into the second', 'Sparser shape gets extra points along its outline; start vertex + winding aligned; crossings rejected at 9 sampled frames', 'Preview on the map; export as Alight Motion .xml with keyframed outline knots, holds, easing presets, A → B → A and animated fill colour'] },
  { version: '1.2.7', date: '2026-10-14', title: 'Cut Sea — No Islands Mode', changes: ['New no-islands mode — keep only the mainland, drop every island in your drawn area', 'Islands pill in the header and mobile rail, plus a Settings toggle', 'One-shot Cut Sea (Mainland Only) button in the Style panel', 'Works with Auto-Cut — set the mode once, every trim follows it', 'Fixed: islandCount and the other Cut Sea properties were stripped before export'] },
  { version: '1.2.6', date: '2026-10-14', title: 'Draw Split Polygon + Split & Delete Polygon', changes: ['New polygon blade — cut the selected shape into inside / outside pieces', 'New Split & Delete Polygon — the drawn area is erased, the remainder survives', 'Both tools honour the lock: only the pre-selected region can be cut', 'Sliver pieces ignored, unclosed rings closed, self-intersecting blades rejected'] },
  { version: '1.2.5', date: '2026-10-14', title: 'Simpler UI — Explorer, logins & legends removed', changes: ['Deleted Map Explorer (Discover drawer)', 'Deleted the logins demo — Discord/sign-in buttons, auth modal, Worker auth + KV storage files', 'Deleted Map Legend panel and its toggles', 'Moved Load Continents into the Map panel (Map Base & Boundaries)', 'Welcome screen simplified — no sign-in step'] },
  { version: '1.2.4', date: '2026-10-12', title: 'Locked split, split & delete, offline turf', changes: ['Split locked to the pre-selected region', 'Added Split & Delete mode (removes the smaller half)', 'Fixed Turf unavailable offline — window.turf fallback everywhere', 'Fixed country Load buttons via data-country-id + delegated click'] },
  { version: '1.2.1', date: '2026-10-07', title: 'Share via link — no cloud', changes: ['Removed Cloudflare KV cloud (build token 10041 fix)', 'Sharing is now local + URL hash #share=... — anyone with the link can Load', 'Discover shows demos + local public maps + shared hash', 'Discord is now local display name (no OAuth Worker needed)', 'Welcome screen updated, Settings → Sharing', 'Mobile GUI upgraded'] },
  { version: '1.2.0', date: '2026-10-07', title: 'Cloud + Auth + Discover', changes: ['Cloudflare KV storage 1 MB quota (now removed)', 'Discord OAuth (now local)', 'Upload GeoJSON + publish current map', 'Discover maps page', 'Storage meter', 'Changelog drawer', 'Alight Motion export verified fix'] },
  { version: '1.1.1', date: '2026-10-05', title: 'Deploy fixes', changes: ['prepare builds dist if missing','wrangler name geojson-maker'] },
  { version: '1.1.0', date: '2026-10-05', title: 'Vite + React migration', changes: ['Split 9,415-line HTML into 63 modules','Tailwind, lucide-react','Parity tests 37'] },
  { version: '1.0.0', date: '2026-09-30', title: 'Initial', changes: ['Draw, split, merge, coast tiles','Exporters Alight/SVG/KML/PNG'] },
];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/changelog' && req.method === 'GET') {
      return new Response(JSON.stringify({ changelog: CHANGELOG }), { headers: { 'content-type': 'application/json' } });
    }
    // everything else — static SPA (no KV, no auth needed; sharing is local + URL)
    if (env.ASSETS && env.ASSETS.fetch) {
      const res = await env.ASSETS.fetch(req);
      if (res.status === 404 && !path.includes('.')) {
        const idxReq = new Request(new URL('/index.html', req.url), req);
        return env.ASSETS.fetch(idxReq);
      }
      return res;
    }
    return new Response('Not found', { status: 404 });
  }
};
