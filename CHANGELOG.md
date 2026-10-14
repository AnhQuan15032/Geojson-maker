# Changelog

All notable changes to GeoJSON Studio are documented here.

## [1.2.6] — 2026-10-14 — Draw Split Polygon + Split & Delete Polygon

### Added
- **Draw Split Polygon** — `startSplitPolygonMode()` enables a Geoman **Polygon** blade (violet, dashed preview) instead of a line. `executeSplitWithPolygon()` closes the ring, then cuts the locked shape with `turf.intersect` (part **inside** the ring) and `turf.difference` (part **outside**). Both pieces are added as editable shapes named `Region (inside)` / `Region (outside)`, each with its own colour.
- **Split & Delete Polygon** — `startSplitPolygonAndDeleteMode()` draws the same ring but erases it: only the `difference` remainder survives as `Region (trimmed)`. If the blade covers the whole shape, the shape is removed entirely.
- **State** — `S.splitTool` (`'line'` | `'polygon'`) selects which blade `pm:create` routes to; it is reset to `'line'` on cancel, `Escape`, `pm:drawend` and after every execution.
- **UI** — the Draw panel's split section now has two labelled rows: *Line blade* (`Draw Split Line`, `Split & Delete`) and *Polygon blade* (`Draw Split Polygon`, `Split & Delete Polygon`), with the shared **Stop / Cancel** button and the locked-to-selected banner unchanged.
- **Tests** — `src/__tests__/split-polygon.test.js` (6 cases, real Leaflet map + real turf): inside/outside split with area conservation, delete-mode erasure, non-overlapping blade is a no-op, fully-covering blade removes the shape, unclosed rings are closed, and only the pre-selected region is ever cut.

### Fixed
- **Sliver pieces** — a blade that only grazes an edge no longer creates zero-area shapes (`turf.area > 1 m²` required on both sides).
- **`populateStyleDrawer` crash** — it assumed `#no-region-selected` / `#style-editor-controls` / `#style-prop-name` / `#style-fill-color*` always exist and threw `TypeError: Cannot read properties of null` when the style drawer was not mounted; every lookup is now guarded and it bails quietly when unmounted. This also protects the existing line-split path.
- **Post-split UI refresh** — wrapped in its own `try/catch` so a UI hiccup can no longer report a completed cut as `Polygon split failed`.

## [1.2.5] — 2026-10-14 — Simpler UI: Explorer, logins & legends removed

### Removed
- **Map Explorer (Discover)** — deleted `src/ui/drawers/CreationsDrawer.jsx`, its header/mobile buttons, the `creations-drawer` CSS rules and the demo presets (`DEMO_MAPS` is now empty; `PRESET_MAPS` = continents only).
- **Logins demo** — deleted the Discord/sign-in buttons, the auth modal + `refreshAuthUI` DOM wiring in `src/engine/uiHelpers.js`, and `src/lib/auth.js`. Dead Worker login backend removed too (`worker/auth.js`, `worker/storage.js`, `worker/utils.js`) — `worker/index.js` only serves static assets + `GET /api/changelog`.
- **Legends** — deleted the floating **Map Legend** panel (`toggleMapLegend` is now a no-op stub), the header `Legend` button, the mobile overflow-menu entry and the `#map-legend-container` CSS.

### Changed
- **Load Continents moved into the Map section** — the 7 continents (Africa, Europe, Asia, North America, South America, Oceania, Antarctica) now render in **Map Base & Boundaries** (`LayersDrawer`, the `Map` tab) directly above *Load Country GeoJSON*. Same robust loader as before: waits for `S.map`/`S.drawnItems`, fetches real Natural Earth geometry via `getMap(id)`, falls back to the rough polygon offline, `pointer-events:auto` + `touch-action:manipulation` so the buttons always fire, and split-mode clicks are ignored.
- **Welcome screen** — no sign-in step; it now points at **Map → Continents** and the coastline tools.
- **Settings** — the continents shortcut opens `layers-drawer` (labelled *Open Map*) instead of the deleted Discover drawer.

## [1.2.4] — 2026-10-12 — Locked split, split & delete, offline turf

### Added
- **Split & Delete mode** — same blade interaction as Split, but the smaller half is discarded automatically (trim / erase part of a shape). `startSplitAndDeleteMode()` + `executeSplitWithLine(latlngs, deleteFlag)`, amber button next to *Draw Split Line*.

### Changed
- **Split is locked to the pre-selected region** — `startSplitMode()` requires an active polygon, stores `_splitLockedLayer`, and the store proxy ignores `S.activeSelectedLayer` changes for other layers while `S.splitModeActive`; per-layer click handlers bail out during split; the lock clears on cancel / `pm:drawend` / `Escape`.

### Fixed
- **"Turf unavailable" offline** — `ensureHeavyLibs()` now assigns `window.turf` / `window.topojson` and clears its promise on failure so a retry can happen; `merge.js`, `coastTiles.js`, `stats.js`, `exporters/geojson.js` and `countries.js` all use `turf || window.turf`.
- **Country Load buttons not activating** — `renderCountryResults()` emits `data-country-id` and a delegated `document` click listener calls `loadCountryFeatureById(id)`, so the buttons work even when inline `onclick` is blocked by CSP or the global is missing.

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
