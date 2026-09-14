# GeoJSON Maker

Draw, style and export GeoJSON in the browser. No build step, no dependencies,
no account — open `index.html` through any static server and go.

```bash
npm run serve      # → http://localhost:8000   (Node, zero dependencies)
# or
npm start          # → http://localhost:8000   (python3 -m http.server)
```

> Opening the file directly with `file://` will not work: the app is built from
> ES modules, which browsers only load over http(s).

---

## What changed in this pass

| Request | Status |
| --- | --- |
| Delete the presets | **Done** — there is no preset panel, preset shape library or preset style list anywhere in the UI or the code. A test asserts none can creep back in. |
| Delete the shape shown at the start | **Done** — the map boots completely empty. The only thing that can appear on load is *your own* previously saved session, and that comes with a **Start empty** button in the toast. |
| Remove AI features | **Done** — nothing in the app calls a model, and no assisted/auto-generated/smart controls exist. The same test that checks for presets checks for these. |
| Add image fill in the Styles tab | **Done** — upload a file, drag & drop one onto the map, paste an image URL, or paste from the clipboard. Tile / stretch / single-image layouts, rotation, offset, backdrop colour and opacity. |
| Add Wikimedia Commons flag search fill in the Styles tab | **Done** — search Commons, preview results with author + licence, and apply one as the fill. Attribution is kept on the feature and written into the export. |
| Fix “zoom out → image looks light, zoom in → looks heavy” | **Done** — see below. |
| Add **cut sea** — trim a shape that runs off the land into the ocean | **Done** — *Cut sea* in the Features tab intersects what you drew with a real coastline and throws away the water. See below. |

### Why image fills used to change character with zoom

A single bitmap stretched over a polygon gets resampled by the canvas at
whatever size the zoom happens to produce:

* **Zoomed out** the pattern is a few pixels wide, most texels are skipped and
  thin or semi-transparent artwork averages towards nothing — the fill looks
  pale, faint and uneven.
* **Zoomed in** the same bitmap is magnified into coarse, soft blocks, and past
  100 % the sampler is inventing pixels that were never in the file.

Three things fix it, all in `src/render/pyramid.js` and
`src/render/renderer.js`:

1. **A resolution pyramid per image.** Each image is pre-downsampled into a
   mipmap chain (1024 → 512 → … → 1 px) with high-quality resampling at every
   step, so a small tile is drawn from a bitmap that was *built* to be small
   instead of one being squeezed on the fly.
2. **Level selection per frame.** Every frame the renderer computes the tile's
   size in *device* pixels (`CSS px × devicePixelRatio`) and picks the pyramid
   level whose texels map to roughly one screen pixel. A test walks zoom levels
   2 → 16 and asserts the device-pixel-per-texel ratio always stays inside
   `0.5 … 2`.
3. **Sane extremes.** Below ~1 device pixel the pattern converges on the
   image's mean colour, so the renderer paints that colour directly rather than
   letting the sampler produce a pale smear. Above the source resolution the
   *“Don't blur past the image's own resolution”* option stops the tile from
   growing, keeping it crisp instead of mushy.

On top of that, the **Zoom behaviour** switch lets you choose what “size” even
means:

* **Constant size** (default) — the tile keeps the same size on screen at any
  zoom, so the fill never changes character while you zoom.
* **Grows with zoom** — the tile is pinned to a real-world size in metres, like
  a draped overlay; the pyramid keeps it sharp at every level.

The whole canvas is drawn in device pixels (one `devicePixelRatio` transform,
CSS-pixel coordinates), which is what keeps outlines crisp on high-density
displays instead of looking thin and washed out.

---

## Cut sea (coastline clipping)

You draw a country, a region, a catchment — and your hand wanders out over the
water. **Cut sea** intersects the shape with an actual coastline and keeps only
the part on land:

* **Features tab → Coastline → *Cut sea*** trims the selected features;
  ***All features*** trims everything on the map in one go.
* A shape that ends up with nothing on land is **left exactly as it was** and
  reported (“entirely over water”), rather than being deleted or emptied.
* The whole click is **one undo step** (`Ctrl/⌘+Z`), even if you cut twice in a
  row.
* Lines keep only their on-land stretches, with the endpoints placed *on* the
  shore (a line that starts and ends at sea but crosses an island keeps its
  middle). Points at sea are dropped; a `MultiPoint` with one survivor becomes a
  `Point`.
* Output stays valid RFC 7946: exterior rings counter-clockwise, holes
  clockwise, rings closed, coordinates rounded to 1e-7. Lakes inside your shape
  come back as holes, not as filled land.

**Data tab → Coastline data** decides what you cut against:

| Control | What it does |
| --- | --- |
| *Shoreline* | Natural Earth 1:110m (small, coarse), 1:50m (balanced, default) or 1:10m (detailed, large). Downloaded only when you ask, tried across three mirrors, then cached in your browser. |
| *Cut detail* | How finely the shore is resolved: fast / balanced / high. |
| *Also cut lakes* | Fetches the matching lakes layer and removes inland water too. |
| *Or use your own land polygons* | Any GeoJSON of land polygons — works offline, and beats anything I could pick for you. |
| *Forget* | Drops the loaded coastline and its cache from this browser. |

Pressing *Cut sea* with no coastline loaded starts the download for you; if the
network is not there, it says so and points at the file input instead of
guessing.

### How it works

Coastlines are hostile input for polygon boolean libraries: tens of thousands of
vertices, rings that touch themselves, shared edges between neighbouring
islands. Greiner–Hormann and friends fall over on that, so
`src/land/clipping.js` does it as a raster problem instead — the same way a GIS
clips against a land mask:

1. **Rasterise** — the drawn shape and the nearby land polygons (found through a
   5° spatial index, so only a handful of coastline parts are ever touched) are
   scan-filled with even-odd parity into separate cell masks, on a grid whose
   cells are square on the ground (longitude steps scaled by `cos(lat)`).
2. **Combine** — `drawn AND land AND NOT lakes`.
3. **Trace** — the boundary of the resulting cell set is walked edge by edge,
   keeping land on the left. That single rule yields counter-clockwise outers and
   clockwise holes for free, and regions that touch only at a corner stay two
   separate rings instead of pinching into one self-touching ring.
4. **Simplify** — Douglas–Peucker at ~0.9 × cell size removes the staircase
   without eating real coastline; if the result would exceed the vertex budget
   (20 000) the tolerance is coarsened and it runs again.
5. **Nest** — each hole is attached to the smallest outer ring that contains it,
   then the geometry is emitted as `Polygon` or `MultiPolygon`.

Lines are clipped exactly rather than by raster: every crossing between the
segment and the coastline is solved, and inside/outside alternates between them.

Cost, measured on a synthetic coastline at Natural Earth 1:50m scale (701
polygons, ~30 000 positions): 30–90 ms for a country-sized shape, ~240 ms for a
continent-sized one at *high* detail.

---

## Using it

**Draw** — pick a tool in the top bar (or press `V P L G R`): select, point,
line, polygon, box. Click to place vertices, double-click or `Enter` to finish,
`Esc` to cancel, `Backspace` to remove the last vertex. Clicking the first dot
closes a polygon.

**Edit** — with the select tool, drag a shape to move it, drag a vertex to
reshape it, drag an edge midpoint to insert a vertex, `Delete` on a hovered
vertex to remove it. `Shift`-click adds to the selection, `Shift`-drag on empty
space marquee-selects, arrow keys nudge (hold `Shift` for 10×).

**Style** — the Styles tab edits the selected features, or the defaults for the
next shape when nothing is selected (the badge at the top tells you which).
*Apply to all features* pushes the current look onto everything.

**Data** — import by file, drag & drop, or paste (`Ctrl+V`); export by download,
copy, or from the live preview. Styling is written with
[simplestyle-spec](https://github.com/mapbox/simplestyle-spec) keys (`fill`,
`stroke`, `stroke-width`, …) so other tools understand it, with the image fill
under `x-image-fill` and labels under `x-label`.

**Shortcuts** — `Ctrl/⌘+Z` undo, `Ctrl/⌘+Shift+Z` redo, `Ctrl/⌘+A` select all,
`Ctrl/⌘+D` duplicate, `Ctrl/⌘+E` export, `Ctrl/⌘+S` save a snapshot, `+`/`-`
zoom, arrows pan, `Esc` clear the selection.

## Wikimedia Commons flags

The **Flag search** fill mode queries the public Commons API
(`action=query&generator=search`, namespace 6, anonymous CORS) — no key, no
proxy, no server. SVG flags come back as rasterised PNG renders, which is what a
canvas fill needs. Each result shows its author and licence; applying one stores
the attribution, licence and file page on the feature and writes them into the
export, because Commons files require it.

If the network is unavailable the search says so plainly, and you can still
paste any image URL (including a Commons file page link, which is resolved to
the file itself) or drop in a local file.

## Layout

```
index.html              app shell: top bar, three tabs, map canvas
styles/app.css          all styling
src/main.js             wiring: tabs, tools, shortcuts, autosave, boot
src/core/util.js        emitter, DOM helpers, formatting
src/core/geo.js         Web Mercator maths, geometry, hit-testing, ring winding
src/core/geojson.js     GeoJSON parsing/serialising, the style model
src/core/store.js       features, selection, undo/redo, defaults
src/map/tiles.js        raster basemap cache with ancestor-tile fallback
src/map/mapview.js      camera, gestures, fractional zoom, render loop
src/render/pyramid.js   image cache + resolution pyramid + level picker
src/render/renderer.js  fills, outlines, labels, selection handles
src/tools.js            select/edit, point, line, polygon, box
src/land/clipping.js    raster coastline clipping: fill, trace, simplify, nest
src/land/landmask.js    Natural Earth download/mirrors/cache, custom land files
src/ui/features.js      Features tab
src/ui/styles.js        Styles tab (colour, image, Commons search)
src/ui/data.js          Data tab (import/export/workspace/coastline data)
src/ui/land.js          Cut sea: the coastline controls in both tabs
src/ui/commons.js       Wikimedia Commons API client
src/state/persist.js    localStorage snapshot
scripts/serve.mjs       static dev server
scripts/syntax-check.mjs static consistency audit
tests/                  logic + end-to-end suites (no browser needed)
```

## Tests

```bash
npm test          # static checks + logic tests + end-to-end app tests
```

There is no browser in CI here, so `tests/dom-stub.mjs` provides a small DOM
and Canvas2D stand-in and `tests/app.test.mjs` boots the real application inside
it: it draws shapes with synthetic pointer events, edits styles through the
actual panel inputs, searches Commons against canned API responses, exports and
re-imports, and records what the renderer paints so the image-fill pyramid level
can be asserted at every zoom level.

```
✓ 19 modules, 116 DOM ids, imports/exports/selectors all consistent
✓ 67 logic tests passed (projection, geojson, store, pyramid levels)
✓ 52 land tests passed (raster clip, tracing, nesting, lines, points)
✓ 66 app tests passed end-to-end
```

`tests/land.test.mjs` covers the clipping maths against synthetic land masks —
a shape straddling a coast, an island, an archipelago, a lake as a hole, a
concave L, corner-touching regions, lines that start and end at sea — and
asserts winding, closure, non-self-intersection, area kept, determinism and a
time budget at Natural Earth scale. The end-to-end suite serves canned coastline
downloads to a stubbed `fetch`, so the real panel is exercised without a
network.

## Notes

* Your work is autosaved to `localStorage` in your own browser only — nothing is
  uploaded anywhere. *Erase saved work* clears it and turns autosave off for the
  session. Uploaded images are kept as object URLs, so a local file fill is not
  restored after a reload; a URL or Commons image is.
* Coastline data is Natural Earth (public domain), fetched from public mirrors
  only when you ask for it and cached in `localStorage`. Nothing about your map
  is uploaded; the only request made is for the coastline file itself.
* Basemaps: OpenStreetMap, CARTO light/dark, or none (a coordinate graticule is
  drawn instead so the app stays usable offline). Tiles need a network
  connection; everything else does not.
* Browser support: any evergreen browser with `PointerEvent`, `Path2D`,
  `ResizeObserver` and `canvas.getTransform()`.
