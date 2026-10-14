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
//   * a keyed outline is `<path>` (no `d`) → `<contour closed="true">` →
//     `<knot>` → `<p>` (point) with its keyframes. `<in>`/`<out>` handles are
//     optional and relative to `<p>`; omitting them makes straight segments,
//     which is exactly what polygon corners want. The closing edge is implied by
//     `closed="true"`, so the first knot is NOT repeated. Knot counts must match
//     across keyframes — the morph geometry guarantees that;
//   * `<fillColor>` is keyable too: `<fillColor><kf t v="#aarrggbb"/>…`.
//
// Knot coordinates are relative to the layer's <transform><location>, which we
// keep static at the centre of the animation's footprint.

import { amFix6, hexToAlightColor } from './alightMotion.js';
import { escapeXml } from '../../lib/util.js';

export const EASING_PRESETS = {
  easeInOut: { label: 'Smooth (ease in-out)', e: 'cubicBezier 0.42 0.0 0.58 1.0', bezier: [0.42, 0, 0.58, 1] },
  emphasized: { label: 'Cinematic (slow landing)', e: 'cubicBezier 0.2 0.0 0.0 1.0', bezier: [0.2, 0, 0, 1] },
  easeOut: { label: 'Ease out (quick start)', e: 'cubicBezier 0.0 0.0 0.58 1.0', bezier: [0, 0, 0.58, 1] },
  easeIn: { label: 'Ease in (slow start)', e: 'cubicBezier 0.42 0.0 1.0 1.0', bezier: [0.42, 0, 1, 1] },
  linear: { label: 'Linear (constant speed)', e: null, bezier: null },
};

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
 */
export function morphTimeline({ durationMs, holdStartMs = 0, holdEndMs = 0, pingPong = false } = DEFAULT_MORPH_TIMING) {
  const morph = Math.max(1, Math.round(durationMs));
  const hs = Math.max(0, Math.round(holdStartMs));
  const he = Math.max(0, Math.round(holdEndMs));
  const keys = [];
  let cursor = hs;
  keys.push({ ms: cursor, which: 'A', eased: false });
  cursor += morph;
  keys.push({ ms: cursor, which: 'B', eased: true });
  let totalMs;
  if (pingPong) {
    cursor += he;
    keys.push({ ms: cursor, which: 'B', eased: false });
    cursor += morph;
    keys.push({ ms: cursor, which: 'A', eased: true });
    totalMs = cursor + hs;
  } else {
    totalMs = cursor + he;
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
 * @param {string} [p.easing='easeInOut']  key of EASING_PRESETS
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
}) {
  if (!from || !to || from.length !== to.length || from.length < 3) {
    throw new Error('Morph rings must have the same length (≥ 3)');
  }
  const preset = EASING_PRESETS[easing] || EASING_PRESETS.easeInOut;
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
  xml += `  <shape id="${id}" label="${escapeXml(label)}" startTime="0" endTime="${end}" fillType="color" mediaFillMode="fill">\n`;
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
  xml += `    <path>\n`;
  xml += `      <contour closed="true">\n`;
  for (let i = 0; i < from.length; i++) {
    const a = `${amFix6(from[i][0] - cx)},${amFix6(from[i][1] - cy)}`;
    const b = `${amFix6(to[i][0] - cx)},${amFix6(to[i][1] - cy)}`;
    let knot = `        <knot><p>`;
    for (const k of keys) knot += kfAttrs(k.t, k.which === 'A' ? a : b, preset.e, k.eased);
    knot += `</p></knot>\n`;
    xml += knot;
  }
  xml += `      </contour>\n`;
  xml += `    </path>\n`;
  xml += `  </shape>\n`;
  return xml;
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
      const preset = EASING_PRESETS[easing] || EASING_PRESETS.easeInOut;
      if (next.eased && preset.bezier && ease) u = ease(...preset.bezier, u);
      return valueOf(prev) + (valueOf(next) - valueOf(prev)) * u;
    }
  }
  return valueOf(keys[keys.length - 1]);
}
