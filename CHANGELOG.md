# Changelog

All notable changes to GeoJSON Studio are documented here.

## [1.2.3] — 2026-10-07 — Fix coastline bug, actual continent load

### Fixed
- **Coastline bug** — `loadGlobalLandmass` now tries 3 CDNs (`jsdelivr`, `unpkg`, `jsdelivr@2.0.2`), was stuck on empty cache (`[]` truthy) and leaked `landLoadPromise`; now clears promise/pending on finish, deletes empty cache on failure to allow retry, validates `list.length>0`, and shows `failed` status correctly.

### Added
- **Actual continent load** — replaces 9-point rough polygons with real Natural Earth 110m countries grouped by `CONTINENT` (Africa, Europe, Asia, N/S America, Oceania, Antarctica) via `ne_110m_admin_0_countries.geojson` (raw `nvkelso` mirror with fallback to `cdn.jsdelivr.net`/`unpkg`). `getMap(id)` now unions countries per continent with `turf.union` (with `ensureHeavyLibs`, chunked + `setTimeout` yield), caches result, falls back to rough if offline.

## [1.2.2] — 2026-10-07 — Delete storage, fix Load, add continents

### Removed
- **Storage** — deleted `localStorage` (`cloud_maps`), quota meter, `My Maps`, `Publish`/`Upload` persistence and `Share via link` (`#share=…`). No saving — draw, load presets, export.

### Added
- **Load continents** — `src/lib/share.js` now ships 7 continents (Africa, Europe, Asia, North America, South America, Oceania, Antarctica) as editable `FeatureCollections` with unique colors. Discover shows a 2×4 grid.

### Fixed
- **Load button not clickable** — `CreationsDrawer` now uses `type="button"`, `pointer-events:auto`, `touch-action:manipulation`, waits up to 2 s for `S.map && S.drawnItems` before loading, and handles both `click` and `touch`. CSS `.sheet-drawer:not(.open){pointer-events:none}` fixes hidden drawer intercepting clicks. `L.geoJSON` style handles `fillColor` correctly.

## [1.2.1] — 2026-10-07 — Share via link (cloud deleted)

### Added
- **Share via link** — `Publish`/`Upload` now generate a `https://.../#share=...` URL (base64 of `{title, geojson, preview, author}`). Anyone with the link sees it in **Discover** and can **Load** it. Works with no Worker, no KV, no build token.
- **Local-only storage** — `My Maps` in `localStorage` (`cloud_maps`), 1 MB quota still enforced, meter shows `Local storage`.

### Removed
- **Cloudflare KV cloud** (`USERS`/`SESSIONS`/`MAPS`, `worker/storage.js` KV, `wrangler kv namespace create` — deleted to fix `10041` and `build token deleted` deploys). `src/lib/cloud.js` is now alias to `share.js`.
- **OAuth Worker** — Discord sign-in is now local display name (prompt) instead of `GET /api/auth/discord` redirect; `worker/auth.js` kept for reference but not used in `worker/index.js`.

### Fixed
- **Build** — `wrangler.json` now only `assets + main` (no `kv_namespaces`), deploys as static; use `npm run build` → `dist` on Pages or Workers with no token rotation needed.
- **Discover** — `Copy link` + `Load` for every map (was `Download /api/maps/:id` which 404’d without cloud).

## [1.2.0] — 2026-10-07

### Added
- **Cloud storage (Cloudflare)** — 1 MB per-user quota. Maps auto-count bytes of GeoJSON + preview PNG; API rejects with `402 QUOTA_EXCEEDED` when full. Stored in Cloudflare KV (`MAPS`) + `USERS`/`SESSIONS`, **opt-in via Settings → Cloud Sync (disabled by default)**. Frontend also enforces via `localStorage`.
- **Auth — Discord only** — OAuth 2.0 via Worker (`/api/auth/discord`). Avatar via `cdn.discordapp.com`. Session cookie `__Host-session` (httpOnly, 30d). First-visit welcome screen prompts Discord sign-up (skippable).
- **Upload GeoJSON** — new `Upload` modal: drop a `.geojson/.json` or publish the current canvas. Files are parsed, validated (`FeatureCollection` / `Feature` / geometry), preview rendered, then `POST /api/maps` (or `localStorage` when cloud off).
- **Discover maps page** — `Creations` drawer now fetches `GET /api/discover` (public maps, newest first) and `GET /api/maps` (your maps). Tap “Load” to import directly onto the map. 2 offline demos included so Load works with no Worker.
- **Storage meter** — header + upload modal show `used / 1.00 MB` (e.g. `0.23 MB / 1.00 MB`) via `GET /api/storage/usage` (or local sum when cloud off).
- **Changelog** — this file + in-app `Changelog` drawer (`GET /api/changelog`) with rendered markdown.
- **Welcome screen** — first join shows Discord onboarding (skippable, can be re-opened from Settings).

### Fixed
- Alight Motion export: closed paths now end `L x0 y0` not `Z`, `path-stroke` attrs, large IDs, `mediaFillMode`.
- Discover Load: demo maps now embed real GeoJSON; `S.map` guards; `publishMap` always falls back to `localStorage`.
- Workers deploy: removed placeholder KV `000...` — deploys instantly with in-memory fallback; add real KV ids only for persistence.

### Changed
- `wrangler.json` now runs a Worker (`worker/index.js`) in front of `assets` for API (no `kv_namespaces` by default; add for persistence).
- Mobile GUI upgraded: cleaner top bar (logo + 4 actions + overflow menu), floating dock with FAB Draw, smoother sheet animations, welcome screen.

## [1.1.1] — 2026-10-05

### Fixed
- **Deploy** — `prepare` builds `dist` if missing so `npx wrangler versions upload` no longer fails with `assets.directory ./dist does not exist`.
- **Workers name** — `wrangler.json` name `geojson-maker` matches `geojson-maker.buianhquan452.workers.dev`.

## [1.1.0] — 2026-10-05

### Added
- Vite + React migration from single-file `index (1).html` (9,415 lines). Legacy kept at `legacy/index.html` for parity.
- Tailwind, `lucide-react`, Vitest parity tests (37 tests).

## [1.0.0] — 2026-09-30
- Initial single-file release with draw, split, merge, coast tiles, and exporters (Alight Motion, SVG, KML, PNG).
