const CHANGELOG = [
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
