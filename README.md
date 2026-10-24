# GeoJSON Studio

Vector map exporter — draw or import regions, then export them for Alight
Motion, SVG, KML or transparent PNG.

This used to be one 9,415-line `index.html`. It is now a Vite + React app.
The original file is kept at [`legacy/index.html`](legacy/index.html) so
behaviour can be diffed against it — and the test suite does exactly that.

## Quick start — zero config

```bash
npm install
npm run dev       # http://localhost:5173 — works with no Cloudflare
npm run build     # production bundle in dist/
npm run check     # module-graph check + TDZ check + tests
```

`npm run dev` alone is enough — everything runs client-side. Load **continents**
and **countries** from the **Map** panel, draw, split, merge, cut to coastline and
export. No sign-in, no storage, no cloud.

## New in 1.6.0 — animated region images, transform keyframes and more canvas sizes

- **An image / flag can follow each morph.** Upload a PNG, JPEG or WebP in
  Animate to preview it moving with the changing region. Choose to clip it to
  the exact morphing outline or leave it rectangular. Set separate From/To
  scale, X/Y offsets (percent of the region bounds), and rotation; those values
  export as Alight Motion transform/size keyframes using the morph timeline.
- **Six viewport presets:** 9:16 portrait (default), 4:5 portrait (1080×1350),
  1:1 square, 4:3, 3:2 and 16:9 landscape. Geometry fitting and XML canvas
  dimensions use the same selection.
- **One region, one morph slot.** Reusing a drawn region in a newer morph
  clears only its earlier From/To assignment; it does not delete the map layer.
- **Duplicate selected shapes from Layers.** The Layers-panel button, Draw quick
  tool and Ctrl+D make a copy that preserves the source appearance, then select it.
- **Cleaner transparent PNG exports.** Separate line parts stay separate, and
  opacity, dash patterns and line styling are retained without crop-edge clipping.
  A separate **PNG (Pixel Perfect)** option produces hard 1:1 pixels with no
  antialiased edge pixels; diagonals may look stepped.
- When an image is selected, Export downloads both the `.xml` and its matching
  SHA-1-named image sidecar. Import the image into Alight Motion first so its
  `am-internal:///…` link can resolve. XML references (but cannot embed) the
  bitmap. The media-link and clipping-mask XML follows public Alight Motion
  serializer/renderer source, but still needs a test inside the Alight Motion
  app.

## New in 1.5.2 — merge: a Merge button on the map, no loss of detail

- **Floating Merge toolbar.** Turning *Merge* on shows a bar at the bottom of
  the map with the picked count, **Merge N**, **Clear** and **✓ Done**, so the
  fusion runs right where you tap — no trip back into the Draw panel (on a
  phone the panel closes when merge mode starts). Enter merges as well; the
  bar goes away when merge mode is off. `src/ui/MergeBar.jsx`,
  `updateMergeBar()` in `merge.js`.
- **No quality loss when merging.** Merged shapes (and shapes restored by
  undo/redo) were drawn with `smoothFactor: 2`, twice Leaflet's default
  tolerance, so the result looked rougher than its inputs; they now render
  like every other shape, and the union reads full-precision coordinates.
  The union itself keeps every non-shared vertex.
- **Dissolve inner borders & gaps** is a working toggle again (React had
  rendered it read-only) and no longer buffers the shape: `removeMergeGaps()`
  drops only new, small, thin holes between mismatched borders — nothing is
  moved, enclaves and islands stay.

## New in 1.5.1 — drawing: fast clicks never zoom, no hint box

- **Quick clicks place points, they never zoom.** Leaflet's double-click /
  double-tap zoom is paused for the length of a draw session (`pm:drawstart`
  → `pm:drawend`, `drawTools.js`); wheel, pinch, buttons and keyboard still
  zoom while drawing, and double-click zoom returns 300 ms after the session
  ends so the closing tap cannot zoom either.
- **No hint box under the cursor** — Geoman's "Click first marker to finish"
  tooltip is off (`tooltips: false`).
- **Esc abandons the shape being drawn**; `endDrawSession()` stops whatever
  tool is active (Geoman's `disableDraw()` only knows Polygon by default).

## New in 1.5.0 — graph editor, one-key country loading, load a country twice

- **Graph editor for the easing.** The Animate panel has an Alight-Motion-style
  curve editor (`src/engine/easingEditor.js`): black grid, green curve, two
  big white handles you drag (pointer events, works with a finger), typed
  `x1 y1 x2 y2`, preset chips, *Mirror*, and a dashed playhead that sweeps the
  curve while the preview runs. A curve that lands on a preset selects it;
  anything else is **Custom**, remembered across reloads, previewed with the
  same `cubicBezierEase`, and exported as `e="cubicBezier x1 y1 x2 y2"`
  formatted the way Alight Motion prints floats (`0.8879618 0.0 0.10184711 1.0`).
- **Countries are one key away.** `L` (rail button *Country*, mobile menu
  *Country*) opens the Map panel on the loader — now the first block of the
  panel — focuses the search and shows results. Typing filters instantly once
  the index is in memory, **Enter** loads the first match, **Esc** clears.
  The default 50 m index is fetched during idle time at start-up and kept in
  Cache Storage (`gs-world-atlas-v1`), so the first search answers at once
  even offline. *Recent* chips reload a country in one tap.
- **Load the same country again.** Picking a loaded country adds another copy
  (`Vietnam (2)`, `(3)`, …) with its own colour and its own feature object,
  instead of zooming to the existing one — handy for before/after morphs,
  alternative colourings or cutting one copy to the coast. Results show
  `×2 on map · load again`.

## New in 1.4.1 — bridges on the coast, least-motion morphs, dateline shapes whole

- **Bridges start on the real coast.** `prepareShape` plans the corridors on
  the full-resolution rings (chunked, memoised closest approach) and protects
  the foot points through thinning, so a bridge leaves the drawn shoreline at
  the point nearest the island even when the coast is thinned hard.
- **Only what changes moves.** `prepareMorph` aligns the two rings by dynamic
  time warping on vertex distance (`alignRings`): identical coastline pairs
  with itself and stays put, extra detail on one side is matched by vertices
  inserted along the other's own edges. Both shapes thin with shared per-ring
  thresholds (`shareThinning`), so Russia → Russia + Ukraine keeps 364 of 384
  points still (travel 8.8 px instead of 90 px). Candidates are ranked by
  travel + `TANGLE_COST` per mid-morph crossing; the uniform match remains the
  fallback.
- **Dateline shapes stay whole.** Pieces stored west of −180° are brought
  round by +360° (`datelineCut`, `shiftedProjection` in `animator.js`) and sewn
  back onto their mainland (`rejoinAtMeridian` in `antimeridian.js`); preview
  and export frame the whole shape tightly.
- **Validated thinning.** Nothing is dropped while the shape fits the budget as
  drawn; an island the thinned coast cuts through or swallows is dropped and
  the shape rebuilt; a coast that folds over itself is straightened
  (`untangleRing`). The bridged ring is always a simple polygon.

## New in 1.4.0 — Mercator export, many morphs, islands bridged

- **Web Mercator export.** The Alight Motion exports (animation and static)
  now use the map's own projection, so a shape looks exactly as it does on
  screen; `makeAlightProjection(bounds, { projection })` defaults to
  `'mercator'` (`'equirectangular'` reproduces the old fit).
- **Many morphs.** The Animate panel is a list of **From → To** tracks —
  *Add morph*, per-row *Use selected* / *Swap* / *Remove*. Each complete track
  is one keyframed layer in the export and one ghost in the preview; they play
  *all together* or *one after another* (`morphTimeline(timing, { index, count,
  sequence })`).
- **Islands and holes, no extra borders.** `prepareShape(parts)` bridges every
  part of a multi-polygon into a single ring with 0.02 px corridors (invisible,
  like Age of History 2 provinces): nearest-first, vertex-to-edge closest
  approach, holes traced the other way round so the fill rule keeps them empty,
  zero self-intersections, drawn vertices kept. The point budget is shared by
  outline length; islands that cannot get 4 points are dropped and reported.

## New in 1.3.1 — antimeridian fix

Countries, provinces and the Cut Sea coastline that cross **±180°** (Russia,
Fiji, Antarctica, …) are cut at the antimeridian as they load. The
`world-atlas` TopoJSON is *geostitched* — a ring runs straight from 179.9°E to
−180° — and Leaflet's flat world drew every such edge as a line across the
entire map (the red bands over Russia at 65–69°N). `src/engine/antimeridian.js`
unwraps each ring, closes polar rings through the pole, clips the polygon into
360°-wide windows and shifts the pieces back; clean geometry is returned by
reference. Applied in `ensureCountryIndex`, `ensureAdm1Index`,
`loadGlobalLandmass`, `ensureWorldBorders` and `loadGeoDataObject`.
Tests: `src/__tests__/antimeridian.test.js`,
`src/__tests__/country-antimeridian.test.jsx`.

## New in 1.3.0 — Vector Auto-Animator

Draw **shape 1**, draw **shape 2**, press **Animate** (rail button, mobile
menu, or the **A** key). The first outline morphs into the second, you can
preview it on the map, and export it as an **Alight Motion project (.xml)**
whose shape layer carries keyframed outline points — open it in Alight Motion
and the shape animates on its own.

| Step | What happens |
|---|---|
| **Points** | If one shape has fewer points than the other, extra vertices are inserted along its outline in proportion to edge length — **drawn vertices never move**, so both keyframes look exactly like what you drew. Shapes over the point budget (default 400) are thinned first (Visvalingam–Whyatt). |
| **No flipping / swirling** | Both rings are forced to the same winding, and the end shape's start vertex is re-chosen so the total travel distance is minimal. |
| **No tangles** | Every candidate start vertex is simulated at 9 intermediate frames and checked for self-intersections; the first clean one (by travel distance) wins. The panel status reports `… · no tangles` or the crossing count in amber. |
| **Timing** | Hold start → morph → hold end (defaults 0.5 s / 1.5 s / 0.5 s), optional **A → B → A**, five easing presets, optional animated fill colour, optional static layers for the other shapes. |
| **Export** | `<shape>` → `<path closed="true">` → one `<knot><p>` per point with `<kf t v [e]>` keyframes (knots sit directly under `<path>` for a single-contour outline, exactly as Alight Motion's own serializer writes it), `t` normalised to the layer's own time range, easing on the destination keyframe — `cubicBezier x1 y1 x2 y2` from a preset or the graph editor, nothing for linear. |

Code: `src/engine/morph.js` (pure geometry), `src/engine/exporters/alightMotionMorph.js`
(keyframe XML), `src/engine/animator.js` (state, preview, download),
`src/ui/drawers/AnimateDrawer.jsx` (panel). Tests: `src/__tests__/morph.test.js`,
`src/__tests__/animate-flow.test.jsx`.

## New in 1.2.5 — simpler UI

| Change | What it means |
|---|---|
| **Map Explorer deleted** | The `Discover` drawer (demo presets + featured maps) is gone — `src/ui/drawers/CreationsDrawer.jsx` removed, `DEMO_MAPS` emptied |
| **Logins demo deleted** | Discord/sign-in buttons, the auth modal and `src/lib/auth.js` are gone; dead Worker login backend (`worker/auth.js`, `worker/storage.js`, `worker/utils.js`) deleted |
| **Legends deleted** | The floating **Map Legend** panel, its header button and the mobile menu entry are removed (`toggleMapLegend` is a no-op stub) |
| **Load Continents → Map panel** | The 7 continents now live in **Map Base & Boundaries** (`LayersDrawer`, the `Map` tab) right above country search — each loads real Natural Earth geometry as one editable polygon |
| **Welcome screen** | No sign-in step; it points at **Map → Continents** and the coastline tools |

> **2026-10-14 — 1.2.5:** UI trimmed to the map workflow. **2026-10-12 — 1.2.4:**
> split is locked to the pre-selected region, new **Split & Delete** mode, offline
> `turf` fallback, and country **Load** buttons fixed via `data-country-id` +
> delegated click.

### Deploying (static — no cloud, no secrets)

```bash
npm run build          # → dist/
npx wrangler deploy    # Workers: assets + /api/changelog only (no KV, no auth)
# Pages alternative:
# npx wrangler pages deploy dist --project-name=geojson-maker
```

`worker/index.js` only serves the static bundle plus `GET /api/changelog`; there is
no KV namespace, no session cookie and no OAuth route left.

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
static assets at `./dist` and runs `worker/index.js` in front of them (static SPA + `GET /api/changelog` only — no KV, no auth, deploys instantly):

```json
{
  "name": "geojson-maker",
  "compatibility_date": "2026-10-03",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application" },
  "main": "worker/index.js",
  "vars": { "BASE_URL": "https://geojson-maker.buianhquan452.workers.dev" }
}
```

The Worker serves `GET /api/changelog` and falls through to `assets` for everything
else (SPA fallback to `index.html`). There is no KV namespace, no session cookie and
no OAuth route — the app is fully client-side. See `worker/index.js` + `CHANGELOG.md`.


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
    drawers/                Export / Animate / Draw / Style / Image / Layers / Settings / Changelog
  engine/                   34 modules, split along the original section banners
    morph.js                vector auto-animator geometry (densify, align, tangle check)
    animator.js             Animate panel state, on-map preview, Alight Motion morph export
    exporters/              geojson / svg / kml / png / alightMotion / alightMotionMorph
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

1. **module graph** — 85 source files, 792 relative imports, every named
   import resolves to a real export
2. **TDZ** — no top-level initializer reads a binding from a module it is in an
   import cycle with
3. **147 tests** (parity, smoke, dist, split-polygon, cut-sea, morph geometry /
   Alight Motion keyframes and image media, animate user flow incl. the graph editor, country
   loader flow, drawing feel (fast clicks, Esc), antimeridian repair). The
   original three groups:
   - *parity* — loads the original monolith into a `vm` sandbox and diffs it
     against the new modules on identical inputs: colour conversions, the SVG /
     KML / Alight Motion path builders, MVT decoding, the border roughener,
     sea-colour masking, and a byte-identical `liveGeoJSONString` comparison
     over real Leaflet features
   - *smoke* — mounts the component tree, runs `startEngine()`, asserts the
     engine finds the elements React rendered and initialises the map on them
   - *dist* — boots the built `dist/` bundle, because dev and prod resolve the
     Leaflet/Geoman UMD interop differently
