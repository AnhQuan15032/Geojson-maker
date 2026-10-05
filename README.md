# GeoJSON Studio

Vector map exporter — draw or import regions, then export them for Alight
Motion, SVG, KML or transparent PNG.

This used to be one 9,415-line `index.html`. It is now a Vite + React app.
The original file is kept at [`legacy/index.html`](legacy/index.html) so
behaviour can be diffed against it — and the test suite does exactly that.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production bundle in dist/
npm run check     # module-graph check + TDZ check + tests
```

## Deploying to Cloudflare Pages

The app is 100% client-side — no server, no Pages Functions, no local data
files. `npm run build` produces a static `dist/` and that is the whole
deployment.

### Option A — Git integration (recommended)

Connect the repo in the dashboard under **Workers & Pages → Create → Pages →
Connect to Git**, then set:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Build system version | v3 |
| `NODE_VERSION` env var | **leave unset** |

Leave `NODE_VERSION` unset: the repo's `.nvmrc` pins Node 22, and Cloudflare's
own docs note the version file and the environment variable can disagree, so
setting only one of them is what keeps the build deterministic.

Every push to `main` deploys to production; every other branch — including
this one — gets its own preview URL automatically.

### Option B — direct upload

No repo connection needed:

```bash
npm run build
npx wrangler pages deploy dist --project-name=geojson-studio
```

### If you connected a *Workers* project instead of Pages

The two look similar in the dashboard but are configured differently. Tell them
apart from the build log: a Workers build ends with
`Executing user deploy command: npx wrangler deploy` (or `npx wrangler preview`
on a non-production branch), while Pages ends by uploading a build output
directory.

On a Workers project, set **Build command** to `npm run build` and keep the
deploy command at its default. `wrangler.json` in this repo points the Worker's
static assets at `./dist` and carries the empty `previews` block that
`npx wrangler preview` requires:

```json
{
  "name": "geojson-studio",
  "compatibility_date": "2026-10-03",
  "assets": { "directory": "./dist" },
  "previews": {}
}
```

Two things that will fail the build if they are wrong:

- **`name` must match the Worker's name in the dashboard exactly**, or Workers
  Builds rejects the deploy.
- **The build command must not be empty.** Workers Builds runs *build command*
  then *deploy command*; with no build command, `dist/` never gets created and
  the deploy uploads nothing.

If you would rather not maintain a Worker, delete `wrangler.json` and use a
Pages project — for a static SPA that is the simpler of the two, and it needs
no config file at all.

### What is in the repo for this

- **`.nvmrc`** — pins Node `22`. Pages v3 ships Node 22.16.0 by default, so
  this is a guard rail rather than a fix: Vite 5.4 accepts `^18 || >=20`, which
  both the v2 (18.17.1) and v3 images satisfy. It matters if a future
  dependency raises its floor.
- **`public/_headers`** — one-year `immutable` cache for `/assets/*`, since
  Vite content-hashes those filenames, and `max-age=0, must-revalidate` for
  `index.html`, the one URL that never changes. Vite copies `public/` verbatim
  into `dist/`.
- **`package.json` `engines`** — documents the Node floor for local tooling.
  Note that Pages v3 **does not** read `engines` to pick a Node version; only
  `NODE_VERSION` and `.nvmrc` / `.node-version` do.

### Deliberately not included

- **No `_redirects`.** There is no client-side router — every route is `/`. A
  catch-all `/* /index.html 200` would turn a typo'd URL into a silent copy of
  the app instead of a 404.
- **No Content-Security-Policy.** The map pulls tiles from several third-party
  origins and Leaflet/MapLibre rely on inline styles, `blob:` and `data:` URLs.
  See the note in `public/_headers`.

### Headroom

Current build: 10 files, 3 MB total, largest file 0.88 MiB — against Pages
limits of 20,000 files and 25 MiB per file.

### Runtime dependencies stay where they are

Deploying does not change what the app talks to. Tiles and datasets are still
fetched client-side from OpenStreetMap, ArcGIS, OpenFreeMap, OpenTopoMap, the
Overpass API and jsDelivr/unpkg, exactly as before. A `*.pages.dev` or custom
domain origin is fine for all of them. If you later want those cached or
proxied, that is a Worker in front of the app — a separate piece of work.

## Layout

```
index.html                  Vite entry: <div id="root"> + module script
src/
  main.jsx                  mounts React, then hands off to the engine
  App.jsx                   composes the UI in the original document order
  index.css                 Tailwind layers, then the app's own CSS
  ui/                       14 components — one per region of the old markup
    drawers/                Export / Draw / Style / Image / Layers
  engine/                   32 modules, split along the original section banners
    state.js                the 92 mutable fields, behind an observable Proxy
    actions.js              every function the UI can call (the old inline onclick targets)
  store/                    createStore + useSyncExternalStore hooks
  lib/
    icons.js                lucide registry + <Icon> + createIcons() shim
    leaflet-setup.js        loads Leaflet and Geoman in the required order
scripts/
  check-module-graph.mjs    every import resolves to a real export
  check-tdz.mjs             no top-level read of a binding from a module in a cycle
  migrate/                  the codemod that performed the split (see below)
legacy/index.html           the original monolith, untouched
```

## How the split was done

The refactor was performed by a codemod rather than by hand, so it is
reproducible: `npm run migrate` regenerates `src/` from `legacy/index.html`
byte-for-byte. The scripts in `scripts/migrate/` are the record of what
happened to those 9,400 lines.

| Step | What it did |
|---|---|
| Drop shadowed duplicates | The old script declared 11 functions twice (`ensureCurveStore`, `rebuildCurvedGeometry`, `setCurveAmount`, …). In one sloppy-mode script scope the last declaration wins, so the earlier copies were unreachable. They are gone. |
| `let` → `S.*` | 92 top-level mutable bindings moved onto a single store object; 1,089 references rewritten, using scope analysis so a local `const map = {}` was never mistaken for the engine's `map`. |
| Bucket into modules | Declarations were filed by the `// ===== SECTION =====` banner above them, then import statements were generated from what each bucket actually references. |
| CDN → npm | `loadScriptOnce()` injected `<script>` tags for Turf, TopoJSON and MapLibre. Those are dynamic `import()`s of real dependencies now, so Vite code-splits them. |
| `DOMContentLoaded` → `startEngine()` | React owns the document, so the engine is started explicitly from a ref callback once the tree has committed. |
| Markup → JSX | `class`→`className`, 151 `<i data-lucide>` → `<Icon>`, 129 inline handlers → `onClick={() => actions.foo()}` with `this` rewritten to `e.currentTarget`. `value` became `defaultValue` because the engine writes those fields imperatively. |

Two constants (`TUTORIAL_STEPS`, `TUTORIAL_CTAS`) were kept out of
`constants.js` on purpose: their initializers close over engine functions, so
putting them there would make that module import half the app and turn a
harmless import cycle into a TDZ crash the first time the entry order changed.

## Where React stops and the engine begins

This is a **hybrid**, deliberately. React renders the interface; the engine —
Leaflet, Geoman, the canvas bakers, the tile fetchers — stays imperative and
keeps updating the DOM it has always updated.

The seam is explicit:

- components never import engine internals, only `actions`
- the engine never imports React
- `src/engine/state.js` is the one place mutable app state lives, behind a
  Proxy, so a plain `S.foo = x` notifies subscribers

`src/store/useAppState.js` exposes `useEngineVersion()` and
`useEngineValue(select)` on top of `useSyncExternalStore`. They are used by
the tests today; no panel has been converted to render from them yet, so the
status chips and toggle highlights are still written imperatively by the
engine. Converting a panel means deleting its imperative writer at the same
time — doing both at once is what keeps React and the engine from fighting
over the same element.

`StrictMode` is off. Its development mount/unmount/remount cycle would rebuild
the subtree while the Leaflet map stays bound to the detached first copy.

## Notes

- **Icons.** Static markup uses `<Icon name="…">`. The engine still builds HTML
  strings with `data-lucide` for marker labels and tutorial steps, so
  `src/lib/icons.js` also exports a scoped `createIcons(root)`. The registry
  lists the 85 icons this app actually uses instead of all ~1,500.
- **Leaflet + Geoman.** Geoman ships a pre-bundled IIFE that reads a global
  `L`, so `src/lib/leaflet-setup.js` sets `window.L` in a module imported
  *before* it. Both must be loaded in that order.
- **Tailwind** is build-time 3.4 with default config, matching the CDN build
  the app used to load. The app's own CSS sits after the Tailwind layers,
  which is the order the CDN produced and therefore the order the specificity
  ties were resolved in.
- **Remaining CDN URLs** are runtime *data* fetches, not libraries:
  `world-atlas` TopoJSON and ISO country codes, each with the same fallback
  host list as before. Tile servers are unchanged.
- **Known dead code, left alone.** Most of the "curved edges" feature
  (`toggleCurveEdgeMode`, `curveAllEdges`, `setCurveAmount`, both the v1 and v2
  implementations) is not reachable from any button or keyboard shortcut in the
  original app either. Removing it is a separate decision from porting it, so
  it was carried across rather than deleted.

## Tests

`npm run check` runs three things:

1. **module graph** — 60 source files, 539 relative imports, every named
   import resolves to a real export
2. **TDZ** — no top-level initializer reads a binding from a module it is in an
   import cycle with
3. **37 tests**, in three groups:
   - *parity* — loads the original monolith into a `vm` sandbox and diffs it
     against the new modules on identical inputs: colour conversions, the SVG /
     KML / Alight Motion path builders, MVT decoding, the border roughener,
     sea-colour masking, and a byte-identical `liveGeoJSONString` comparison
     over real Leaflet features
   - *smoke* — mounts the component tree, runs `startEngine()`, asserts the
     engine finds the elements React rendered and initialises the map on them
   - *dist* — boots the built `dist/` bundle, because dev and prod resolve the
     Leaflet/Geoman UMD interop differently
