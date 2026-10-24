// Alight Motion keyframed-outline exporter (vector auto-animator).
//
// Format notes — checked against Alight Motion's own serializer
// (ShapeElementTypeImpl / KeyableSerializer in the decompiled app) and real
// exports:
//
//   * a keyed property is written WITHOUT a `value` attribute and instead holds
//     `<kf t="…" v="…"/>` children. `t` is normalised to the layer's own
//     startTime→endTime range (sceneTime = start + (end − start) × t);
//   * `e="cubicBezier x1 y1 x2 y2"` goes on the DESTINATION keyframe — AM eases
//     the segment kf[i-1]→kf[i] with kf[i]'s easing. Linear = no `e`;
//   * a keyed outline is `<path closed="true">` (no `d`) → `<knot>` → `<p>`
//     (point) with its keyframes — the single-contour form AM itself writes
//     (a real 5.0 export: `<path closed="false"><knot><p><kf …/><kf … e="cubicBezier
//     0.8879618 0.0 0.10184711 1.0"/></p></knot>…`); `<contour>` children are
//     only used for multi-contour outlines, and the morph is always one ring.
//     `<in>`/`<out>` handles are optional and relative to `<p>`; omitting them
//     makes straight segments, which is exactly what polygon corners want. The
//     closing edge is implied by `closed="true"`, so the first knot is NOT
//     repeated. Knot counts must match across keyframes — the morph geometry
//     guarantees that;
//   * easing can be any cubic Bézier: `cubicBezier x1 y1 x2 y2` is what AM's
//     own graph editor stores, so a custom curve exports verbatim.
//   * `<fillColor>` is keyable too: `<fillColor><kf t v="#aarrggbb"/>…`.
//
// Knot coordinates are relative to the layer's <transform><location>, which we
// keep static at the centre of the animation's footprint.

import { amFix6, hexToAlightColor } from './alightMotion.js';
import { cubicBezierEase, interpolateRing } from '../morph.js';
import { escapeXml } from '../../lib/util.js';

export const EASING_PRESETS = {
  easeInOut: { label: 'Smooth (ease in-out)', e: 'cubicBezier 0.42 0.0 0.58 1.0', bezier: [0.42, 0, 0.58, 1] },
  emphasized: { label: 'Cinematic (slow landing)', e: 'cubicBezier 0.2 0.0 0.0 1.0', bezier: [0.2, 0, 0, 1] },
  easeOut: { label: 'Ease out (quick start)', e: 'cubicBezier 0.0 0.0 0.58 1.0', bezier: [0, 0, 0.58, 1] },
  easeIn: { label: 'Ease in (slow start)', e: 'cubicBezier 0.42 0.0 1.0 1.0', bezier: [0.42, 0, 1, 1] },
  linear: { label: 'Linear (constant speed)', e: null, bezier: null },
};

/** Default curve of the graph editor (same as the Smooth preset). */
export const DEFAULT_CUSTOM_BEZIER = [0.42, 0, 0.58, 1];

/** AM's float formatting for easing strings: `0` → `0.0`, `0.42` → `0.42`, `1` → `1.0`. */
/**
 * Format a number the way Alight Motion's (Java) `Float.toString` does: the
 * shortest decimal that round-trips through a 32-bit float, always with a
 * fractional part — `0.0`, `1.0`, `0.42`, `0.8879618`, `0.10184711`.
 */
function amFloat(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.0';
  const f = Math.fround(n);
  let s = String(f);
  for (let digits = 1; digits <= 9; digits++) {
    const candidate = Number(f.toPrecision(digits));
    if (Math.fround(candidate) === f) { s = String(candidate); break; }
  }
  if (s.includes('e')) s = f.toFixed(7).replace(/0+$/, '').replace(/\.$/, '.0');
  return s.includes('.') ? s : `${s}.0`;
}

/**
 * Normalise a cubic-Bézier easing: x handles clamped to 0..1 (time must be a
 * function), y handles kept within −1..2 (overshoot allowed), NaN → default.
 */
export function normaliseBezier(bezier) {
  const src = Array.isArray(bezier) && bezier.length === 4 ? bezier : DEFAULT_CUSTOM_BEZIER;
  const clamp = (v, lo, hi, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };
  return [
    clamp(src[0], 0, 1, DEFAULT_CUSTOM_BEZIER[0]),
    clamp(src[1], -1, 2, DEFAULT_CUSTOM_BEZIER[1]),
    clamp(src[2], 0, 1, DEFAULT_CUSTOM_BEZIER[2]),
    clamp(src[3], -1, 2, DEFAULT_CUSTOM_BEZIER[3]),
  ];
}

/** The `e` attribute for a cubic Bézier, e.g. `cubicBezier 0.42 0.0 0.58 1.0`. */
export function bezierEasingString(bezier) {
  const [x1, y1, x2, y2] = normaliseBezier(bezier);
  return `cubicBezier ${amFloat(x1)} ${amFloat(y1)} ${amFloat(x2)} ${amFloat(y2)}`;
}

/** A straight line through the handles = linear (no easing attribute needed). */
export function isLinearBezier(bezier) {
  const [x1, y1, x2, y2] = normaliseBezier(bezier);
  return Math.abs(x1 - y1) < 1e-9 && Math.abs(x2 - y2) < 1e-9;
}

/** Name of the preset a curve matches exactly, or 'custom'. */
export function presetForBezier(bezier) {
  if (isLinearBezier(bezier)) return 'linear';
  const b = normaliseBezier(bezier);
  for (const [key, preset] of Object.entries(EASING_PRESETS)) {
    if (preset.bezier && preset.bezier.every((v, i) => Math.abs(v - b[i]) < 1e-6)) return key;
  }
  return 'custom';
}

/**
 * Resolve an easing choice to `{ e, bezier }`: a preset key, or a custom curve
 * given as `[x1, y1, x2, y2]` (what the graph editor produces) or `{ bezier }`.
 */
export function easingSpec(easing) {
  if (Array.isArray(easing)) {
    if (isLinearBezier(easing)) return { e: null, bezier: null, key: 'linear' };
    return { e: bezierEasingString(easing), bezier: normaliseBezier(easing), key: presetForBezier(easing) };
  }
  if (easing && typeof easing === 'object' && easing.bezier) return easingSpec(easing.bezier);
  const key = typeof easing === 'string' && EASING_PRESETS[easing] ? easing : 'easeInOut';
  return { ...EASING_PRESETS[key], key };
}

export const DEFAULT_MORPH_TIMING = {
  durationMs: 1500,
  holdStartMs: 500,
  holdEndMs: 500,
  pingPong: false,
};

/**
 * Keyframe timeline for a morph. Returns the total layer length and the
 * keyframes as { ms, which: 'A' | 'B', eased } in order.
 *
 * plain:     A —hold→ A ═morph═> B —hold→ B
 * pingPong:  A —hold→ A ═morph═> B —hold→ B ═morph═> A —hold→ A
 *
 * With several morph tracks (`count` > 1) playing in sequence, track `index`
 * morphs during its own slot and holds while the others move:
 *
 *   hold start | track 0 | track 1 | … | hold end  (ping-pong returns in reverse order)
 *
 * Every track shares the same total length, so one scene fits them all.
 */
export function morphTimeline(
  { durationMs, holdStartMs = 0, holdEndMs = 0, pingPong = false } = DEFAULT_MORPH_TIMING,
  { index = 0, count = 1, sequence = false } = {},
) {
  const morph = Math.max(1, Math.round(durationMs));
  const hs = Math.max(0, Math.round(holdStartMs));
  const he = Math.max(0, Math.round(holdEndMs));
  const n = sequence ? Math.max(1, count | 0) : 1;
  const i = sequence ? Math.min(Math.max(0, index | 0), n - 1) : 0;
  const keys = [];
  const forwardEnd = hs + n * morph + he; // where the return pass starts
  keys.push({ ms: hs + i * morph, which: 'A', eased: false });
  keys.push({ ms: hs + (i + 1) * morph, which: 'B', eased: true });
  let totalMs;
  if (pingPong) {
    const back = n - 1 - i; // last track to arrive is the first to go back
    keys.push({ ms: forwardEnd + back * morph, which: 'B', eased: false });
    keys.push({ ms: forwardEnd + (back + 1) * morph, which: 'A', eased: true });
    totalMs = forwardEnd + n * morph + hs;
  } else {
    totalMs = forwardEnd;
  }
  // No hold at all: the first/last keyframes already sit on the layer ends.
  return { totalMs: Math.max(totalMs, 1), keys };
}

/** Normalised (0..1) keyframe times for a timeline. */
export function normalisedKeys(timeline) {
  return timeline.keys.map((k) => ({ ...k, t: Math.min(1, Math.max(0, k.ms / timeline.totalMs)) }));
}

function kfAttrs(t, v, easing, eased) {
  return `<kf t="${amFix6(t)}" v="${v}"${eased && easing ? ` e="${easing}"` : ''} />`;
}

/**
 * One keyframed shape layer.
 *
 * @param {object} p
 * @param {number} p.id          AM layer id
 * @param {string} p.label       layer name
 * @param {number[][]} p.from    start ring in canvas space (absolute px)
 * @param {number[][]} p.to      end ring, same length / 1:1 with `from`
 * @param {string} p.fillA       CSS hex of the start shape
 * @param {string} [p.fillB]     CSS hex of the end shape (defaults to fillA)
 * @param {boolean} [p.animateColor=true]  key the fill colour when A/B differ
 * @param {object} p.timeline    from morphTimeline()
 * @param {string|number[]} [p.easing='easeInOut']  key of EASING_PRESETS, or a custom
 *        cubic Bézier `[x1, y1, x2, y2]` from the graph editor
 * @param {number} [p.strokeWidth=0]  optional path-stroke size (px)
 * @param {string} [p.strokeColor]    CSS hex for the stroke
 */
export function buildMorphShapeXml({
  id,
  label,
  from,
  to,
  fillA,
  fillB,
  animateColor = true,
  timeline,
  easing = 'easeInOut',
  strokeWidth = 0,
  strokeColor,
  clippingMask = false,
}) {
  if (!from || !to || from.length !== to.length || from.length < 3) {
    throw new Error('Morph rings must have the same length (≥ 3)');
  }
  const preset = easingSpec(easing);
  const keys = normalisedKeys(timeline);
  const end = Math.round(timeline.totalMs);

  // Layer anchor: centre of the footprint both outlines cover.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of [from, to]) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const colA = hexToAlightColor(fillA, 1.0);
  const colB = hexToAlightColor(fillB || fillA, 1.0);

  let xml = '';
  xml += `  <shape id="${id}" label="${escapeXml(label)}" startTime="0" endTime="${end}"${clippingMask ? ' clippingMask="true"' : ''} fillType="color" mediaFillMode="fill">\n`;
  xml += `    <transform>\n`;
  xml += `      <location value="${amFix6(cx)},${amFix6(cy)},0.000000" />\n`;
  xml += `    </transform>\n`;
  if (animateColor && colA !== colB) {
    xml += `    <fillColor>\n`;
    for (const k of keys) {
      xml += `      ${kfAttrs(k.t, k.which === 'A' ? colA : colB, preset.e, k.eased)}\n`;
    }
    xml += `    </fillColor>\n`;
  } else {
    xml += `    <fillColor value="${colA}" />\n`;
  }
  if (strokeWidth > 0) {
    xml += `    <path-stroke direction="centered" color="${hexToAlightColor(strokeColor || fillA, 1.0)}" size="${amFix6(strokeWidth)}" />\n`;
  }
  xml += `    <path closed="true">\n`;
  for (let i = 0; i < from.length; i++) {
    const a = `${amFix6(from[i][0] - cx)},${amFix6(from[i][1] - cy)}`;
    const b = `${amFix6(to[i][0] - cx)},${amFix6(to[i][1] - cy)}`;
    let knot = `      <knot><p>`;
    for (const k of keys) knot += kfAttrs(k.t, k.which === 'A' ? a : b, preset.e, k.eased);
    knot += `</p></knot>\n`;
    xml += knot;
  }
  xml += `    </path>\n`;
  xml += `  </shape>\n`;
  return xml;
}

function ringBounds(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: Math.max(0.01, maxX - minX), height: Math.max(0.01, maxY - minY) };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function shortestRotation(from, to) {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta;
}

/**
 * One media-backed rectangle that follows a morph's bounds, plus (optionally)
 * an exact copy of its keyed outline flagged as the clipping mask. Alight
 * Motion keeps the bitmap in its media store; `mediaUri` points at the matching
 * sidecar image exported beside the XML.
 */
export function buildMorphFlagLayersXml({
  id,
  label,
  from,
  to,
  timeline,
  easing = 'easeInOut',
  mediaUri,
  masked = true,
  settings = {},
}) {
  if (!from || !to || from.length !== to.length || from.length < 3) {
    throw new Error('Flag transform needs matching morph rings (≥ 3 points)');
  }
  if (!mediaUri) throw new Error('Flag image needs an Alight Motion media URI');
  const preset = easingSpec(easing);
  const scaleA = clampNumber(settings.scaleFrom, 10, 500, 100) / 100;
  const scaleB = clampNumber(settings.scaleTo, 10, 500, 100) / 100;
  const offsetXA = clampNumber(settings.offsetXFrom, -100, 100, 0) / 100;
  const offsetXB = clampNumber(settings.offsetXTo, -100, 100, 0) / 100;
  const offsetYA = clampNumber(settings.offsetYFrom, -100, 100, 0) / 100;
  const offsetYB = clampNumber(settings.offsetYTo, -100, 100, 0) / 100;
  const rotationA = clampNumber(settings.rotationFrom, -360, 360, 0);
  const rotationB = shortestRotation(rotationA, clampNumber(settings.rotationTo, -360, 360, 0));
  const startProgress = (key) => key.which === 'A' ? 0 : 1;
  const flagKeys = [];
  const timelineKeys = timeline.keys;
  if (timelineKeys.length) {
    const first = timelineKeys[0];
    flagKeys.push({ t: first.ms / timeline.totalMs, progress: startProgress(first) });
  }
  // The vector path's extrema can switch from one vertex to another mid-morph.
  // Sample the same eased path so image bounds follow that motion instead of
  // merely tweening between the two endpoint boxes (which can leave gaps).
  const samplesPerMorph = 20;
  for (let i = 1; i < timelineKeys.length; i++) {
    const previous = timelineKeys[i - 1];
    const next = timelineKeys[i];
    const span = next.ms - previous.ms;
    const moves = span > 0 && next.eased && previous.which !== next.which;
    if (moves) {
      for (let sample = 1; sample < samplesPerMorph; sample++) {
        const raw = sample / samplesPerMorph;
        const eased = preset.bezier ? cubicBezierEase(...preset.bezier, raw) : raw;
        const progress = startProgress(previous) + (startProgress(next) - startProgress(previous)) * eased;
        flagKeys.push({ t: (previous.ms + span * raw) / timeline.totalMs, progress });
      }
    }
    flagKeys.push({ t: next.ms / timeline.totalMs, progress: startProgress(next) });
  }
  const valueAt = (progress) => {
    const ring = interpolateRing(from, to, progress);
    const box = ringBounds(ring);
    const scale = Math.max(0.01, scaleA + (scaleB - scaleA) * progress);
    const offsetX = offsetXA + (offsetXB - offsetXA) * progress;
    const offsetY = offsetYA + (offsetYB - offsetYA) * progress;
    return {
      x: box.x + box.width * offsetX,
      y: box.y + box.height * offsetY,
      width: box.width * scale,
      height: box.height * scale,
      rotation: rotationA + (rotationB - rotationA) * progress,
    };
  };
  const values = flagKeys.map((key) => ({ ...key, ...valueAt(key.progress) }));
  const end = Math.round(timeline.totalMs);
  const attrsFor = (property) => values.map((key) => kfAttrs(key.t, amFix6(key[property]), null, false)).join('');
  const locations = values.map((key) => kfAttrs(key.t, `${amFix6(key.x)},${amFix6(key.y)},0.000000`, null, false)).join('');
  const sizes = values.map((key) => kfAttrs(key.t, `${amFix6(key.width)},${amFix6(key.height)}`, null, false)).join('');

  let xml = `  <shape id="${id}" label="${escapeXml(label)}" startTime="0" endTime="${end}" fillType="media" fillImage="${escapeXml(mediaUri)}" mediaFillMode="stretch" s=".rect">\n`;
  xml += `    <transform>\n`;
  xml += `      <location>${locations}</location>\n`;
  xml += `      <rotation>${attrsFor('rotation')}</rotation>\n`;
  xml += `    </transform>\n`;
  xml += `    <property name="size" type="vec2">${sizes}</property>\n`;
  xml += `  </shape>\n`;

  if (masked) {
    xml += buildMorphShapeXml({
      id: id + 1,
      label: `${label} — mask`,
      from,
      to,
      fillA: '#ffffff',
      fillB: '#ffffff',
      animateColor: false,
      timeline,
      easing,
      clippingMask: true,
    });
  }
  return xml;
}

/** Metadata declaration for the linked image asset included beside the XML. */
export function morphFlagMediaXml(asset) {
  if (!asset?.uri || !asset?.sig) return '';
  const fields = [
    ['uri', asset.uri],
    ['filename', asset.filename || asset.downloadName || `${asset.sig}.${asset.extension || 'PNG'}`],
    ['title', asset.title || asset.name || 'Region image'],
    ['type', asset.mimeType || 'image/png'],
    ['size', Math.max(0, Math.round(Number(asset.size) || 0))],
    ['sig', asset.sig],
    ['infoUpdated', Math.max(0, Math.round(Number(asset.infoUpdated) || Date.now()))],
    ['width', Math.max(1, Math.round(Number(asset.width) || 1))],
    ['height', Math.max(1, Math.round(Number(asset.height) || 1))],
  ];
  return `  <media ${fields.map(([key, value]) => `${key}="${escapeXml(value)}"`).join(' ')} />\n`;
}

/**
 * Where the morph is at scene time `ms` (0..1 between A and B), honouring holds,
 * ping-pong and the easing curve — used by the on-map preview so it matches
 * what Alight Motion will play.
 */
export function morphProgressAt(ms, timeline, easing = 'easeInOut', ease = null) {
  const keys = timeline.keys;
  const valueOf = (k) => (k.which === 'A' ? 0 : 1);
  if (ms <= keys[0].ms) return valueOf(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1];
    const next = keys[i];
    if (ms <= next.ms) {
      const span = next.ms - prev.ms;
      if (span <= 0) return valueOf(next);
      let u = (ms - prev.ms) / span;
      const preset = easingSpec(easing);
      if (next.eased && preset.bezier && ease) u = ease(...preset.bezier, u);
      return valueOf(prev) + (valueOf(next) - valueOf(prev)) * u;
    }
  }
  return valueOf(keys[keys.length - 1]);
}

/**
 * Which eased segment scene time `ms` falls in: `{ u, reverse }` with `u` the
 * raw (un-eased) 0..1 position inside that morph, `reverse` true on the way
 * back of a ping-pong — or null during a hold. Drives the graph editor's
 * playhead while the preview runs.
 */
export function morphSegmentAt(ms, timeline) {
  const keys = timeline.keys;
  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1];
    const next = keys[i];
    if (!next.eased || next.which === prev.which) continue;
    if (ms >= prev.ms && ms <= next.ms && next.ms > prev.ms) {
      return { u: (ms - prev.ms) / (next.ms - prev.ms), reverse: next.which === 'A' };
    }
  }
  return null;
}
