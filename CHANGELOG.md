# Changelog

All notable changes to GeoJSON Studio are documented here.

## [1.5.1] — 2026-10-15 — Drawing: fast clicks never zoom, no hint box under the cursor

### Fixed
- **Quick clicks while drawing no longer zoom the map.** Leaflet turns two clicks inside its double-click window into a `dblclick` — on touch screens even when the taps land in different places — and its DoubleClickZoom handler zoomed in, so tracing a coastline quickly kept jumping the view. The handler is now paused for the length of a draw session only (`pauseDoubleClickZoom` / `resumeDoubleClickZoom` in `drawTools.js`, wired to `pm:drawstart` / `pm:drawend`): wheel, pinch, the +/− buttons and the keyboard still zoom while you draw, and double-click zoom is back 300 ms after the session ends — past the double-tap window, so the tap that closes a shape cannot zoom either. The split blade (which finishes on double-click) keeps Geoman's own handling.
- **Esc now really stops a Line / Rectangle / Marker session and a line blade.** Geoman's `disableDraw()` only stops the Polygon tool unless told the shape; `endDrawSession()` (uiHelpers) asks Geoman for the active shape first. Used by the split cancel paths and by the new Esc-while-drawing shortcut.

### Changed
- **No more hint box under the cursor.** Geoman's tooltip ("Click to place first vertex", "Click to continue drawing", "Click first marker to finish") is switched off everywhere (`tooltips: false` in the global options and in every `enableDraw` call) — the toasts and status lines already say what to do.
- **Esc abandons the shape being drawn** (toast "Drawing cancelled"); nothing is added to the map.
- Tests: 134 (`draw-fast-clicks.test.jsx` — real Leaflet + Geoman driven by DOM clicks: vertices placed, zoom unchanged, no tooltip, zoom handler restored, tool switching, Esc, split blade).

## [1.5.0] — 2026-10-15 — Graph editor for the easing, one-key country loading, load a country more than once

### Added
- **Graph editor (Animate panel).** An Alight-Motion-style cubic-Bézier editor under the easing select: dark grid, green curve, two large white handles on their guide lines, a dashed playhead. Drag a handle (pointer events — mouse, pen or finger; the nearest handle follows), type `x1 y1 x2 y2` (x clamped to 0–1, y may overshoot −1…2), tap a preset chip, or *Mirror* the curve (play it backwards). A curve that lands exactly on a preset selects that preset in the dropdown; anything else is **Custom (graph editor)** and is kept in `localStorage` (`gs.morphEasingBezier`). The preview eases with the very same curve and the playhead dot rides along it (backwards on the A → B → A return). Export writes `e="cubicBezier x1 y1 x2 y2"` on the destination keyframes, floats printed the way Alight Motion's own serializer prints them (`0.8879618 0.0 0.10184711 1.0` — shortest float32 round-trip, always with a fraction); a straight line exports as linear (no `e`). Module: `src/engine/easingEditor.js`; engine: `setMorphEasingCurve`, `effectiveEasing`, `morphSegmentAt`.
- **Countries one key away.** `L` — or the new *Country* rail button / mobile-menu entry — opens the Map panel on the country loader (now the first block in the panel), focuses the search box and shows the list straight away. Typing filters instantly once the index is in memory (the 140 ms debounce only guards the first, downloading search), **Enter** loads the first match, **Esc** clears the query. *Recent* chips (last 8 countries, `gs.recentCountries`) reload a country in one tap, switching the detail level back to the one it was loaded at.
- **Index warmed at start-up and cached.** The default 50 m world-atlas index is fetched during idle time after the app has mounted (`requestIdleCallback`, skipped on `saveData` connections) and the TopoJSON is kept in Cache Storage (`gs-world-atlas-v1`), so the first search answers immediately — also offline after the first visit. `fetchWorldAtlas(level)`, `buildCountryIndex(level, { silent })`, `prefetchCountryIndex()`.
- **Load the same country again.** Picking a country that is already on the map adds another copy — `Vietnam (2)`, `Vietnam (3)` — with its own colour and its own feature object (a structured clone; Leaflet keeps the GeoJSON it is given as `layer.feature`, so copies would otherwise share one `properties`). Results and recent chips show `loaded ✓ · load again` / `×2 on map · load again`; the status line says `… copy 2 of Vietnam`. Map picking ignores a second tap on the same country within 0.6 s (a double-tap, not a request for a copy); *Country + provinces* mode loads the provinces for the first copy only.
- **Tests:** 132 (`country-loader.test.jsx` — L / Enter / repeated loads / recents / Cache Storage; graph-editor flow in `animate-flow.test.jsx`; custom-curve export, float formatting, `morphSegmentAt`, `presetForBezier` in `morph.test.js`).

### Changed
- **Keyframed outline markup.** A single-contour animated outline is now written as `<path closed="true">` with the `<knot>` elements directly inside — the exact form Alight Motion's own serializer produces (and the form of the user's reference project); the `<contour>` wrapper is only used by AM for multi-contour outlines. Alight Motion reads both; no behavioural change on import.
- Country loader result buttons are handled by one delegated click listener (no inline `onclick`), and the *Detail* / *Load as* selects use React `defaultValue` so the default (50 m, Country) is the same in every browser and in jsdom.

## [1.4.1] — 2026-10-15 — Animator: bridges start on the coast, only what changes moves, dateline shapes stay whole

### Fixed
- **Bridges begin on the real coastline.** The bridge corridors were planned *after* the coast had been thinned, so on a heavily thinned mainland a bridge could leave from a chord that runs inland of the drawn shore. `prepareShape` now plans every bridge on the full-resolution rings (chunked, memoised closest approach) and protects the two foot points through thinning, so each corridor leaves exactly the drawn coast at the point nearest the island — and stays there during the morph.
- **Only the region that changes moves.** Morphing Russia into Russia + Ukraine used to slide the whole outline round (arc-length matching plus a best rotation). The correspondence is now a least-motion alignment (`alignRings`, dynamic time warping on vertex distance): coastline both shapes share pairs with itself and does not move at all; where one shape has extra detail the other gets vertices inserted along its own edges, never moving a drawn vertex. Both shapes are thinned with *shared* per-ring detail thresholds and island choices (`shareThinning`), so common coastline keeps identical vertices. Russia → Russia + Ukraine at 400 points: 364 of 384 points stay put, average travel 8.8 px instead of 90 px. The status line now says `… · 364 stay put, 20 move`.
- **The part of Russia across the dateline is in the animation.** A shape stored as pieces on both edges of the map (Chukotka from −180°, Wrangel's eastern half) is brought round by +360° (`datelineCut`, `shiftedProjection`) and sewn back onto the piece it was cut from (`rejoinAtMeridian` in `antimeridian.js`), so the morph ring, the preview ghost and the export show one whole mainland framed tightly — not a world-wide canvas with a sliver at the far left. Status: `crosses the dateline — kept whole for the animation`.
- **Nothing is dropped while the shape fits the budget as drawn.** A tiny hand-drawn island was dropped by the perimeter-share rule even when the whole shape had a few dozen points.
- **Thinned coasts never cut through islands or fold over themselves.** After thinning, every ring is checked: an island the thinned coast crosses or swallows is dropped and the shape rebuilt without it (so the bridged ring is always a simple polygon), and a coast that folds over itself when thinned (Anadyr inlet at 800–1500 points) is straightened with a 2-opt pass (`untangleRing`).

### Changed
- `prepareMorph` ranks candidates by travel plus `TANGLE_COST` (20 px) per mid-morph crossing instead of refusing any crossing: a least-motion match with one brief local crossing beats a tangle-free match that moves everything. The uniform match is still the fallback and is reported as `even spacing (the least-motion match would cross itself)`.
- `prepareShape(parts, { maxPoints, minRingPoints, gap, cache, share })` returns `rings` (per-ring key, area, bbox, threshold, points), `crossings`, `untangled`; `opts.minAreaFor` is replaced by `opts.share` from `shareThinning(other, own)`. New exports: `effectiveAreas`, `keepByArea`, `prefixArcs`, `alignRings`, `alignmentSeeds`, `densifyPairs`, `untangleRing`, `shareThinning`, `TANGLE_COST`.

## [1.4.0] — 2026-10-14 — Animator: Mercator export, many morphs at once, islands & holes bridged into one outline

### Added
- **Any number of morphs.** The Animate panel is now a list of **From → To** tracks: *Add morph* appends a row, each row has its own *Use selected* buttons, *Swap* and *Remove*, the highlighted row is the one *Use last two shapes* fills. Every complete track becomes its own keyframed `<shape>` layer in the export (ids `2000000001…`, labels `From → To`) and its own ghost in the preview. Incomplete rows are skipped, not blocking. **Several morphs play** *All together* (identical keyframe times) or *One after another* (track *k* morphs in slot *k*; with *A → B → A* the way back runs in reverse order so the last to arrive is the first to leave). `morphTimeline(timing, {index, count, sequence})` in `alightMotionMorph.js` computes the slots; the panel's total time shows `… · 2 morphs in sequence`.
- **Islands and holes are animated — as one outline, with no new borders.** `prepareShape(parts)` in `src/engine/morph.js` joins every part of a multi-polygon (mainland, islands, lakes, islands in lakes) into a *single* ring the way Age of History 2 draws provinces: a **0.02 px corridor** (two parallel edges `BRIDGE_GAP` apart, far below one device pixel, so nothing is visible) runs from each ring to the nearest point of the already-connected piece (vertex-to-edge closest approach, nearest-first greedy, holes attached after their outer ring and traced clockwise so the fill rule keeps them empty). The result is a simple ring (0 self-intersections), positively wound, with the drawn vertices still on it (a vertex that carries a bridge is represented by its two corridor-side copies 0.01 px away). `bridgeRings`, `closestApproach`, `insertPointOnRing`, `orientRing`, `BRIDGE_GAP` are exported too. The point budget is spent across the parts proportional to their perimeter, largest first; islands that cannot get 4 points are dropped (the status says how many) — the mainland is never the one that goes.
- **Status per morph**: `32 points matched · +36 added to One · no tangles (Archipelago: 2 parts + 1 hole joined by 2 hair-thin bridges)`, amber when a crossing is unavoidable or an island had to be dropped.

### Fixed
- **Alight Motion export is now Web Mercator** (`makeAlightProjection(bounds, {projection: 'mercator'})`, the default) — the same projection as the map, so an exported country or morph looks exactly like it does on screen instead of being squashed vertically (the old fit was equirectangular with a single `cos(lat)` x-scale). Applies to the animation export and to the static *Alight Motion* export (polygons, lines and markers); `{projection: 'equirectangular'}` still reproduces the old numbers and the parity-locked 7-argument `buildAlightMotionPathData` / `LineData` are unchanged. Latitude is clamped to ±85.05° as in EPSG:3857.

### Changed
- **State** — `S.morphSourceLayer` / `S.morphTargetLayer` replaced by `S.morphTracks = [{from, to}, …]`, `S.morphActiveTrack`, `S.morphSequence`. `setMorphSource(i)` / `setMorphTarget(i)` / `swapMorphEnds(i)` / `autoPickMorphShapes(i)` take an optional track index (default: the active track); new actions `addMorphTrack`, `removeMorphTrack(i)`, `setActiveMorphTrack(i)`; `setMorphOption('sequence', 'together' | 'sequence')`. `buildMorphPlan()` returns `{tracks: [{from, to, meta, shapeA, shapeB, notes, nameA, nameB, …}], proj, bounds, layers}` plus the first track's fields at top level for compatibility; `buildAlightMotionMorphXML()` returns `{xml, timeline, totalMs, tracks, staticLayers}`. The preview layer is an `L.featureGroup` with one ghost per track.
- **Tests** — `src/__tests__/morph.test.js` grows to 37 cases (closest approach, splice-or-reuse, mainland + islands + hole bridged with area / crossing / winding / corridor-width checks, island chains attach to the nearest piece, island inside a lake, budget allocation and dropping, bridged shapes morph without tangles, sequence timeline, track add / fill / remove / clear, multi-part layer end to end, two tracks exported together and in sequence, Mercator spacing vs `L.CRS.EPSG3857`, margins, equirectangular fallback); `animate-flow.test.jsx` drives the new panel (Add morph, per-row buttons, play-mode select, two ghosts, two layers, remove row). `npm run check`: 79 files, 0 graph problems, 0 TDZ reads, **118 tests**.

## [1.3.1] — 2026-10-14 — Fix: countries spanning the antimeridian drew as bands across the map

### Fixed
- **Russia (and Fiji, Antarctica, the global coastline) no longer draws horizontal bands across the whole world.** `world-atlas` TopoJSON is *geostitched*: a ring that crosses ±180° runs straight from 179.9°E to −180° and relies on a spherical renderer to clip it. Leaflet draws in a flat world, so each such edge became a line across the entire map and the fill between two of them a band (Russia's mainland ring at 65–69°N and Wrangel Island at 71°N — exactly the red stripes in the bug report). Antarctica was also affected in the opposite way: world-atlas stores it as a degenerate ring at the pole with the coastline as its *hole*, so the continent rendered hollow.
- **`src/engine/antimeridian.js`** (new, pure, dependency-free) — `unstitchAntimeridian(geometry)` unwraps every ring into a continuous longitude range (adding ±360° after each jump), closes rings that go all the way round a pole through the pole (and drops geostitch's degenerate pole cap), re-evaluates which ring is the shell, then cuts each polygon into the 360°-wide windows it spans (Sutherland–Hodgman against lng = ±180) and shifts the pieces back into [−180, 180]. Clean geometry is returned by reference (the check is a single pass), so the cost for the 99 % of features that never cross the line is one loop. Also exports `geometryNeedsRepair`, `ringNeedsRepair`, `unwrapRing`, `closePolarRing`, `clipRingToLngRange`, `splitPolygonAtAntimeridian`, `splitLineAtAntimeridian`, `unstitchFeature`, `ringArea`.
- Applied wherever stitched data enters the app: the country index (`ensureCountryIndex` — so search, *Load* and *Select on map* all get the repaired `MultiPolygon`), the provinces index (`ensureAdm1Index`, cheap no-op for pre-split data), the coastline used by **Cut Sea** (`loadGlobalLandmass` — every polygon is split before it is indexed, so the trim mask no longer contains world-wide slivers), the border mesh used by **auto-georeference** (`ensureWorldBorders` — lines are broken where they jump across ±180°), and **GeoJSON import** (`repairGeoDataObject`, called by `loadGeoDataObject`, so a file exported from a stitched source loads correctly too). Import uses **strict mode** (`{ strict: true }`): only rings that are unmistakably geostitched are touched — every jump edge must end exactly on ±180° and the unwrapped ring must still have area — so a saved world-wide background rectangle or a shape drawn across the dateline on the neighbouring world copy (longitudes beyond 180°) loads exactly as it was saved.
- Russia now loads as 101 parts at 50 m instead of 99: the Chukotka tip (−180 … −169.7°) and the eastern half of Wrangel Island become their own polygons on the far-left side of the map, exactly as Natural Earth ships them. Total area is preserved (±0 for ordinary rings); Fiji's degenerate `180 → −180` same-latitude edge collapses to nothing; whole 50 m country index repairs in ≈ 35 ms, the 50 m coastline in ≈ 15 ms.

### Notes
- A ring that crosses the line more than twice would keep a zero-width bridge along ±180° (a limitation of single-pass strip clipping). No ring in world-atlas 110 m / 50 m / 10 m does.
- The 360° edge that runs *along* the pole (Natural Earth's own Antarctica ends `(180, −90) → (−180, −90)`) is deliberately not treated as a crossing.
- Tests — `src/__tests__/antimeridian.test.js` (25 cases: detection, unwrap, strip clipping, straddling square + straddling / one-sided holes with area checks, the real Wrangel Island and Fiji rings from `countries-50m`, a stitched South-Pole ring, the 50 m Antarctica cap-plus-coast layout, mixed `MultiPolygon`, idempotence, line splitting, strict mode keeps world rectangles / cross-dateline drawings / wide hand-drawn edges, import repair). `src/__tests__/country-antimeridian.test.jsx` drives the real app: a stitched world-atlas-style TopoJSON served through a mocked `fetch` → `ensureCountryIndex()` → `loadCountryFeature()` → the Leaflet layer's GeoJSON has no map-wide edge, and `loadGlobalLandmass()` yields split, bounded polygons. `npm run check`: 79 files, 0 graph problems, 0 TDZ reads, 107 tests.

## [1.3.0] — 2026-10-14 — Vector Auto-Animator (shape → shape morph, Alight Motion keyframes)

### Added
- **Animate panel** (`#animate-drawer`, rail button *Animate*, mobile menu entry, shortcut **A**) — draw shape 1, draw shape 2, open Animate: the two most recent polygons are pre-filled as **From** / **To** (or pick them with *Use selected* / *Swap*). *Preview on map* plays the morph as a dashed ghost polygon; *Export Alight Motion animation (.xml)* saves a project whose shape layer morphs on its own.
- **`src/engine/morph.js`** — pure geometry: `cleanRing`, `signedArea`, `addPoints` (inserts extra vertices along the perimeter in proportion to edge length **without moving any drawn vertex**), `simplifyRing` (Visvalingam–Whyatt thinning down to the point budget), `rankRotations` / `bestRotation` (start-vertex alignment by least total travel), `selfIntersections` (swept segment test), `tangleScore`, `prepareMorph` (the whole pipeline: clean → same winding → thin → densify the sparser ring → align start vertex → reject offsets that cross themselves at 9 sampled frames) and `cubicBezierEase`.
- **`src/engine/exporters/alightMotionMorph.js`** — keyframed-outline writer: `<path closed="true"><knot><p><kf t v [e]/>…` (knots directly under `<path>`, as of 1.5.0) with `t` normalised to the layer's own time range, easing only on destination keyframes (`cubicBezier …`, none for linear), identical knot counts across keyframes, optional keyed `<fillColor>` when the two shapes differ in colour, `morphTimeline()` (hold → morph → hold, optional A → B → A), `EASING_PRESETS`, `morphProgressAt()` (preview follows the same curve).
- **`src/engine/animator.js`** — state + UI glue: `setMorphSource` / `setMorphTarget` / `autoPickMorphShapes` / `swapMorphEnds` / `clearMorph`, `setMorphOption` (duration, hold start/end, easing, ping-pong, point budget, animate colour, include other shapes), `buildMorphPlan` (cached per layer + geometry), `startMorphPreview` / `stopMorphPreview` / `toggleMorphPreview` (rAF ghost `L.polygon`, **Esc** stops), `buildAlightMotionMorphXML`, `downloadAlightMotionMorph`, `updateMorphUI`, `initAnimator` (a deleted shape empties its slot), `openAnimateDrawer`, `polygonParts`.
- **`src/engine/exporters/alightMotion.js`** — refactored into reusable pieces without changing output: `makeAlightProjection(bounds)` (+ `project` / `unproject`), `buildAlightShapeXml(layer, proj, {id, name, endTime})`, `alightSceneXml(shapesXml, {totalTime, …})`, `saveXmlFile`, `AM_BASE_ID`, `amFix6` / `amFmt`. `downloadAlightMotionXML()` now composes them; the parity tests still pass.
- **State** — `S.morphSourceLayer`, `S.morphTargetLayer`, `S.morphDuration` (1.5 s), `S.morphHoldStart` / `S.morphHoldEnd` (0.5 s), `S.morphEasing` (`easeInOut`), `S.morphPingPong`, `S.morphMaxPoints` (400), `S.morphIncludeOthers`, `S.morphAnimateColor`, `S.morphPreviewLayer` / `S.morphPreviewRaf` / `S.morphPreviewStart`, `S.morphPlanCache`.
- **Icons** — `arrow-right-left`, `circle-stop`, `clapperboard`, `play`, `repeat`, `timer` registered.
- **Tests** — `src/__tests__/morph.test.js` (26 cases: densification keeps drawn vertices and lands on the outline, proportional distribution, thinning keeps corners, start-vertex recovery, winding alignment, zero tangles at every sampled frame for square→star, star→pentagon, triangle→rectangle and L-shape→circle, timeline maths, XML structure parsed with `DOMParser`, keyed fill colour, ping-pong, full scene export incl. static bystander layers, download capture, preview ghost lifecycle, projection round-trip) and `src/__tests__/animate-flow.test.jsx` (real App + `startEngine()`: rail button, auto-fill, shortcut, preview button, Esc, slider/checkbox → state, deleted shape empties slot, Use selected, export click).

### Changed
- `DRAWER_BUTTON_LABELS` gains `'animate-drawer': 'Animate'`; the shortcut sheet lists **A**.

### Notes
- Only the **largest outer ring** of each shape is morphed (multi-part shapes and holes are reported in the panel status). Pairs that cannot be morphed without crossing (e.g. a U into an upside-down U) are still exported, with the crossing count shown in amber.

## [1.2.7] — 2026-10-14 — Cut Sea: No Islands Mode

### Added
- **No Islands Mode** — `S.cutSeaNoIslands` (default `false`). When on, Cut Sea keeps only the largest landmass (the mainland) and drops every island found inside the drawn area, instead of uniting mainland + islands into one `MultiPolygon`.
- **`cutSeaFromPolygon(layer, opts)`** — new second argument: `{ noIslands: true }` (or a bare boolean) overrides the global toggle for that single call. Resolution order is *explicit option → `S.cutSeaNoIslands`*.
- **`cutSeaNoIslandsNow()`** — one-shot action that trims the active selection (or the last drawn polygon) in mainland-only mode without flipping the saved toggle.
- **`toggleCutSeaNoIslands()` / `updateCutSeaNoIslandsUI()`** — toggle + null-safe UI sync (the latter is called from `startEngine()`).
- **UI** — an *Islands* pill in the desktop header (`#btn-islands-header`, next to Auto-Cut), an *Isles* button in the mobile mode rail (`#btn-islands-mobile`), a *Cut Sea — No Islands Mode* toggle card in Settings (replacing the static "Unified Island Region" badge), and a full-width **Cut Sea (Mainland Only)** button in the Style panel. Labels read `Islands: ON` = islands kept (default), `Islands: OFF` = no-islands mode.
- **Result metadata** — the trimmed shape now carries `islandsRemoved: <n>` and `noIslandsMode: <bool>`, alongside `islandCount: 0` / `isUnifiedIslandRegion: false` when the mode is active.
- **Tests** — `src/__tests__/cut-sea-no-islands.test.js` (9 cases, real Leaflet map + real turf + synthetic coastline fixtures): default mode unites mainland + 2 islands into 3 parts, the option keeps a single `Polygon` with the largest landmass, the global toggle alone drives the cut, an explicit option overrides the toggle in both directions, the one-shot action leaves the toggle untouched, `triggerCutSeaNow()` (Auto-Cut path) respects the mode, the UI pills/checkbox sync, and a mainland-only area is unaffected by the mode.

### Fixed
- **Cut Sea metadata was silently stripped** — `setupLayerProperties()` replaces `feature.properties` with only the style keys, and because `newLayer.feature` and the freshly built `unifiedFeature` are the same object, `islandCount` / `isUnifiedIslandRegion` (and the new `islandsRemoved` / `noIslandsMode`) were lost before an export could ever see them. The metadata is now snapshotted before the normalisation call and re-applied on top.
- **Test harness** — `src/__tests__/dom-stubs.js` now stubs `window.matchMedia` (jsdom lacks it), which `mobileHaptic()` / `isMobileAppUI()` require.

## [1.2.6] — 2026-10-14 — Draw Split Polygon + Split & Delete Polygon

### Added
- **Draw Split Polygon** — `startSplitPolygonMode()` enables a Geoman **Polygon** blade (violet, dashed preview) instead of a line. `executeSplitWithPolygon()` closes the ring, then cuts the locked shape with `turf.intersect` (part **inside** the ring) and `turf.difference` (part **outside**). Both pieces are added as editable shapes named `Region (inside)` / `Region (outside)`, each with its own colour.
- **Split & Delete Polygon** — `startSplitPolygonAndDeleteMode()` draws the same ring but erases it: only the `difference` remainder survives as `Region (trimmed)`. If the blade covers the whole shape, the shape is removed entirely.
- **State** — `S.splitTool` (`'line'` | `'polygon'`) selects which blade `pm:create` routes to; it is reset to `'line'` on cancel, `Escape`, `pm:drawend` and after every execution.
- **UI** — the Draw panel's split section now has two labelled rows: *Line blade* (`Draw Split Line`, `Split & Delete`) and *Polygon blade* (`Draw Split Polygon`, `Split & Delete Polygon`), with the shared **Stop / Cancel** button and the locked-to-selected banner unchanged.
- **Tests** — `src/__tests__/split-polygon.test.js` (6 cases, real Leaflet map + real turf): inside/outside split with area conservation, delete-mode erasure, non-overlapping blade is a no-op, fully-covering blade removes the shape, unclosed rings are closed, and only the pre-selected region is ever cut.

### Fixed
- **Sliver pieces** — a blade that only grazes an edge no longer creates zero-area shapes (`turf.area > 1 m²` required).
- **No shape loss on a grazing blade** — the cut now requires a real *inside* piece before the original is removed. Previously a blade that merely touched the shape's edge (overlapping bbox, zero-area intersection) removed the original and then threw while building the empty piece, silently destroying the shape; it is now a clean no-op. Covered by two regression tests in `split-polygon.test.js`.
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
