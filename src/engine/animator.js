// Vector auto-animator — engine glue.
//
// Flow: the user draws shape 1, draws shape 2, opens the Animate panel, sets
// the From/To slots (or lets "Use last two shapes" pick them), previews the
// morph as a ghost polygon on the map, and exports it as an Alight Motion
// project whose single shape layer carries keyframed outline knots.
//
// Geometry lives in ./morph.js (pure), XML in ./exporters/alightMotionMorph.js
// (pure); this file owns state, the DOM status chips, the on-map preview loop
// and the download.

import L from 'leaflet';
import { S } from './state.js';
import { PREVIEW_COLOR } from './constants.js';
import { showToast, toggleDrawer } from './uiHelpers.js';
import { prepareMorph, interpolateRing, signedArea, cubicBezierEase } from './morph.js';
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
import { hexToRgbArr, rgbToHexStr } from '../lib/util.js';

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

/** Largest outer ring of a polygon layer, projected to canvas space. */
function largestProjectedRing(layer, proj) {
  const parts = polygonParts(layer.getLatLngs());
  let best = null;
  let bestArea = -1;
  let holes = 0;
  for (const part of parts) {
    holes += part.holes.length;
    const ring = part.outer.map((ll) => {
      const p = proj.project(ll.lat, ll.lng);
      return [p.x, p.y];
    });
    const area = Math.abs(signedArea(ring));
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  return { ring: best, parts: parts.length, holes };
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

// ---- slots -----------------------------------------------------------------

function requireSelectedPolygon() {
  const layer = S.activeSelectedLayer;
  if (!layerAlive(layer)) {
    showToast('Select a polygon on the map first (tap a shape), then press Use selected');
    return null;
  }
  return layer;
}

export function setMorphSource() {
  const layer = requireSelectedPolygon();
  if (!layer) return false;
  if (S.morphTargetLayer === layer) S.morphTargetLayer = null;
  S.morphSourceLayer = layer;
  stopMorphPreview();
  updateMorphUI();
  showToast(`From: ${morphLayerName(layer)}`);
  return true;
}

export function setMorphTarget() {
  const layer = requireSelectedPolygon();
  if (!layer) return false;
  if (S.morphSourceLayer === layer) S.morphSourceLayer = null;
  S.morphTargetLayer = layer;
  stopMorphPreview();
  updateMorphUI();
  showToast(`To: ${morphLayerName(layer)}`);
  return true;
}

/** From = second-to-last polygon drawn, To = last one. */
export function autoPickMorphShapes() {
  const polys = S.drawnItems ? S.drawnItems.getLayers().filter(isPolygonLayer) : [];
  if (polys.length < 2) {
    showToast('Draw two polygons first — the first one morphs into the second');
    return false;
  }
  S.morphSourceLayer = polys[polys.length - 2];
  S.morphTargetLayer = polys[polys.length - 1];
  stopMorphPreview();
  updateMorphUI();
  showToast(`${morphLayerName(S.morphSourceLayer)} → ${morphLayerName(S.morphTargetLayer)}`);
  return true;
}

export function swapMorphEnds() {
  const a = S.morphSourceLayer;
  S.morphSourceLayer = S.morphTargetLayer;
  S.morphTargetLayer = a;
  stopMorphPreview();
  updateMorphUI();
}

export function clearMorph() {
  S.morphSourceLayer = null;
  S.morphTargetLayer = null;
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
};

export function setMorphOption(key, value) {
  const field = OPTION_KEYS[key];
  if (!field) return;
  if (key === 'easing') {
    S[field] = EASING_PRESETS[value] ? value : 'easeInOut';
  } else if (key === 'pingPong' || key === 'includeOthers' || key === 'animateColor') {
    S[field] = !!value;
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    S[field] = n;
  }
  if (key === 'maxPoints') S.morphPlanCache = null;
  // Timing changes apply live to a running preview
  if (S.morphPreviewRaf && (key === 'duration' || key === 'holdStart' || key === 'holdEnd' || key === 'pingPong' || key === 'easing')) {
    S.morphPreviewStart = null;
  }
  updateMorphUI();
}

// ---- plan ------------------------------------------------------------------

function morphBounds(a, b, includeOthers) {
  if (includeOthers && S.drawnItems && S.drawnItems.getLayers().length) return S.drawnItems.getBounds();
  return L.latLngBounds(a.getBounds().getSouthWest(), a.getBounds().getNorthEast()).extend(b.getBounds());
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
 * Compute (and cache) the correspondence between the two slots in Alight
 * Motion canvas space. Returns null (with a toast) when the slots are not
 * ready. The cache is keyed on layer identity + geometry, so edits to either
 * shape are picked up.
 */
export function buildMorphPlan({ quiet = false } = {}) {
  const a = S.morphSourceLayer;
  const b = S.morphTargetLayer;
  if (!layerAlive(a) || !layerAlive(b)) {
    if (!layerAlive(a)) S.morphSourceLayer = null;
    if (!layerAlive(b)) S.morphTargetLayer = null;
    if (!quiet) showToast('Pick a From shape and a To shape first');
    return null;
  }
  const includeOthers = !!S.morphIncludeOthers;
  const maxPoints = Math.max(3, Number(S.morphMaxPoints) || 400);
  const bounds = morphBounds(a, b, includeOthers);
  const signature = [
    L.stamp(a), L.stamp(b), maxPoints, includeOthers ? 1 : 0,
    bounds.toBBoxString(), geometrySignature(a), geometrySignature(b),
  ].join('|');
  if (S.morphPlanCache && S.morphPlanCache.signature === signature) return S.morphPlanCache;

  const proj = makeAlightProjection(bounds);
  const ringA = largestProjectedRing(a, proj);
  const ringB = largestProjectedRing(b, proj);
  let morph;
  try {
    morph = prepareMorph(ringA.ring, ringB.ring, { maxPoints, minPoints: Math.min(32, maxPoints) });
  } catch (err) {
    if (!quiet) showToast(err.message || 'Cannot morph these shapes');
    return null;
  }
  const notes = [];
  if (ringA.parts > 1 || ringB.parts > 1) notes.push('only the largest part of a multi-part shape is animated');
  if (ringA.holes || ringB.holes) notes.push('holes are ignored');
  const plan = {
    signature,
    proj,
    bounds,
    from: morph.from,
    to: morph.to,
    meta: morph,
    notes,
    nameA: morphLayerName(a, 'Shape A'),
    nameB: morphLayerName(b, 'Shape B'),
    fillA: layerFill(a),
    fillB: layerFill(b),
    layerA: a,
    layerB: b,
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

export function startMorphPreview() {
  const plan = buildMorphPlan();
  if (!plan || !S.map) return false;
  stopMorphPreview();

  const toLatLngs = (ring) => ring.map(([x, y]) => {
    const ll = plan.proj.unproject(x, y);
    return [ll.lat, ll.lng];
  });
  const ghost = L.polygon(toLatLngs(plan.from), {
    color: '#ffffff',
    weight: 2,
    dashArray: '6 5',
    opacity: 0.95,
    fillColor: plan.fillA,
    fillOpacity: 0.85,
    interactive: false,
    className: 'morph-preview-ghost',
  }).addTo(S.map);
  S.morphPreviewLayer = ghost;
  S.morphPreviewStart = null;
  syncPreviewButton(true);

  const frame = (now) => {
    if (S.morphPreviewLayer !== ghost) return; // stopped or replaced
    if (!layerAlive(plan.layerA) || !layerAlive(plan.layerB)) {
      stopMorphPreview();
      updateMorphUI();
      return;
    }
    if (S.morphPreviewStart == null) S.morphPreviewStart = now;
    const timeline = morphTimeline(timingFromState());
    const ms = (now - S.morphPreviewStart) % timeline.totalMs;
    const u = morphProgressAt(ms, timeline, S.morphEasing, cubicBezierEase);
    ghost.setLatLngs(toLatLngs(interpolateRing(plan.from, plan.to, u)));
    if (S.morphAnimateColor && plan.fillA !== plan.fillB) {
      ghost.setStyle({ fillColor: lerpColor(plan.fillA, plan.fillB, u) });
    }
    const clock = $('morph-preview-clock');
    if (clock) clock.textContent = `${(ms / 1000).toFixed(1)}s / ${(timeline.totalMs / 1000).toFixed(1)}s`;
    S.morphPreviewRaf = requestAnimationFrame(frame);
  };
  S.morphPreviewRaf = requestAnimationFrame(frame);
  showToast('Previewing morph — press Stop or Esc to end');
  return true;
}

// ---- export ----------------------------------------------------------------

/**
 * Build the full Alight Motion project XML for the current morph. Exposed for
 * tests; downloadAlightMotionMorph() wraps it with the file download.
 */
export function buildAlightMotionMorphXML(plan = buildMorphPlan()) {
  if (!plan) return null;
  const timeline = morphTimeline(timingFromState());
  let shapesXml = '';
  let counter = 0;
  if (S.morphIncludeOthers) {
    let idx = 0;
    S.drawnItems.eachLayer((layer) => {
      idx++;
      if (layer === plan.layerA || layer === plan.layerB) return;
      const props = (layer.feature && layer.feature.properties) || {};
      const xml = buildAlightShapeXml(layer, plan.proj, {
        id: AM_BASE_ID + counter + 1,
        name: props.name || `Shape_${idx}`,
        endTime: timeline.totalMs,
      });
      if (xml) {
        counter++;
        shapesXml += xml;
      }
    });
  }
  // Animated layer goes last = on top (AM lists layers bottom→top)
  shapesXml += buildMorphShapeXml({
    id: AM_BASE_ID + counter + 1,
    label: `${plan.nameA} → ${plan.nameB}`,
    from: plan.from,
    to: plan.to,
    fillA: plan.fillA,
    fillB: plan.fillB,
    animateColor: !!S.morphAnimateColor,
    timeline,
    easing: S.morphEasing,
  });
  return {
    xml: alightSceneXml(shapesXml, {
      canvasWidth: plan.proj.canvasWidth,
      canvasHeight: plan.proj.canvasHeight,
      totalTime: timeline.totalMs,
      title: 'Vector Morph Project',
    }),
    timeline,
    staticLayers: counter,
  };
}

export function downloadAlightMotionMorph() {
  const plan = buildMorphPlan();
  if (!plan) return false;
  const built = buildAlightMotionMorphXML(plan);
  if (!built) return false;
  saveXmlFile(built.xml, `alightmotion_morph_${Date.now()}.xml`);
  const extra = built.staticLayers ? ` + ${built.staticLayers} static layer${built.staticLayers === 1 ? '' : 's'}` : '';
  showToast(`Alight Motion animation downloaded — ${plan.meta.pointCount} keyframed points${extra}`);
  return true;
}

// ---- UI sync ---------------------------------------------------------------

function describeMeta(plan) {
  const m = plan.meta;
  const bits = [`${m.pointCount} points matched`];
  if (m.addedA > 0) bits.push(`+${m.addedA} added to ${plan.nameA}`);
  if (m.addedB > 0) bits.push(`+${m.addedB} added to ${plan.nameB}`);
  if (m.removedA > 0) bits.push(`${m.removedA} thinned from ${plan.nameA}`);
  if (m.removedB > 0) bits.push(`${m.removedB} thinned from ${plan.nameB}`);
  if (m.reversed) bits.push('winding aligned');
  bits.push(m.tangles === 0
    ? 'no tangles'
    : `${m.tangles} crossing${m.tangles === 1 ? '' : 's'} mid-way — these outlines are too different to morph without briefly overlapping`);
  return bits.join(' · ');
}

export function updateMorphUI() {
  const drawer = $('animate-drawer');
  if (!drawer) return;
  if (S.morphSourceLayer && !layerAlive(S.morphSourceLayer)) S.morphSourceLayer = null;
  if (S.morphTargetLayer && !layerAlive(S.morphTargetLayer)) S.morphTargetLayer = null;

  const setSlot = (nameId, dotId, layer, placeholder) => {
    const nameEl = $(nameId);
    const dot = $(dotId);
    if (nameEl) {
      nameEl.textContent = layer ? morphLayerName(layer) : placeholder;
      nameEl.classList.toggle('text-slate-500', !layer);
      nameEl.classList.toggle('text-white', !!layer);
    }
    if (dot) dot.style.background = layer ? layerFill(layer) : 'transparent';
  };
  setSlot('morph-from-name', 'morph-from-dot', S.morphSourceLayer, 'Not set — select a shape, press Use selected');
  setSlot('morph-to-name', 'morph-to-dot', S.morphTargetLayer, 'Not set — select the end shape');

  const ready = layerAlive(S.morphSourceLayer) && layerAlive(S.morphTargetLayer);
  ['btn-morph-preview', 'btn-morph-export'].forEach((id) => {
    const b = $(id);
    if (b) {
      b.disabled = !ready;
      b.setAttribute('aria-disabled', String(!ready));
    }
  });

  const timeline = morphTimeline(timingFromState());
  const total = $('morph-total-time');
  if (total) total.textContent = `${(timeline.totalMs / 1000).toFixed(1)} s total`;
  const dur = $('morph-duration-val');
  if (dur) dur.textContent = `${Number(S.morphDuration || 1.5).toFixed(1)} s`;
  const hs = $('morph-hold-start-val');
  if (hs) hs.textContent = `${Number(S.morphHoldStart || 0).toFixed(1)} s`;
  const he = $('morph-hold-end-val');
  if (he) he.textContent = `${Number(S.morphHoldEnd || 0).toFixed(1)} s`;

  const status = $('morph-status');
  if (status) {
    if (!ready) {
      const polys = S.drawnItems ? S.drawnItems.getLayers().filter(isPolygonLayer).length : 0;
      status.textContent = polys >= 2
        ? 'Two shapes found — press “Use last two shapes” or pick them one by one.'
        : 'Draw two polygons: the first is the start, the second is what it turns into.';
      status.className = 'text-[10px] text-slate-400 leading-relaxed';
    } else {
      const plan = buildMorphPlan({ quiet: true });
      if (!plan) {
        status.textContent = 'These shapes cannot be morphed (need at least 3 distinct points each).';
        status.className = 'text-[10px] text-rose-300 leading-relaxed';
      } else {
        const notes = plan.notes.length ? ` (${plan.notes.join('; ')})` : '';
        status.textContent = `${describeMeta(plan)}${notes}`;
        status.className = `text-[10px] leading-relaxed ${plan.meta.tangles ? 'text-amber-300' : 'text-emerald-300'}`;
      }
    }
  }
  if (!S.morphPreviewRaf) syncPreviewButton(false);
}

/** Open the Animate panel; auto-fills the slots from the last two polygons when both are empty. */
export function openAnimateDrawer() {
  const polys = S.drawnItems ? S.drawnItems.getLayers().filter(isPolygonLayer) : [];
  if (!S.morphSourceLayer && !S.morphTargetLayer && polys.length >= 2) {
    S.morphSourceLayer = polys[polys.length - 2];
    S.morphTargetLayer = polys[polys.length - 1];
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
  let changed = false;
  if (S.morphSourceLayer === layer) { S.morphSourceLayer = null; changed = true; }
  if (S.morphTargetLayer === layer) { S.morphTargetLayer = null; changed = true; }
  if (changed) {
    stopMorphPreview();
    updateMorphUI();
  }
}
