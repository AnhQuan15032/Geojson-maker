// Cubic-Bézier graph editor for the morph easing (Animate panel).
//
// The same picture Alight Motion's own graph editor shows: a square plot with
// time left→right and progress bottom→top, the curve from (0,0) to (1,1) and
// two white handles — the first pulls the start of the curve, the second the
// end. Dragging a handle anywhere on the plot (the nearest handle follows the
// finger), typing the four numbers, or tapping a preset all end up in the same
// `[x1, y1, x2, y2]` which exports verbatim as `cubicBezier x1 y1 x2 y2` and
// drives the on-map preview through the identical curve.
//
// The markup lives in AnimateDrawer.jsx (ids `morph-curve-*`); this module only
// reads and updates it, so it is unit-testable with jsdom.

import {
  EASING_PRESETS,
  normaliseBezier,
  bezierEasingString,
  isLinearBezier,
  presetForBezier,
} from './exporters/alightMotionMorph.js';
import { cubicBezierEase } from './morph.js';

/** Plot box inside the 260 × 260 viewBox. */
export const PLOT = { x: 20, y: 20, size: 220 };

/** Handles that draw a straight line — what the editor shows for "linear". */
export const LINEAR_BEZIER = [1 / 3, 1 / 3, 2 / 3, 2 / 3];

const $ = (id) => document.getElementById(id);
const fix = (v) => String(Math.round(v * 1000) / 1000);

/** Curve space (0..1, y up) → viewBox coordinates. */
export function curveToPlot(x, y) {
  return [PLOT.x + x * PLOT.size, PLOT.y + PLOT.size - y * PLOT.size];
}

/** viewBox coordinates → curve space, clamped to the plot box. */
export function plotToCurve(px, py) {
  const x = Math.min(1, Math.max(0, (px - PLOT.x) / PLOT.size));
  const y = Math.min(1, Math.max(0, (PLOT.y + PLOT.size - py) / PLOT.size));
  return [x, y];
}

/** SVG path for the curve (plot coordinates). */
export function curvePathD(bezier) {
  const [x1, y1, x2, y2] = normaliseBezier(bezier);
  const [ax, ay] = curveToPlot(0, 0);
  const [bx, by] = curveToPlot(1, 1);
  const [c1x, c1y] = curveToPlot(x1, y1);
  const [c2x, c2y] = curveToPlot(x2, y2);
  return `M ${fix(ax)} ${fix(ay)} C ${fix(c1x)} ${fix(c1y)}, ${fix(c2x)} ${fix(c2y)}, ${fix(bx)} ${fix(by)}`;
}

/** Handles shown for an easing choice: a preset's curve, a straight line for linear, else the custom curve. */
export function handlesFor(key, custom) {
  if (key === 'linear') return LINEAR_BEZIER.slice();
  const preset = EASING_PRESETS[key];
  if (preset && preset.bezier) return preset.bezier.slice();
  return normaliseBezier(custom);
}

/**
 * Paint the editor for `bezier`; `key` is the preset it represents ('custom'
 * when none). Safe to call before the panel is mounted.
 */
export function renderEasingEditor(bezier, key = presetForBezier(bezier)) {
  const svg = $('morph-curve-svg');
  if (!svg) return;
  const b = normaliseBezier(bezier);
  const [h1x, h1y] = curveToPlot(b[0], b[1]);
  const [h2x, h2y] = curveToPlot(b[2], b[3]);
  const [ax, ay] = curveToPlot(0, 0);
  const [bx, by] = curveToPlot(1, 1);
  const path = $('morph-curve-path');
  if (path) path.setAttribute('d', curvePathD(b));
  const set = (id, attrs) => {
    const el = $(id);
    if (el) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  };
  set('morph-curve-l1', { x1: fix(ax), y1: fix(ay), x2: fix(h1x), y2: fix(h1y) });
  set('morph-curve-l2', { x1: fix(bx), y1: fix(by), x2: fix(h2x), y2: fix(h2y) });
  set('morph-curve-h1', { transform: `translate(${fix(h1x)} ${fix(h1y)})` });
  set('morph-curve-h2', { transform: `translate(${fix(h2x)} ${fix(h2y)})` });
  ['x1', 'y1', 'x2', 'y2'].forEach((name, i) => {
    const input = $(`morph-curve-${name}`);
    if (input && document.activeElement !== input) input.value = fix(b[i]);
  });
  const code = $('morph-curve-code');
  if (code) code.textContent = isLinearBezier(b) ? 'linear' : bezierEasingString(b);
  document.querySelectorAll('[data-easing-preset]').forEach((chip) => {
    const active = chip.getAttribute('data-easing-preset') === key;
    chip.classList.toggle('bg-violet-600', active);
    chip.classList.toggle('text-white', active);
    chip.classList.toggle('bg-slate-800', !active);
    chip.classList.toggle('text-slate-300', !active);
  });
  svg.dataset.bezier = b.join(',');
  svg.dataset.preset = key;
}

/**
 * Move the playhead to time fraction `u` (0..1) with the dot on the curve, or
 * park it in the middle without the dot when `u` is null (preview stopped).
 */
export function setEasingPlayhead(u) {
  const line = $('morph-curve-playhead');
  const dot = $('morph-curve-dot');
  if (!line) return;
  if (u == null || !Number.isFinite(u)) {
    const [mx] = curveToPlot(0.5, 0);
    line.setAttribute('x1', fix(mx));
    line.setAttribute('x2', fix(mx));
    line.setAttribute('opacity', '0.5');
    if (dot) dot.setAttribute('visibility', 'hidden');
    return;
  }
  const t = Math.min(1, Math.max(0, u));
  const b = ($('morph-curve-svg')?.dataset.bezier || '').split(',').map(Number);
  const bez = b.length === 4 && b.every(Number.isFinite) ? b : LINEAR_BEZIER;
  const y = isLinearBezier(bez) ? t : cubicBezierEase(bez[0], bez[1], bez[2], bez[3], t);
  const [px, py] = curveToPlot(t, y);
  line.setAttribute('x1', fix(px));
  line.setAttribute('x2', fix(px));
  line.setAttribute('opacity', '1');
  if (dot) {
    dot.setAttribute('cx', fix(px));
    dot.setAttribute('cy', fix(py));
    dot.setAttribute('visibility', 'visible');
  }
}

/** Pointer position → viewBox coordinates (the SVG keeps a 1:1 aspect ratio). */
function pointerToPlot(svg, e) {
  const r = svg.getBoundingClientRect();
  const scale = r.width > 0 ? 260 / r.width : 1;
  return [(e.clientX - r.left) * scale, (e.clientY - r.top) * scale];
}

/** Curve as the editor currently shows it. */
export function editorBezier() {
  const svg = $('morph-curve-svg');
  const b = (svg?.dataset.bezier || '').split(',').map(Number);
  return b.length === 4 && b.every(Number.isFinite) ? b : normaliseBezier(null);
}

/**
 * Wire the editor once. `onChange(bezier, { live })` fires while dragging
 * (`live: true`) and on every committed change (handle released, number
 * typed, preset tapped, mirror).
 */
export function initEasingEditor({ onChange }) {
  const svg = $('morph-curve-svg');
  if (!svg || svg.dataset.wired) return false;
  svg.dataset.wired = '1';

  let drag = null; // { handle: 0 | 1, pointerId }
  const apply = (e, live) => {
    const [px, py] = pointerToPlot(svg, e);
    const [x, y] = plotToCurve(px, py);
    const b = editorBezier();
    if (drag.handle === 0) { b[0] = x; b[1] = y; } else { b[2] = x; b[3] = y; }
    renderEasingEditor(b, presetForBezier(b));
    onChange(b, { live });
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    const [px, py] = pointerToPlot(svg, e);
    const b = editorBezier();
    const [h1x, h1y] = curveToPlot(b[0], b[1]);
    const [h2x, h2y] = curveToPlot(b[2], b[3]);
    const d1 = Math.hypot(px - h1x, py - h1y);
    const d2 = Math.hypot(px - h2x, py - h2y);
    drag = { handle: d1 <= d2 ? 0 : 1, pointerId: e.pointerId };
    svg.classList.add('is-dragging');
    if (typeof svg.setPointerCapture === 'function') {
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    }
    e.preventDefault();
    apply(e, true);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || (drag.pointerId != null && e.pointerId != null && e.pointerId !== drag.pointerId)) return;
    e.preventDefault();
    apply(e, true);
  });
  const finish = (e) => {
    if (!drag) return;
    apply(e, false);
    drag = null;
    svg.classList.remove('is-dragging');
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag = null;
    svg.classList.remove('is-dragging');
    onChange(editorBezier(), { live: false });
  });

  ['x1', 'y1', 'x2', 'y2'].forEach((name, i) => {
    const input = $(`morph-curve-${name}`);
    if (!input) return;
    const commit = () => {
      const b = editorBezier();
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      b[i] = n;
      const nb = normaliseBezier(b);
      renderEasingEditor(nb, presetForBezier(nb));
      onChange(nb, { live: false });
    };
    input.addEventListener('change', commit);
    input.addEventListener('input', commit);
  });

  document.querySelectorAll('[data-easing-preset]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.getAttribute('data-easing-preset');
      const b = handlesFor(key, editorBezier());
      renderEasingEditor(b, key);
      onChange(b, { live: false, preset: key });
    });
  });

  const mirror = $('btn-morph-curve-mirror');
  if (mirror) {
    mirror.addEventListener('click', () => {
      const [x1, y1, x2, y2] = editorBezier();
      const b = normaliseBezier([1 - x2, 1 - y2, 1 - x1, 1 - y1]);
      renderEasingEditor(b, presetForBezier(b));
      onChange(b, { live: false });
    });
  }
  return true;
}
