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
src/ui/features.js      Features tab
src/ui/styles.js        Styles tab (colour, image, Commons search)
src/ui/data.js          Data tab (import/export/workspace)
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
✓ 16 modules, 104 DOM ids, imports/exports/selectors all consistent
✓ 66 logic tests passed (projection, geojson, store, pyramid levels)
✓ 50 app tests passed end-to-end
```

## Notes

* Your work is autosaved to `localStorage` in your own browser only — nothing is
  uploaded anywhere. *Erase saved work* clears it and turns autosave off for the
  session. Uploaded images are kept as object URLs, so a local file fill is not
  restored after a reload; a URL or Commons image is.
* Basemaps: OpenStreetMap, CARTO light/dark, or none (a coordinate graticule is
  drawn instead so the app stays usable offline). Tiles need a network
  connection; everything else does not.
* Browser support: any evergreen browser with `PointerEvent`, `Path2D`,
  `ResizeObserver` and `canvas.getTransform()`.
