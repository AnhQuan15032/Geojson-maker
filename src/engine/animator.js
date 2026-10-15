// Vector auto-animator — engine glue.
//
// Flow: the user draws shapes, opens the Animate panel and fills one or more
// morph tracks (From → To). Each track becomes one Alight Motion shape layer
// whose outline knots are keyframed; the on-map preview plays every track as
// a ghost polygon. Multi-part shapes (mainland + islands, holes) are joined
// into a single outline by hair-thin bridges (see morph.js) so a country keeps
// its islands without extra layers or borders.
//
// Geometry lives in ./morph.js (pure), XML in ./exporters/alightMotionMorph.js
// (pure); this file owns state, the DOM (track rows, status), the on-map
// preview loop and the download.

import L from 'leaflet';
import { S } from './state.js';
import { PREVIEW_COLOR } from './constants.js';
import { showToast, toggleDrawer } from './uiHelpers.js';
import { prepareMorph, prepareShape, shareThinning, interpolateRing, cubicBezierEase } from './morph.js';
import { rejoinAtMeridian } from './antimeridian.js';
import {
  makeAlightProjection,
  buildAlightShapeXml,
  alightSceneXml,
  saveXmlFile,
  AM_BASE_ID,
} from './exporters/alightMotion.js';
import {
  EASING_PRESETS,
  morphTimeline,
  buildMorphShapeXml,
  morphProgressAt,
} from './exporters/alightMotionMorph.js';
import { escapeXml as escapeHtml, hexToRgbArr, rgbToHexStr } from '../lib/util.js';

const $ = (id) => document.getElementById(id);

// ---- helpers ---------------------------------------------------------------

function isPolygonLayer(layer) {
  return !!layer && layer instanceof L.Polygon;
}

function layerAlive(layer) {
  return isPolygonLayer(layer) && S.drawnItems && S.drawnItems.hasLayer(layer);
}

export function morphLayerName(layer, fallback = 'shape') {
  if (!layer) return fallback;
  const props = (layer.feature && layer.feature.properties) || {};
  return props.name || fallback;
}

function layerFill(layer) {
  const opts = layer.options || {};
  const props = (layer.feature && layer.feature.properties) || {};
  return opts.fillColor || props.fill || PREVIEW_COLOR;
}

/**
 * Normalise Leaflet polygon latlngs ([ring], [outer, holes…] or
 * [[outer, holes…], …]) into parts of { outer, holes }.
 */
export function polygonParts(latlngs) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return [];
  const isLatLng = (v) => v && typeof v === 'object' && 'lat' in v && 'lng' in v;
  if (isLatLng(latlngs[0])) return [{ outer: latlngs, holes: [] }];
  if (Array.isArray(latlngs[0]) && isLatLng(latlngs[0][0])) {
    return [{ outer: latlngs[0], holes: latlngs.slice(1) }];
  }
  return latlngs
    .filter((p) => Array.isArray(p) && p.length && Array.isArray(p[0]))
    .map((p) => ({ outer: p[0], holes: p.slice(1) }));
}

/**
 * Every part of a polygon layer (outer rings + holes), projected to canvas
 * space. With a dateline cut in play the far-west pieces are first brought
 * round by +360° and sewn back onto the pieces they were cut from, so a shape
 * such as Russia morphs as one mainland again instead of a mainland plus a
 * loose sliver at the far edge of the map.
 */
function projectedParts(layer, proj) {
  const toRing = (ring) => ring.map((ll) => {
    const p = proj.project(ll.lat, ll.lng);
    return [p.x, p.y];
  });
  let parts = polygonParts(layer.getLatLngs());
  if (proj.cut != null) {
    const cut = proj.cut;
    const coords = (ring) => ring.map((ll) => [ll.lng <= cut ? ll.lng + 360 : ll.lng, ll.lat]);
    const sewn = rejoinAtMeridian(parts.map((part) => [coords(part.outer), ...part.holes.map(coords)]));
    const open = (ring) => ring.slice(0, -1).map(([lng, lat]) => L.latLng(lat, lng));
    parts = sewn.map(([outer, ...holes]) => ({ outer: open(outer), holes: holes.map(open) }));
  }
  return parts.map((part) => ({
    outer: toRing(part.outer),
    holes: part.holes.map(toRing),
  }));
}

function lerpColor(a, b, t) {
  const ca = hexToRgbArr(a);
  const cb = hexToRgbArr(b);
  if (!ca || !cb) return a;
  return rgbToHexStr(
    Math.round(ca[0] + (cb[0] - ca[0]) * t),
    Math.round(ca[1] + (cb[1] - ca[1]) * t),
    Math.round(ca[2] + (cb[2] - ca[2]) * t),
  );
}

function timingFromState() {
  return {
    durationMs: Math.round(Math.max(0.1, Number(S.morphDuration) || 1.5) * 1000),
    holdStartMs: Math.round(Math.max(0, Number(S.morphHoldStart) || 0) * 1000),
    holdEndMs: Math.round(Math.max(0, Number(S.morphHoldEnd) || 0) * 1000),
    pingPong: !!S.morphPingPong,
  };
}

// ---- tracks ----------------------------------------------------------------

function newTrack() {
  return { from: null, to: null };
}

/** The track list, always holding at least one track (creates it on demand). */
export function morphTracks() {
  if (!Array.isArray(S.morphTracks) || !S.morphTracks.length) S.morphTracks = [newTrack()];
  return S.morphTracks;
}

function commitTracks(tracks) {
  S.morphTracks = tracks.length ? tracks.slice() : [newTrack()];
  if (S.morphActiveTrack >= S.morphTracks.length) S.morphActiveTrack = S.morphTracks.length - 1;
  if (S.morphActiveTrack < 0 || !Number.isFinite(S.morphActiveTrack)) S.morphActiveTrack = 0;
  S.morphPlanCache = null;
}

function trackIndex(index) {
  const tracks = morphTracks();
  const i = index == null ? Number(S.morphActiveTrack) || 0 : Number(index);
  return Math.min(Math.max(0, i | 0), tracks.length - 1);
}

/** Tracks with both ends set and alive — the ones that get animated. */
export function completeTracks() {
  return morphTracks().filter((t) => layerAlive(t.from) && layerAlive(t.to));
}

function requireSelectedPolygon() {
  const layer = S.activeSelectedLayer;
  if (!layerAlive(layer)) {
    showToast('Select a polygon on the map first (tap a shape), then press Use selected');
    return null;
  }
  return layer;
}

function setSlot(index, slot, layer) {
  const tracks = morphTracks().map((t) => ({ ...t }));
  const i = trackIndex(index);
  const other = slot === 'from' ? 'to' : 'from';
  if (tracks[i][other] === layer) tracks[i][other] = null; // a shape cannot morph into itself
  tracks[i][slot] = layer;
  S.morphActiveTrack = i;
  commitTracks(tracks);
  stopMorphPreview();
  updateMorphUI();
}

/** Put the selected polygon into the From slot of a track (default: the active one). */
export function setMorphSource(index) {
  const layer = requireSelectedPolygon();
  if (!layer) return false;
  setSlot(index, 'from', layer);
  showToast(`From: ${morphLayerName(layer)}`);
  return true;
}

/** Put the selected polygon into the To slot of a track (default: the active one). */
export function setMorphTarget(index) {
  const layer = requireSelectedPolygon();
  if (!layer) return false;
  setSlot(index, 'to', layer);
  showToast(`To: ${morphLayerName(layer)}`);
  return true;
}

/** From = second-to-last polygon drawn, To = last one (into the active track). */
export function autoPickMorphShapes(index) {
  const polys = S.drawnItems ? S.drawnItems.getLayers().filter(isPolygonLayer) : [];
  if (polys.length < 2) {
    showToast('Draw two polygons first — the first one morphs into the second');
    return false;
  }
  const tracks = morphTracks().map((t) => ({ ...t }));
  const i = trackIndex(index);
  tracks[i] = { from: polys[polys.length - 2], to: polys[polys.length - 1] };
  S.morphActiveTrack = i;
  commitTracks(tracks);
  stopMorphPreview();
  updateMorphUI();
  showToast(`${morphLayerName(tracks[i].from)} → ${morphLayerName(tracks[i].to)}`);
  return true;
}

export function swapMorphEnds(index) {
  const tracks = morphTracks().map((t) => ({ ...t }));
  const i = trackIndex(index);
  tracks[i] = { from: tracks[i].to, to: tracks[i].from };
  S.morphActiveTrack = i;
  commitTracks(tracks);
  stopMorphPreview();
  updateMorphUI();
}

/** Append an empty From → To track and make it the active one. */
export function addMorphTrack() {
  const tracks = morphTracks().slice();
  tracks.push(newTrack());
  S.morphActiveTrack = tracks.length - 1;
  commitTracks(tracks);
  stopMorphPreview();
  updateMorphUI();
  return tracks.length - 1;
}

/** Remove a track (the last remaining one is emptied instead). */
export function removeMorphTrack(index) {
  const tracks = morphTracks().slice();
  const i = trackIndex(index);
  if (tracks.length > 1) tracks.splice(i, 1);
  else tracks[0] = newTrack();
  if (S.morphActiveTrack >= i && S.morphActiveTrack > 0) S.morphActiveTrack = S.morphActiveTrack - 1;
  commitTracks(tracks);
  stopMorphPreview();
  updateMorphUI();
}

export function setActiveMorphTrack(index) {
  S.morphActiveTrack = trackIndex(index);
  updateMorphUI();
}

/** Back to a single empty track. */
export function clearMorph() {
  S.morphActiveTrack = 0;
  commitTracks([newTrack()]);
  stopMorphPreview();
  updateMorphUI();
}

const OPTION_KEYS = {
  duration: 'morphDuration',
  holdStart: 'morphHoldStart',
  holdEnd: 'morphHoldEnd',
  easing: 'morphEasing',
  pingPong: 'morphPingPong',
  maxPoints: 'morphMaxPoints',
  includeOthers: 'morphIncludeOthers',
  animateColor: 'morphAnimateColor',
  sequence: 'morphSequence',
};

export function setMorphOption(key, value) {
  const field = OPTION_KEYS[key];
  if (!field) return;
  if (key === 'easing') {
    S[field] = EASING_PRESETS[value] ? value : 'easeInOut';
  } else if (key === 'pingPong' || key === 'includeOthers' || key === 'animateColor') {
    S[field] = !!value;
  } else if (key === 'sequence') {
    S[field] = value === true || value === 'sequence' || value === 'true';
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    S[field] = n;
  }
  if (key === 'maxPoints' || key === 'includeOthers') S.morphPlanCache = null;
  // Timing changes apply live to a running preview
  if (S.morphPreviewRaf && (key === 'duration' || key === 'holdStart' || key === 'holdEnd' || key === 'pingPong' || key === 'easing' || key === 'sequence')) {
    S.morphPreviewStart = null;
  }
  updateMorphUI();
}

/** Timeline of track `index` for the current options (all tracks share totalMs). */
export function trackTimeline(index, count) {
  const n = count == null ? Math.max(1, completeTracks().length) : count;
  return morphTimeline(timingFromState(), { index, count: n, sequence: !!S.morphSequence });
}

// ---- plan ------------------------------------------------------------------

/** Every layer that takes part in the plan: the tracks' shapes plus, optionally, all the others. */
function planLayers(tracks, includeOthers) {
  const layers = [];
  const seen = new Set();
  const add = (layer) => {
    if (!layer || seen.has(layer)) return;
    seen.add(layer);
    layers.push(layer);
  };
  for (const t of tracks) { add(t.from); add(t.to); }
  if (includeOthers && S.drawnItems) S.drawnItems.eachLayer(add);
  return layers;
}

/** Every [lat, lng] of a layer (polygons, lines, markers, circles). */
function layerLatLngs(layer) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object' && 'lat' in v) out.push(v);
  };
  if (typeof layer.getLatLngs === 'function') walk(layer.getLatLngs());
  else if (typeof layer.getLatLng === 'function') out.push(layer.getLatLng());
  return out;
}

/**
 * Longitude east of which nothing is shifted and at (or west of) which every
 * coordinate is moved by +360°, or null when no shift is needed. A shape that
 * crosses the dateline is stored as pieces on both edges of the map (Russia:
 * mainland up to 180°, the tip of Chukotka from −180°); for the animation the
 * far-west pieces are brought round so the shape stays whole and the canvas
 * frames it tightly. The cut is placed in the widest longitude gap between
 * the parts, so no part straddles it.
 */
export function datelineCut(layers) {
  const spans = [];
  for (const layer of layers) {
    const parts = typeof layer.getLatLngs === 'function' && layer instanceof L.Polygon
      ? polygonParts(layer.getLatLngs()).map((p) => p.outer)
      : [layerLatLngs(layer)];
    for (const ring of parts) {
      if (!ring.length) continue;
      let min = Infinity;
      let max = -Infinity;
      for (const ll of ring) {
        if (ll.lng < min) min = ll.lng;
        if (ll.lng > max) max = ll.lng;
      }
      spans.push([min, max]);
    }
  }
  if (spans.length < 2) return null;
  spans.sort((a, b) => a[0] - b[0]);
  const west = spans[0][0];
  let east = -Infinity;
  for (const sp of spans) east = Math.max(east, sp[1]);
  if (east - west <= 180) return null; // comfortably on one side of the world
  // widest interior gap between merged spans
  let gap = 0;
  let cut = null;
  let reach = spans[0][1];
  for (let i = 1; i < spans.length; i++) {
    const [a, b] = spans[i];
    if (a > reach && a - reach > gap) {
      gap = a - reach;
      cut = reach;
    }
    reach = Math.max(reach, b);
  }
  const wrapGap = 360 - (east - west); // the gap across the dateline itself
  if (cut == null || gap <= wrapGap) return null;
  return cut;
}

/** Projection that first brings the pieces west of `cut` round by +360° (and back on the way out). */
function shiftedProjection(proj, cut) {
  if (cut == null) return proj;
  return {
    ...proj,
    cut,
    project(lat, lng) {
      return proj.project(lat, lng <= cut ? lng + 360 : lng);
    },
    unproject(x, y) {
      return proj.unproject(x, y); // longitudes > 180 draw east of the dateline, next to the mainland
    },
  };
}

/** Bounds of the plan's layers after the dateline shift. */
function planBounds(layers, cut) {
  let bounds = null;
  for (const layer of layers) {
    for (const ll of layerLatLngs(layer)) {
      const lng = cut != null && ll.lng <= cut ? ll.lng + 360 : ll.lng;
      const p = L.latLng(ll.lat, lng);
      bounds = bounds ? bounds.extend(p) : L.latLngBounds(p, p);
    }
  }
  return bounds;
}

/** Cheap O(n) fingerprint of a layer's geometry (count + coordinate sums). */
function geometrySignature(layer) {
  let count = 0;
  let sumLat = 0;
  let sumLng = 0;
  const walk = (v) => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object' && 'lat' in v) {
      count++;
      sumLat += v.lat * count;
      sumLng += v.lng * count;
    }
  };
  walk(layer.getLatLngs());
  return `${count}:${sumLat.toFixed(6)}:${sumLng.toFixed(6)}`;
}

/**
 * Compute (and cache) the correspondence for every complete track in Alight
 * Motion canvas space. Returns null (with a toast) when no track is ready.
 * The cache is keyed on layer identities + geometry, so edits to any shape are
 * picked up.
 */
export function buildMorphPlan({ quiet = false } = {}) {
  // drop dead layers from the slots first
  const cleaned = morphTracks().map((t) => ({
    from: layerAlive(t.from) ? t.from : null,
    to: layerAlive(t.to) ? t.to : null,
  }));
  if (cleaned.some((t, i) => t.from !== morphTracks()[i].from || t.to !== morphTracks()[i].to)) commitTracks(cleaned);
  const ready = completeTracks();
  if (!ready.length) {
    if (!quiet) showToast('Pick a From shape and a To shape first');
    return null;
  }
  const includeOthers = !!S.morphIncludeOthers;
  const maxPoints = Math.max(3, Number(S.morphMaxPoints) || 400);
  const layers = planLayers(ready, includeOthers);
  const cut = datelineCut(layers);
  const bounds = planBounds(layers, cut);
  const signature = [
    maxPoints, includeOthers ? 1 : 0, bounds.toBBoxString(), cut == null ? '' : cut,
    ...ready.map((t) => `${L.stamp(t.from)}>${L.stamp(t.to)}:${geometrySignature(t.from)}:${geometrySignature(t.to)}`),
  ].join('|');
  if (S.morphPlanCache && S.morphPlanCache.signature === signature) return S.morphPlanCache;

  const proj = shiftedProjection(makeAlightProjection(bounds), cut);
  const tracks = [];
  for (const t of ready) {
    let shapeA;
    let shapeB;
    let morph;
    try {
      const partsA = projectedParts(t.from, proj);
      const partsB = projectedParts(t.to, proj);
      const cacheA = new Map();
      const cacheB = new Map();
      // first pass: each shape on its own; second pass: both follow the other's
      // detail thresholds and island choices, so the coastline they share keeps
      // exactly the same vertices (and does not move at all in the morph)
      const firstA = prepareShape(partsA, { maxPoints, cache: cacheA });
      const firstB = prepareShape(partsB, { maxPoints, cache: cacheB });
      shapeA = prepareShape(partsA, { maxPoints, cache: cacheA, share: shareThinning(firstB, firstA) });
      shapeB = prepareShape(partsB, { maxPoints, cache: cacheB, share: shareThinning(firstA, firstB) });
      morph = prepareMorph(shapeA.ring, shapeB.ring, {
        maxPoints: Math.max(maxPoints, shapeA.ring.length, shapeB.ring.length),
        minPoints: Math.min(32, maxPoints),
      });
    } catch (err) {
      if (!quiet) showToast(`${morphLayerName(t.from)} → ${morphLayerName(t.to)}: ${err.message || 'cannot morph'}`);
      return null;
    }
    const notes = [];
    const describeShape = (shape, name) => {
      const bits = [];
      if (shape.parts > 1) bits.push(`${shape.parts} parts`);
      if (shape.holes) bits.push(`${shape.holes} hole${shape.holes === 1 ? '' : 's'}`);
      if (bits.length) notes.push(`${name}: ${bits.join(' + ')} joined by ${shape.bridges} hair-thin bridge${shape.bridges === 1 ? '' : 's'} from the coast`);
      if (shape.dropped) notes.push(`${name}: ${shape.dropped} tiny part${shape.dropped === 1 ? '' : 's'} dropped — raise the point budget to keep them`);
    };
    if (cut != null) notes.push('crosses the dateline — kept whole for the animation');
    const nameA = morphLayerName(t.from, 'Shape A');
    const nameB = morphLayerName(t.to, 'Shape B');
    describeShape(shapeA, nameA);
    describeShape(shapeB, nameB);
    let still = 0;
    for (let i = 0; i < morph.from.length; i++) {
      const dx = morph.from[i][0] - morph.to[i][0];
      const dy = morph.from[i][1] - morph.to[i][1];
      if (dx * dx + dy * dy < 1e-12) still++;
    }
    tracks.push({
      from: morph.from,
      to: morph.to,
      meta: { ...morph, removedA: morph.removedA + shapeA.removed, removedB: morph.removedB + shapeB.removed, still },
      shapeA,
      shapeB,
      notes,
      nameA,
      nameB,
      fillA: layerFill(t.from),
      fillB: layerFill(t.to),
      layerA: t.from,
      layerB: t.to,
    });
  }
  const plan = {
    signature,
    proj,
    bounds,
    cut,
    tracks,
    // first track mirrors the old single-track fields so callers/tests stay simple
    from: tracks[0].from,
    to: tracks[0].to,
    meta: tracks[0].meta,
    notes: tracks[0].notes,
    nameA: tracks[0].nameA,
    nameB: tracks[0].nameB,
    fillA: tracks[0].fillA,
    fillB: tracks[0].fillB,
    layerA: tracks[0].layerA,
    layerB: tracks[0].layerB,
    layers: new Set(tracks.flatMap((t) => [t.layerA, t.layerB])),
  };
  S.morphPlanCache = plan;
  return plan;
}

// ---- preview ---------------------------------------------------------------

export function stopMorphPreview() {
  if (S.morphPreviewRaf) {
    cancelAnimationFrame(S.morphPreviewRaf);
    S.morphPreviewRaf = null;
  }
  if (S.morphPreviewLayer) {
    try { S.map && S.map.removeLayer(S.morphPreviewLayer); } catch (e) { /* already gone */ }
    S.morphPreviewLayer = null;
  }
  S.morphPreviewStart = null;
  syncPreviewButton(false);
}

function syncPreviewButton(playing) {
  const btn = $('btn-morph-preview');
  if (!btn) return;
  btn.classList.toggle('is-playing', playing);
  btn.setAttribute('aria-pressed', String(playing));
  const label = btn.querySelector('[data-label]');
  if (label) label.textContent = playing ? 'Stop preview' : 'Preview on map';
}

export function toggleMorphPreview() {
  if (S.morphPreviewRaf) {
    stopMorphPreview();
    return false;
  }
  return startMorphPreview();
}

/**
 * Play every track as a dashed ghost polygon. `S.morphPreviewLayer` is a
 * feature group holding one ghost per track.
 */
export function startMorphPreview() {
  const plan = buildMorphPlan();
  if (!plan || !S.map) return false;
  stopMorphPreview();

  const toLatLngs = (ring) => ring.map(([x, y]) => {
    const ll = plan.proj.unproject(x, y);
    return [ll.lat, ll.lng];
  });
  const group = L.featureGroup([], { interactive: false });
  const ghosts = plan.tracks.map((t) => {
    const ghost = L.polygon(toLatLngs(t.from), {
      color: '#ffffff',
      weight: 2,
      dashArray: '6 5',
      opacity: 0.95,
      fillColor: t.fillA,
      fillOpacity: 0.85,
      interactive: false,
      className: 'morph-preview-ghost',
    });
    group.addLayer(ghost);
    return ghost;
  });
  group.addTo(S.map);
  S.morphPreviewLayer = group;
  S.morphPreviewStart = null;
  syncPreviewButton(true);

  const frame = (now) => {
    if (S.morphPreviewLayer !== group) return; // stopped or replaced
    if (plan.tracks.some((t) => !layerAlive(t.layerA) || !layerAlive(t.layerB))) {
      stopMorphPreview();
      updateMorphUI();
      return;
    }
    if (S.morphPreviewStart == null) S.morphPreviewStart = now;
    const count = plan.tracks.length;
    const total = trackTimeline(0, count).totalMs;
    const ms = (now - S.morphPreviewStart) % total;
    plan.tracks.forEach((t, i) => {
      const timeline = trackTimeline(i, count);
      const u = morphProgressAt(ms, timeline, S.morphEasing, cubicBezierEase);
      ghosts[i].setLatLngs(toLatLngs(interpolateRing(t.from, t.to, u)));
      if (S.morphAnimateColor && t.fillA !== t.fillB) {
        ghosts[i].setStyle({ fillColor: lerpColor(t.fillA, t.fillB, u) });
      }
    });
    const clock = $('morph-preview-clock');
    if (clock) clock.textContent = `${(ms / 1000).toFixed(1)}s / ${(total / 1000).toFixed(1)}s`;
    S.morphPreviewRaf = requestAnimationFrame(frame);
  };
  S.morphPreviewRaf = requestAnimationFrame(frame);
  showToast(`Previewing ${plan.tracks.length > 1 ? `${plan.tracks.length} morphs` : 'morph'} — press Stop or Esc to end`);
  return true;
}

// ---- export ----------------------------------------------------------------

/**
 * Build the full Alight Motion project XML for the current tracks. Exposed for
 * tests; downloadAlightMotionMorph() wraps it with the file download.
 */
export function buildAlightMotionMorphXML(plan = buildMorphPlan()) {
  if (!plan) return null;
  const count = plan.tracks.length;
  const totalMs = trackTimeline(0, count).totalMs;
  let shapesXml = '';
  let counter = 0;
  if (S.morphIncludeOthers) {
    let idx = 0;
    S.drawnItems.eachLayer((layer) => {
      idx++;
      if (plan.layers.has(layer)) return;
      const props = (layer.feature && layer.feature.properties) || {};
      const xml = buildAlightShapeXml(layer, plan.proj, {
        id: AM_BASE_ID + counter + 1,
        name: props.name || `Shape_${idx}`,
        endTime: totalMs,
      });
      if (xml) {
        counter++;
        shapesXml += xml;
      }
    });
  }
  // Animated layers go last = on top (AM lists layers bottom→top)
  plan.tracks.forEach((t, i) => {
    shapesXml += buildMorphShapeXml({
      id: AM_BASE_ID + counter + 1,
      label: `${t.nameA} → ${t.nameB}`,
      from: t.from,
      to: t.to,
      fillA: t.fillA,
      fillB: t.fillB,
      animateColor: !!S.morphAnimateColor,
      timeline: trackTimeline(i, count),
      easing: S.morphEasing,
    });
    counter++;
  });
  return {
    xml: alightSceneXml(shapesXml, {
      canvasWidth: plan.proj.canvasWidth,
      canvasHeight: plan.proj.canvasHeight,
      totalTime: totalMs,
      title: 'Vector Morph Project',
    }),
    timeline: trackTimeline(0, count),
    totalMs,
    tracks: count,
    staticLayers: counter - count,
  };
}

export function downloadAlightMotionMorph() {
  const plan = buildMorphPlan();
  if (!plan) return false;
  const built = buildAlightMotionMorphXML(plan);
  if (!built) return false;
  saveXmlFile(built.xml, `alightmotion_morph_${Date.now()}.xml`);
  const points = plan.tracks.reduce((n, t) => n + t.meta.pointCount, 0);
  const extra = built.staticLayers ? ` + ${built.staticLayers} static layer${built.staticLayers === 1 ? '' : 's'}` : '';
  showToast(`Alight Motion animation downloaded — ${built.tracks} morph${built.tracks === 1 ? '' : 's'}, ${points} keyframed points${extra}`);
  return true;
}

// ---- UI sync ---------------------------------------------------------------

function describeMeta(track) {
  const m = track.meta;
  const bits = [`${m.pointCount} points matched`];
  if (m.still > 0 && m.still < m.pointCount) bits.push(`${m.still} stay put, ${m.pointCount - m.still} move`);
  if (m.addedA > 0) bits.push(`+${m.addedA} added to ${track.nameA}`);
  if (m.addedB > 0) bits.push(`+${m.addedB} added to ${track.nameB}`);
  if (m.removedA > 0) bits.push(`${m.removedA} thinned from ${track.nameA}`);
  if (m.removedB > 0) bits.push(`${m.removedB} thinned from ${track.nameB}`);
  if (m.reversed) bits.push('winding aligned');
  if (m.matching === 'uniform') bits.push('even spacing (the least-motion match would cross itself)');
  bits.push(m.tangles === 0
    ? 'no tangles'
    : `${m.tangles} crossing${m.tangles === 1 ? '' : 's'} mid-way — these outlines are too different to morph without briefly overlapping`);
  return bits.join(' · ');
}

const SLOT_PLACEHOLDER = {
  from: 'Not set — select a shape, press Use selected',
  to: 'Not set — select the end shape',
};

function slotHtml(index, slot, layer) {
  const name = layer ? escapeHtml(morphLayerName(layer)) : SLOT_PLACEHOLDER[slot];
  const dot = layer ? `background:${escapeHtml(layerFill(layer))}` : 'background:transparent';
  return `
    <div class="flex items-center gap-2">
      <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 w-10 shrink-0">${slot === 'from' ? 'From' : 'To'}</span>
      <span id="morph-${slot}-dot-${index}" class="w-3 h-3 rounded-full border border-slate-600 shrink-0" style="${dot}"></span>
      <span id="morph-${slot}-name-${index}" class="flex-1 min-w-0 truncate text-xs ${layer ? 'text-white' : 'text-slate-500'}">${name}</span>
      <button type="button" data-action="use-${slot}" data-track="${index}" class="shrink-0 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-[0.98] rounded-lg text-[10px] font-bold text-slate-100 transition">Use selected</button>
    </div>`;
}

function renderTracks() {
  const host = $('morph-tracks');
  if (!host) return;
  const tracks = morphTracks();
  const active = trackIndex();
  host.innerHTML = tracks.map((t, i) => `
    <div class="morph-track rounded-xl border ${i === active ? 'border-violet-500/70 bg-slate-800/90' : 'border-slate-700/70 bg-slate-800/60'} p-2.5 space-y-2" data-track="${i}" data-action="activate">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wide ${i === active ? 'text-violet-300' : 'text-slate-400'}">Morph ${i + 1}${tracks.length > 1 && i === active ? ' · active' : ''}</span>
        <div class="flex items-center gap-1">
          <button type="button" data-action="swap" data-track="${i}" title="Swap From and To" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold text-slate-100 transition">Swap</button>
          <button type="button" data-action="remove" data-track="${i}" title="${tracks.length > 1 ? 'Remove this morph' : 'Clear this morph'}" aria-label="${tracks.length > 1 ? 'Remove this morph' : 'Clear this morph'}" class="px-2 py-1 bg-slate-700 hover:bg-rose-600/80 rounded-lg text-[10px] font-bold text-slate-100 transition">${tracks.length > 1 ? 'Remove' : 'Clear'}</button>
        </div>
      </div>
      ${slotHtml(i, 'from', layerAlive(t.from) ? t.from : null)}
      ${slotHtml(i, 'to', layerAlive(t.to) ? t.to : null)}
      <p id="morph-track-status-${i}" class="text-[10px] leading-relaxed text-slate-500"></p>
    </div>`).join('');
}

function onTracksClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const index = Number(btn.getAttribute('data-track'));
  if (action === 'activate') {
    if (index !== trackIndex()) setActiveMorphTrack(index);
    return;
  }
  e.stopPropagation();
  if (action === 'use-from') setMorphSource(index);
  else if (action === 'use-to') setMorphTarget(index);
  else if (action === 'swap') swapMorphEnds(index);
  else if (action === 'remove') removeMorphTrack(index);
}

export function updateMorphUI() {
  const drawer = $('animate-drawer');
  if (!drawer) return;
  const tracks = morphTracks();
  // forget shapes that left the map
  const cleaned = tracks.map((t) => ({ from: layerAlive(t.from) ? t.from : null, to: layerAlive(t.to) ? t.to : null }));
  if (cleaned.some((t, i) => t.from !== tracks[i].from || t.to !== tracks[i].to)) commitTracks(cleaned);

  const host = $('morph-tracks');
  if (host && !host._morphWired) {
    host._morphWired = true;
    host.addEventListener('click', onTracksClick);
  }
  renderTracks();

  const ready = completeTracks();
  ['btn-morph-preview', 'btn-morph-export'].forEach((id) => {
    const b = $(id);
    if (b) {
      b.disabled = !ready.length;
      b.setAttribute('aria-disabled', String(!ready.length));
    }
  });

  const count = Math.max(1, ready.length);
  const timeline = trackTimeline(0, count);
  const total = $('morph-total-time');
  if (total) total.textContent = `${(timeline.totalMs / 1000).toFixed(1)} s total${ready.length > 1 ? ` · ${ready.length} morphs ${S.morphSequence ? 'in sequence' : 'together'}` : ''}`;
  const dur = $('morph-duration-val');
  if (dur) dur.textContent = `${Number(S.morphDuration || 1.5).toFixed(1)} s`;
  const hs = $('morph-hold-start-val');
  if (hs) hs.textContent = `${Number(S.morphHoldStart || 0).toFixed(1)} s`;
  const he = $('morph-hold-end-val');
  if (he) he.textContent = `${Number(S.morphHoldEnd || 0).toFixed(1)} s`;
  const seq = $('morph-sequence');
  if (seq) seq.value = S.morphSequence ? 'sequence' : 'together';

  const status = $('morph-status');
  if (!ready.length) {
    if (status) {
      const polys = S.drawnItems ? S.drawnItems.getLayers().filter(isPolygonLayer).length : 0;
      status.textContent = polys >= 2
        ? 'Two shapes found — press “Use last two shapes” or pick them one by one. Islands and holes are kept automatically.'
        : 'Draw two polygons: the first is the start, the second is what it turns into.';
      status.className = 'text-[10px] text-slate-400 leading-relaxed';
    }
  } else {
    const plan = buildMorphPlan({ quiet: true });
    if (!plan) {
      if (status) {
        status.textContent = 'These shapes cannot be morphed (need at least 3 distinct points each).';
        status.className = 'text-[10px] text-rose-300 leading-relaxed';
      }
    } else {
      // per-track lines
      let tangles = 0;
      let points = 0;
      plan.tracks.forEach((t) => {
        tangles += t.meta.tangles;
        points += t.meta.pointCount;
        const idx = morphTracks().findIndex((x) => x.from === t.layerA && x.to === t.layerB);
        const line = $(`morph-track-status-${idx}`);
        if (line) {
          const notes = t.notes.length ? ` (${t.notes.join('; ')})` : '';
          line.textContent = `${describeMeta(t)}${notes}`;
          line.className = `text-[10px] leading-relaxed ${t.meta.tangles ? 'text-amber-300' : 'text-emerald-300'}`;
        }
      });
      if (status) {
        const incomplete = tracks.length - plan.tracks.length;
        let text;
        if (plan.tracks.length === 1) {
          const t = plan.tracks[0];
          text = describeMeta(t) + (t.notes.length ? ` (${t.notes.join('; ')})` : '');
        } else {
          text = `${plan.tracks.length} morphs ready · ${points} keyframed points · ${tangles
            ? `${tangles} crossing${tangles === 1 ? '' : 's'} mid-way (see the amber morphs)`
            : 'no tangles'}`;
        }
        if (incomplete) text += ` · ${incomplete} morph${incomplete === 1 ? '' : 's'} still missing a shape (skipped)`;
        status.textContent = text;
        status.className = `text-[10px] leading-relaxed ${tangles ? 'text-amber-300' : 'text-emerald-300'}`;
      }
    }
  }
  if (!S.morphPreviewRaf) syncPreviewButton(false);
}

/** Open the Animate panel; auto-fills the first track from the last two polygons when it is empty. */
export function openAnimateDrawer() {
  const polys = S.drawnItems ? S.drawnItems.getLayers().filter(isPolygonLayer) : [];
  const tracks = morphTracks();
  if (tracks.length === 1 && !tracks[0].from && !tracks[0].to && polys.length >= 2) {
    commitTracks([{ from: polys[polys.length - 2], to: polys[polys.length - 1] }]);
  }
  toggleDrawer('animate-drawer');
  updateMorphUI();
}

/**
 * Wire the animator to the shapes layer group: a removed shape empties its
 * slot immediately and the panel's status follows draws/deletes while open.
 * Idempotent per layer group.
 */
export function initAnimator() {
  const group = S.drawnItems;
  if (!group || group._morphHooked) return;
  group._morphHooked = true;
  group.on('layerremove', (e) => forgetMorphLayer(e.layer));
  group.on('layeradd layerremove', () => {
    const drawer = $('animate-drawer');
    if (drawer && drawer.classList.contains('open')) updateMorphUI();
  });
  updateMorphUI();
}

/** Called when a layer leaves the map so stale slots never linger. */
export function forgetMorphLayer(layer) {
  if (!layer) return;
  const tracks = morphTracks();
  if (!tracks.some((t) => t.from === layer || t.to === layer)) return;
  commitTracks(tracks.map((t) => ({ from: t.from === layer ? null : t.from, to: t.to === layer ? null : t.to })));
  stopMorphPreview();
  updateMorphUI();
}
