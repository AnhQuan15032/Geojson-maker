# Changelog

All notable changes to GeoJSON Studio are documented here.

## [1.2.0] — 2026-10-07

### Added
- **Cloud storage (Cloudflare)** — 1 MB per-user quota. Maps auto-count bytes of GeoJSON + preview PNG; API rejects with `402 QUOTA_EXCEEDED` when full. Stored in Cloudflare KV (`MAPS_KV`) + `USERS_KV` for session, with `R2` optional for previews.
- **Auth — Google & Discord** — OAuth 2.0 via Worker (`/api/auth/google`, `/api/auth/discord`). Discord avatar via `cdn.discordapp.com`, Google via `userinfo` `picture`. Session cookie `__Host-session` (httpOnly, 30d).
- **Upload GeoJSON** — new `Upload` modal: drop a `.geojson/.json` or publish the current canvas. Files are parsed, validated (`FeatureCollection` / `Feature` / geometry), preview rendered, then `POST /api/maps`.
- **Discover maps page** — `Creations` drawer now fetches `GET /api/discover` (public maps, newest first) and `GET /api/maps` (your maps). Tap “Load” to import directly onto the map (`importGeoJSONFile` pipeline).
- **Storage meter** — header + upload modal show `used / 1.00 MB` (e.g. `0.23 MB / 1.00 MB`) via `GET /api/storage/usage`.
- **Changelog** — this file + in-app `Changelog` drawer (`GET /api/changelog`) with rendered markdown.

### Fixed
- Alight Motion export: closed paths now end `L x0 y0` not `Z`, `path-stroke` attrs, large IDs, `mediaFillMode`.

### Changed
- `wrangler.json` now runs a Worker (`worker/index.js`) in front of `assets` for API.

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
