import { json, bad, getCookie } from './utils.js';
import { getSessionUser, handleDiscordStart, handleDiscordCallback, handleLogout } from './auth.js';
import { handleListMaps, handleDiscover, handleGetMap, handleCreateMap, handleDeleteMap, handleUsage } from './storage.js';

const CHANGELOG = [
  { version: '1.2.0', date: '2026-10-07', title: 'Cloud + Auth + Discover', changes: ['Cloudflare KV storage 1 MB quota','Discord OAuth with avatars (cloud opt-in, disabled by default)','Upload GeoJSON + publish current map','Discover maps page','Storage meter','Changelog drawer','Alight Motion export verified fix'] },
  { version: '1.1.1', date: '2026-10-05', title: 'Deploy fixes', changes: ['prepare builds dist if missing','wrangler name geojson-maker'] },
  { version: '1.1.0', date: '2026-10-05', title: 'Vite + React migration', changes: ['Split 9,415-line HTML into 63 modules','Tailwind, lucide-react','Parity tests 37'] },
  { version: '1.0.0', date: '2026-09-30', title: 'Initial', changes: ['Draw, split, merge, coast tiles','Exporters Alight/SVG/KML/PNG'] },
];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS for API
    if (path.startsWith('/api/')) {
      // handle preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': req.headers.get('origin') || '*',
            'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
            'access-control-allow-headers': 'content-type,authorization',
            'access-control-allow-credentials': 'true',
          }
        });
      }
      try {
        // auth routes
        if (path === '/api/auth/me' && req.method === 'GET') {
          const user = await getSessionUser(req, env);
          if (!user) return json({ user: null }, 200);
          const { _token, ...safe } = user;
          return json({ user: safe });
        }
        if (path === '/api/auth/discord' && req.method === 'GET') return handleDiscordStart(req, env);
        if (path === '/api/auth/callback/discord' && req.method === 'GET') return handleDiscordCallback(req, env);
        if (path === '/api/auth/logout' && (req.method === 'POST' || req.method === 'GET')) return handleLogout(req, env);

        if (path === '/api/changelog' && req.method === 'GET') return json({ changelog: CHANGELOG });
        if (path === '/api/discover' && req.method === 'GET') return handleDiscover(req, env);
        if (path === '/api/storage/usage' && req.method === 'GET') return handleUsage(req, env);
        if (path === '/api/maps' && req.method === 'GET') return handleListMaps(req, env);
        if (path === '/api/maps' && req.method === 'POST') return handleCreateMap(req, env);
        if (path.startsWith('/api/maps/') && req.method === 'GET') {
          const id = path.split('/').pop();
          return handleGetMap(req, env, id);
        }
        if (path.startsWith('/api/maps/') && req.method === 'DELETE') {
          const id = path.split('/').pop();
          return handleDeleteMap(req, env, id);
        }
        return bad('not found', 404);
      } catch (e) {
        console.error(e);
        return json({ error: e.message || 'internal' }, 500);
      }
    }

    // Fallback to assets (static SPA)
    // In Workers with assets, env.ASSETS is the fetcher for static files
    if (env.ASSETS && env.ASSETS.fetch) {
      const res = await env.ASSETS.fetch(req);
      // SPA fallback: if 404 and not api and no extension, serve index.html
      if (res.status === 404 && !path.includes('.')) {
        const idxReq = new Request(new URL('/index.html', req.url), req);
        return env.ASSETS.fetch(idxReq);
      }
      return res;
    }
    return new Response('Not found', { status: 404 });
  }
};
