// Vector auto-animator — geometry, Alight Motion keyframe XML and the
// engine glue (slots → preview → export) with real Leaflet layers.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import './setup.js';
import L from 'leaflet';
import { sharedMap, sharedDrawnItems } from './shared-map.js';
import { S } from '../engine/state.js';
import {
  cleanRing,
  signedArea,
  addPoints,
  simplifyRing,
  bestRotation,
  rotateRing,
  interpolateRing,
  selfIntersections,
  prepareMorph,
  cubicBezierEase,
  orientRing,
  closestApproach,
  insertPointOnRing,
  bridgeRings,
  prepareShape,
  BRIDGE_GAP,
} from '../engine/morph.js';
import {
  EASING_PRESETS,
  morphTimeline,
  normalisedKeys,
  buildMorphShapeXml,
  morphProgressAt,
} from '../engine/exporters/alightMotionMorph.js';
import { makeAlightProjection, downloadAlightMotionXML } from '../engine/exporters/alightMotion.js';
import {
  setMorphSource,
  setMorphTarget,
  autoPickMorphShapes,
  swapMorphEnds,
  addMorphTrack,
  removeMorphTrack,
  clearMorph,
  completeTracks,
  setMorphOption,
  buildMorphPlan,
  buildAlightMotionMorphXML,
  downloadAlightMotionMorph,
  startMorphPreview,
  stopMorphPreview,
  toggleMorphPreview,
  updateMorphUI,
  polygonParts,
} from '../engine/animator.js';

// ---- fixtures ---------------------------------------------------------------

const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100]];

function regularPolygon(n, r = 50, cx = 50, cy = 50, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function star(points = 5, outer = 50, inner = 22, cx = 50, cy = 50) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

const near = (a, b, eps = 1e-6) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

/** Is `sub` (in order, cyclically) contained in `ring`? */
function isCyclicSubsequence(sub, ring) {
  const n = ring.length;
  const start = ring.findIndex((p) => near(p, sub[0]));
  if (start < 0) return false;
  let j = start;
  for (let i = 0; i < sub.length; i++) {
    let found = false;
    for (let step = 0; step < n; step++) {
      if (near(ring[(j + step) % n], sub[i])) {
        j = (j + step + 1) % n;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function pointOnSegment(p, a, b, eps = 1e-6) {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > eps) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  return dot >= -eps && dot <= len2 + eps;
}

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('XML parse error: ' + err.textContent);
  return doc;
}

// ---- geometry ---------------------------------------------------------------

describe('morph geometry', () => {
  it('cleanRing drops the closing vertex and consecutive duplicates', () => {
    const ring = cleanRing([[0, 0], [0, 0], [10, 0], [10, 10], [10, 10], [0, 10], [0, 0]]);
    expect(ring).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it('addPoints inserts exactly N points, keeps every original vertex and stays on the outline', () => {
    const out = addPoints(SQUARE, 37);
    expect(out).toHaveLength(SQUARE.length + 37);
    expect(isCyclicSubsequence(SQUARE, out)).toBe(true);
    // every inserted point lies on one of the original edges
    for (const p of out) {
      const onEdge = SQUARE.some((a, i) => pointOnSegment(p, a, SQUARE[(i + 1) % SQUARE.length]));
      expect(onEdge, `${p} should lie on the square`).toBe(true);
    }
    // distribution is proportional to edge length: equal edges → equal share (±1)
    const perEdge = [];
    let count = -1;
    for (const p of out) {
      if (SQUARE.some((v) => near(v, p))) {
        perEdge.push(0);
        count++;
      } else perEdge[count]++;
    }
    expect(Math.max(...perEdge) - Math.min(...perEdge)).toBeLessThanOrEqual(1);
  });

  it('addPoints gives longer edges more points', () => {
    const rect = [[0, 0], [300, 0], [300, 10], [0, 10]];
    const out = addPoints(rect, 60);
    const onLong = out.filter((p) => p[1] === 0 || p[1] === 10).length;
    const onShort = out.filter((p) => (p[0] === 0 || p[0] === 300) && p[1] !== 0 && p[1] !== 10).length;
    expect(onLong).toBeGreaterThan(onShort * 10);
  });

  it('simplifyRing thins to the budget, keeping the corners that matter', () => {
    const dense = addPoints(SQUARE, 200); // 204 collinear-heavy points
    const thin = simplifyRing(dense, 12);
    expect(thin).toHaveLength(12);
    // Collinear points have zero triangle area, so the 4 real corners survive
    for (const corner of SQUARE) expect(thin.some((p) => near(p, corner))).toBe(true);
    expect(simplifyRing(SQUARE, 2)).toHaveLength(3); // never below a triangle
  });

  it('bestRotation recovers a known start-vertex shift', () => {
    const a = regularPolygon(24);
    const b = rotateRing(a, 7);
    expect(bestRotation(a, b).offset).toBe(24 - 7);
    expect(rotateRing(b, bestRotation(a, b).offset)).toEqual(a);
  });

  it('prepareMorph equalises counts by adding points to the sparser ring, preserving the drawn vertices', () => {
    const detailed = regularPolygon(60);
    const plan = prepareMorph(SQUARE, detailed, { minPoints: 3 });
    expect(plan.from).toHaveLength(60);
    expect(plan.to).toHaveLength(60);
    expect(plan.pointCount).toBe(60);
    expect(plan.addedA).toBe(56);
    expect(plan.addedB).toBe(0);
    expect(plan.removedA + plan.removedB).toBe(0);
    expect(isCyclicSubsequence(SQUARE, plan.from)).toBe(true);
    expect(isCyclicSubsequence(detailed, plan.to)).toBe(true);
    // endpoints are exact
    expect(interpolateRing(plan.from, plan.to, 0)).toEqual(plan.from);
    expect(interpolateRing(plan.from, plan.to, 1)).toEqual(plan.to);
  });

  it('prepareMorph densifies both rings to minPoints so sparse pairs still move smoothly', () => {
    const plan = prepareMorph(SQUARE, regularPolygon(6), { minPoints: 48 });
    expect(plan.pointCount).toBe(48);
    expect(plan.addedA).toBe(44);
    expect(plan.addedB).toBe(42);
  });

  it('prepareMorph thins over-budget rings before matching', () => {
    const plan = prepareMorph(regularPolygon(900), SQUARE, { maxPoints: 200, minPoints: 3 });
    expect(plan.pointCount).toBe(200);
    expect(plan.removedA).toBe(700);
    expect(plan.addedB).toBe(196);
  });

  it('prepareMorph aligns winding so the fill never flips inside-out', () => {
    const cw = SQUARE.slice().reverse();
    const plan = prepareMorph(SQUARE, cw, { minPoints: 3 });
    expect(plan.reversed).toBe(true);
    expect(Math.sign(signedArea(plan.from))).toBe(Math.sign(signedArea(plan.to)));
    // and with the same winding as the source nothing is flipped
    expect(prepareMorph(SQUARE, SQUARE.map((p) => [p[0] + 5, p[1]]), { minPoints: 3 }).reversed).toBe(false);
  });

  it('prepareMorph picks a start vertex that keeps travel short (no swirl)', () => {
    // Same circle, but B starts a third of the way round: a naive index
    // pairing would spin every point 120°; the planner should undo the shift.
    const a = regularPolygon(36, 50, 50, 50);
    const b = regularPolygon(36, 50, 50, 50, (2 * Math.PI) / 3);
    const plan = prepareMorph(a, b, { minPoints: 3 });
    for (let i = 0; i < a.length; i++) expect(near(plan.from[i], plan.to[i], 1e-6)).toBe(true);
    expect(plan.travel).toBeLessThan(1e-6);
  });

  it('intermediate frames do not tangle for typical drawn pairs', () => {
    const pairs = [
      [SQUARE, star()],
      [star(7, 60, 30), regularPolygon(5, 40, 120, 80)],
      [regularPolygon(3, 80), addPoints(SQUARE.map((p) => [p[0] * 2 + 300, p[1] + 40]), 30)],
      [[[0, 0], [200, 0], [200, 30], [30, 30], [30, 200], [0, 200]] /* L-shape */, regularPolygon(40, 70, 260, 60)],
    ];
    for (const [a, b] of pairs) {
      const plan = prepareMorph(a, b);
      expect(plan.tangles).toBe(0);
      for (const t of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
        expect(selfIntersections(interpolateRing(plan.from, plan.to, t)), `t=${t}`).toBe(0);
      }
    }
  });

  it('rejects degenerate input', () => {
    expect(() => prepareMorph([[0, 0], [1, 1]], SQUARE)).toThrow(/at least 3/);
    expect(() => prepareMorph(SQUARE, [[0, 0], [0, 0], [0, 0], [1, 1]])).toThrow(/at least 3/);
  });

  it('closestApproach finds the nearest vertex-to-edge pair in either direction', () => {
    const a = SQUARE;
    const b = [[150, 40], [180, 40], [180, 60], [150, 60]];
    const c = closestApproach(a, b);
    expect(c.dist).toBeCloseTo(50, 9);
    expect(c.onA).toEqual([100, 40]); // foot on A's right edge
    expect(c.onB).toEqual([150, 40]); // B's vertex
    const d = closestApproach(b, a);
    expect(d.dist).toBeCloseTo(50, 9);
    expect(d.onA).toEqual([150, 40]);
    expect(d.onB).toEqual([100, 40]);
  });

  it('insertPointOnRing splices into the nearest edge or reuses a coincident vertex', () => {
    const ring = SQUARE.map((p) => p.slice());
    const v = insertPointOnRing(ring, [100, 40]);
    expect(ring).toHaveLength(5);
    expect(ring[2]).toBe(v);
    expect(ring.map((p) => p.join(','))).toEqual(['0,0', '100,0', '100,40', '100,100', '0,100']);
    expect(insertPointOnRing(ring, [100, 100])).toBe(ring[3]);
    expect(ring).toHaveLength(5);
  });

  it('bridgeRings joins mainland + islands + a hole into one simple ring with hair-thin bridges', () => {
    const parts = [
      { outer: SQUARE, holes: [[[30, 30], [50, 30], [50, 50], [30, 50]]] },
      { outer: [[150, 20], [180, 20], [180, 50], [150, 50]] },
      { outer: [[200, 80], [220, 80], [220, 100], [200, 100]] },
    ];
    const r = bridgeRings(parts);
    expect(r.parts).toBe(3);
    expect(r.holes).toBe(1);
    expect(r.bridges).toBe(3);
    expect(r.dropped).toBe(0);
    // one closed outline, positively wound, that never crosses itself
    expect(selfIntersections(r.ring)).toBe(0);
    expect(signedArea(r.ring)).toBeGreaterThan(0);
    // fill area = mainland − hole + islands (+ a few hundredths for the corridors)
    const expected = 100 * 100 - 400 + 900 + 400;
    expect(signedArea(r.ring)).toBeGreaterThan(expected);
    expect(signedArea(r.ring)).toBeLessThan(expected + 10 * BRIDGE_GAP * 120);
    // every drawn vertex is still on the outline — a vertex that carries a bridge
    // is represented by its two corridor-side copies, half a gap (0.01 px) away
    for (const part of parts) for (const ring of [part.outer, ...(part.holes || [])]) for (const p of ring) {
      expect(r.ring.some((q) => near(q, p, BRIDGE_GAP / 2 + 1e-9))).toBe(true);
    }
    const exact = parts.flatMap((part) => [part.outer, ...(part.holes || [])]).flat().filter((p) => r.ring.some((q) => near(q, p, 1e-9)));
    expect(exact.length).toBeGreaterThanOrEqual(12); // 16 drawn vertices, at most 4 of them carry a bridge end
    // the corridor sides really are BRIDGE_GAP apart (and so invisible)
    const atX150 = r.ring.filter((p) => Math.abs(p[0] - 150) < 1e-9 && p[1] > 19 && p[1] < 21);
    expect(atX150).toHaveLength(2);
    expect(Math.abs(atX150[0][1] - atX150[1][1])).toBeCloseTo(BRIDGE_GAP, 9);
    // the hole is traced the other way round, so the fill rule leaves it empty
    const holeRun = [[50, 50], [50, 30], [30, 30]];
    expect(isCyclicSubsequence(holeRun, r.ring)).toBe(true);
  });

  it('bridgeRings attaches each island to the nearest connected piece (chain of islands)', () => {
    const parts = [
      { outer: SQUARE },
      { outer: [[300, 0], [320, 0], [320, 20], [300, 20]] }, // far island …
      { outer: [[150, 0], [170, 0], [170, 20], [150, 20]] }, // … reached through the near one
    ];
    const r = bridgeRings(parts);
    expect(r.bridges).toBe(2);
    expect(selfIntersections(r.ring)).toBe(0);
    const at = (x) => r.ring.filter((p) => Math.abs(p[0] - x) < 1e-9).length;
    // mainland's right edge carries exactly one bridge (corner [100,0] → 2 corridor copies, plus [100,100])
    expect(at(100)).toBe(3);
    // the far island hangs off the near island's right edge (corner [170,0] → 2 copies, plus [170,20])
    expect(at(170)).toBe(3);
    // the corridor to the far island really starts there
    expect(r.ring.some((p) => Math.abs(p[0] - 300) < 1e-9 && Math.abs(p[1]) < BRIDGE_GAP)).toBe(true);
  });

  it('bridgeRings handles an island inside a hole (lake island) and single parts untouched', () => {
    const parts = [
      { outer: SQUARE, holes: [[[20, 20], [80, 20], [80, 80], [20, 80]]] },
      { outer: [[45, 45], [55, 45], [55, 55], [45, 55]] },
    ];
    const r = bridgeRings(parts);
    expect(r.bridges).toBe(2);
    expect(selfIntersections(r.ring)).toBe(0);
    expect(signedArea(r.ring)).toBeCloseTo(10000 - 3600 + 100, 0);
    const single = bridgeRings([{ outer: SQUARE }]);
    expect(single.bridges).toBe(0);
    expect(single.ring).toHaveLength(4);
    expect(orientRing(SQUARE.slice().reverse(), true)).toEqual(SQUARE);
  });

  it('prepareShape spends the point budget across parts and drops islands it cannot afford', () => {
    const big = { outer: regularPolygon(300, 40, 50, 50) };
    const islands = Array.from({ length: 30 }, (_, k) => ({ outer: regularPolygon(12, 3, 150 + k * 10, 50) }));
    const roomy = prepareShape([big, ...islands], { maxPoints: 2000 });
    expect(roomy.parts).toBe(31);
    expect(roomy.dropped).toBe(0);
    expect(roomy.removed).toBe(0);
    expect(selfIntersections(roomy.ring)).toBe(0);
    const tight = prepareShape([big, ...islands], { maxPoints: 120 });
    expect(tight.parts).toBeLessThan(31);
    expect(tight.dropped).toBeGreaterThan(0);
    expect(tight.removed).toBeGreaterThan(0);
    expect(tight.ring.length).toBeLessThanOrEqual(120 + 8); // budget + corridor copies of the last bridges
    expect(selfIntersections(tight.ring)).toBe(0);
    // the mainland (the only ring reaching x < 20) is never the one dropped, and it keeps most of the budget
    expect(tight.ring.filter((p) => p[0] < 20).length).toBeGreaterThan(5);
    expect(tight.parts).toBeGreaterThanOrEqual(2);
  });

  it('two multi-part shapes morph without tangles and keep every drawn vertex', () => {
    const A = prepareShape([
      { outer: SQUARE, holes: [[[30, 30], [50, 30], [50, 50], [30, 50]]] },
      { outer: [[150, 20], [180, 20], [180, 50], [150, 50]] },
    ]);
    const B = prepareShape([{ outer: [[10, 10], [130, 10], [130, 130], [10, 130]] }, { outer: [[170, 30], [195, 30], [195, 55], [170, 55]] }]);
    const m = prepareMorph(A.ring, B.ring, { maxPoints: 400 });
    expect(m.from).toHaveLength(m.to.length);
    expect(m.tangles).toBe(0);
    expect(isCyclicSubsequence(A.ring, m.from)).toBe(true);
    expect(isCyclicSubsequence(B.ring, m.to)).toBe(true);
  });

  it('cubicBezierEase matches the CSS ease-in-out curve', () => {
    expect(cubicBezierEase(0.42, 0, 0.58, 1, 0)).toBe(0);
    expect(cubicBezierEase(0.42, 0, 0.58, 1, 1)).toBe(1);
    expect(cubicBezierEase(0.42, 0, 0.58, 1, 0.5)).toBeCloseTo(0.5, 5);
    expect(cubicBezierEase(0.42, 0, 0.58, 1, 0.25)).toBeLessThan(0.25); // slow start
    expect(cubicBezierEase(0, 0, 0.58, 1, 0.25)).toBeGreaterThan(0.25); // ease-out = fast start
  });
});

// ---- Alight Motion keyframe XML ----------------------------------------------

describe('Alight Motion keyframed outline XML', () => {
  const timeline = morphTimeline({ durationMs: 1500, holdStartMs: 500, holdEndMs: 500 });

  it('builds the timeline with holds and normalised keyframe times', () => {
    expect(timeline.totalMs).toBe(2500);
    const keys = normalisedKeys(timeline);
    expect(keys.map((k) => [k.which, k.t, k.eased])).toEqual([
      ['A', 0.2, false],
      ['B', 0.8, true],
    ]);
    const pp = morphTimeline({ durationMs: 1000, holdStartMs: 250, holdEndMs: 500, pingPong: true });
    expect(pp.totalMs).toBe(250 + 1000 + 500 + 1000 + 250);
    expect(pp.keys.map((k) => k.which).join('')).toBe('ABBA');
    expect(morphTimeline({ durationMs: 1000 }).totalMs).toBe(1000);
  });

  it('plays several tracks in sequence: each in its own slot, same total, reverse order on the way back', () => {
    const t = { durationMs: 1000, holdStartMs: 500, holdEndMs: 250 };
    const t0 = morphTimeline(t, { index: 0, count: 3, sequence: true });
    const t2 = morphTimeline(t, { index: 2, count: 3, sequence: true });
    expect(t0.totalMs).toBe(500 + 3000 + 250);
    expect(t2.totalMs).toBe(t0.totalMs);
    expect(t0.keys.map((k) => k.ms)).toEqual([500, 1500]);
    expect(t2.keys.map((k) => k.ms)).toEqual([2500, 3500]);
    // "together" ignores index/count
    expect(morphTimeline(t, { index: 2, count: 3, sequence: false })).toEqual(morphTimeline(t));
    const pp0 = morphTimeline({ ...t, pingPong: true }, { index: 0, count: 2, sequence: true });
    const pp1 = morphTimeline({ ...t, pingPong: true }, { index: 1, count: 2, sequence: true });
    expect(pp0.totalMs).toBe(500 + 2000 + 250 + 2000 + 500);
    expect(pp0.keys.map((k) => k.ms)).toEqual([500, 1500, 3750, 4750]);
    expect(pp1.keys.map((k) => k.ms)).toEqual([1500, 2500, 2750, 3750]);
    expect(morphProgressAt(2000, pp1, 'linear')).toBeCloseTo(0.5, 9);
    expect(morphProgressAt(2000, pp0, 'linear')).toBe(1);
  });

  it('writes one keyed knot per point with easing on the destination keyframe only', () => {
    const plan = prepareMorph(SQUARE, star(), { minPoints: 3 });
    const xml = buildMorphShapeXml({
      id: 2000000001,
      label: 'Box → Star',
      from: plan.from,
      to: plan.to,
      fillA: '#10b981',
      fillB: '#10b981',
      timeline,
      easing: 'easeInOut',
    });
    const doc = parseXml(`<scene>${xml}</scene>`);
    const shape = doc.querySelector('shape');
    expect(shape.getAttribute('startTime')).toBe('0');
    expect(shape.getAttribute('endTime')).toBe('2500');
    expect(shape.getAttribute('fillType')).toBe('color');
    expect(shape.hasAttribute('s'), 'imported outline — not a primitive').toBe(false);

    const path = shape.querySelector('path');
    expect(path.hasAttribute('d'), 'keyed outline must not carry a static d').toBe(false);
    const contour = path.querySelector('contour');
    expect(contour.getAttribute('closed')).toBe('true');
    expect(contour.hasAttribute('exclude')).toBe(false);

    const knots = contour.querySelectorAll('knot');
    expect(knots).toHaveLength(plan.pointCount);
    expect(xml).not.toContain('<in>');
    expect(xml).not.toContain('<out>');
    knots.forEach((knot) => {
      const p = knot.querySelector('p');
      expect(p, 'knot carries a <p> point').toBeTruthy();
      const kfs = p.querySelectorAll('kf');
      expect(kfs).toHaveLength(2);
      expect(kfs[0].getAttribute('t')).toBe('0.200000');
      expect(kfs[0].hasAttribute('e')).toBe(false);
      expect(kfs[1].getAttribute('t')).toBe('0.800000');
      expect(kfs[1].getAttribute('e')).toBe('cubicBezier 0.42 0.0 0.58 1.0');
      kfs.forEach((kf) => expect(kf.getAttribute('v')).toMatch(/^-?\d+\.\d{6},-?\d+\.\d{6}$/));
    });

    // location is static and the knots are relative to it
    expect(shape.querySelector('transform > location').getAttribute('value')).toMatch(/^\d+\.\d{6},\d+\.\d{6},0\.000000$/);
    expect(shape.querySelector('fillColor').getAttribute('value')).toBe('#ff10b981');
    expect(shape.querySelectorAll('kf').length).toBe(plan.pointCount * 2);
  });

  it('keys the fill colour when the two shapes differ, and ping-pong adds the return keyframes', () => {
    const plan = prepareMorph(SQUARE, star(), { minPoints: 3 });
    const pp = morphTimeline({ durationMs: 1000, holdStartMs: 0, holdEndMs: 500, pingPong: true });
    const xml = buildMorphShapeXml({
      id: 1, label: 'x', from: plan.from, to: plan.to, fillA: '#ff0000', fillB: '#0000ff', timeline: pp, easing: 'linear',
    });
    const doc = parseXml(`<scene>${xml}</scene>`);
    const fill = doc.querySelector('fillColor');
    expect(fill.hasAttribute('value')).toBe(false);
    const fillKfs = [...fill.querySelectorAll('kf')];
    expect(fillKfs.map((k) => k.getAttribute('v'))).toEqual(['#ffff0000', '#ff0000ff', '#ff0000ff', '#ffff0000']);
    expect(fillKfs.map((k) => k.getAttribute('t'))).toEqual(['0.000000', '0.400000', '0.600000', '1.000000']);
    expect(xml, 'linear easing writes no e attribute').not.toContain(' e="');
    const knotKfs = doc.querySelector('knot p').querySelectorAll('kf');
    expect(knotKfs).toHaveLength(4);
    expect(knotKfs[0].getAttribute('v')).toBe(knotKfs[3].getAttribute('v'));
  });

  it('every easing preset has a valid AM easing string', () => {
    for (const [key, preset] of Object.entries(EASING_PRESETS)) {
      if (key === 'linear') expect(preset.e).toBeNull();
      else expect(preset.e).toMatch(/^cubicBezier -?\d+(\.\d+)? -?\d+(\.\d+)? -?\d+(\.\d+)? -?\d+(\.\d+)?$/);
    }
    expect(() => buildMorphShapeXml({ id: 1, label: 'x', from: SQUARE, to: SQUARE.slice(0, 3), fillA: '#fff', timeline })).toThrow();
  });

  it('morphProgressAt mirrors the keyframes (holds, easing, ping-pong)', () => {
    expect(morphProgressAt(0, timeline, 'linear')).toBe(0);
    expect(morphProgressAt(400, timeline, 'linear')).toBe(0);
    expect(morphProgressAt(500 + 750, timeline, 'linear')).toBeCloseTo(0.5, 9);
    expect(morphProgressAt(2000, timeline, 'linear')).toBe(1);
    expect(morphProgressAt(2499, timeline, 'linear')).toBe(1);
    expect(morphProgressAt(500 + 375, timeline, 'easeInOut', cubicBezierEase)).toBeLessThan(0.25);
    const pp = morphTimeline({ durationMs: 1000, holdStartMs: 0, holdEndMs: 0, pingPong: true });
    expect(morphProgressAt(1500, pp, 'linear')).toBeCloseTo(0.5, 9);
    expect(morphProgressAt(2000, pp, 'linear')).toBe(0);
  });
});

// ---- engine glue with real Leaflet layers ------------------------------------

function poly(pts, name, fill = '#10b981') {
  const layer = L.polygon(pts.map(([lat, lng]) => L.latLng(lat, lng)), {
    color: fill, fillColor: fill, fillOpacity: 1, weight: 0,
  });
  layer.feature = { type: 'Feature', properties: { name, fill } };
  S.drawnItems.addLayer(layer);
  return layer;
}

function mountAnimateDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="animate-drawer" class="sheet-drawer">
      <div id="morph-tracks"></div>
      <span id="morph-duration-val"></span><span id="morph-hold-start-val"></span><span id="morph-hold-end-val"></span>
      <span id="morph-total-time"></span><p id="morph-status"></p><span id="morph-preview-clock"></span>
      <select id="morph-sequence"><option value="together">together</option><option value="sequence">sequence</option></select>
      <button id="btn-morph-preview"><span data-label>Preview on map</span></button>
      <button id="btn-morph-export"></button>
    </div>`);
}

const slotName = (i, slot) => document.getElementById(`morph-${slot}-name-${i}`).textContent;
const track = (i = 0) => S.morphTracks[i];
const setTracks = (...pairs) => {
  S.morphTracks = pairs.map(([from, to]) => ({ from, to }));
  S.morphActiveTrack = 0;
  S.morphPlanCache = null;
};

function captureDownload() {
  const saved = [];
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  const OrigBlob = globalThis.Blob;
  // jsdom's Blob has no .text(); remember the parts we were built from
  globalThis.Blob = class extends OrigBlob {
    constructor(parts, opts) {
      super(parts, opts);
      this.__text = (parts || []).join('');
    }
  };
  URL.createObjectURL = (blob) => { saved.push(blob); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () { this.dataset.clicked = '1'; };
  return {
    saved,
    text: (i) => saved[i].__text,
    restore() {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
      globalThis.Blob = OrigBlob;
    },
  };
}

// jsdom cannot rasterise, so vector layers on the shared map get a renderer
// that keeps Leaflet's bookkeeping but draws nothing.
const NullRenderer = L.Renderer.extend({
  _initContainer() { this._container = L.DomUtil.create('div', 'leaflet-null-renderer'); },
  _destroyContainer() { L.DomUtil.remove(this._container); },
  _initPath() {},
  _addPath() {},
  _removePath() {},
  _updatePath() {},
  _updateStyle() {},
  _updatePoly() {},
  _updateCircle() {},
  _bringToFront() {},
  _bringToBack() {},
});

describe('animator engine', () => {
  let A;
  let B;
  let C;

  beforeEach(() => {
    const map = sharedMap();
    if (!map.options.renderer) map.options.renderer = new NullRenderer();
    sharedDrawnItems([]);
    document.getElementById('animate-drawer')?.remove();
    mountAnimateDom();
    S.morphTracks = [{ from: null, to: null }];
    S.morphActiveTrack = 0;
    S.morphSequence = false;
    S.morphPlanCache = null;
    S.morphDuration = 1.5;
    S.morphHoldStart = 0.5;
    S.morphHoldEnd = 0.5;
    S.morphEasing = 'easeInOut';
    S.morphPingPong = false;
    S.morphMaxPoints = 400;
    S.morphIncludeOthers = false;
    S.morphAnimateColor = true;
    S.activeSelectedLayer = null;
    A = poly([[51.50, -0.20], [51.50, -0.10], [51.56, -0.10], [51.56, -0.20]], 'Box', '#10b981');
    B = poly(regularPolygon(40, 0.04, -0.05, 51.53).map(([lng, lat]) => [lat, lng]), 'Blob', '#f59e0b');
    C = poly([[51.40, -0.30], [51.40, -0.28], [51.42, -0.28]], 'Bystander', '#3b82f6');
  });

  afterEach(() => {
    stopMorphPreview();
  });

  it('polygonParts normalises every Leaflet latlng shape', () => {
    expect(polygonParts(A.getLatLngs())).toHaveLength(1);
    expect(polygonParts(A.getLatLngs())[0].outer).toHaveLength(4);
    const withHole = L.polygon([
      [[51.5, -0.2], [51.5, -0.1], [51.6, -0.1]],
      [[51.52, -0.18], [51.52, -0.15], [51.55, -0.15]],
    ]);
    expect(polygonParts(withHole.getLatLngs())[0].holes).toHaveLength(1);
    const multi = L.polygon([
      [[[51.5, -0.2], [51.5, -0.1], [51.6, -0.1]]],
      [[[51.7, -0.2], [51.7, -0.1], [51.8, -0.1]]],
    ]);
    expect(polygonParts(multi.getLatLngs())).toHaveLength(2);
  });

  it('slots come from the selected shape, auto-pick uses the last two polygons, swap flips them', () => {
    expect(setMorphSource(), 'nothing selected').toBe(false);
    S.activeSelectedLayer = A;
    expect(setMorphSource()).toBe(true);
    S.activeSelectedLayer = B;
    expect(setMorphTarget()).toBe(true);
    expect(track().from).toBe(A);
    expect(track().to).toBe(B);
    expect(slotName(0, 'from')).toBe('Box');
    expect(slotName(0, 'to')).toBe('Blob');

    // choosing the same shape for both ends empties the other slot
    S.activeSelectedLayer = A;
    setMorphTarget();
    expect(track().to).toBe(A);
    expect(track().from).toBeNull();

    swapMorphEnds();
    expect(track().from).toBe(A);
    expect(track().to).toBeNull();

    expect(autoPickMorphShapes()).toBe(true);
    expect(track().from).toBe(B); // second-to-last drawn
    expect(track().to).toBe(C); // last drawn
  });

  it('tracks can be added, filled independently, removed and cleared', () => {
    setTracks([A, B]);
    expect(addMorphTrack()).toBe(1);
    expect(S.morphTracks).toHaveLength(2);
    expect(S.morphActiveTrack).toBe(1);
    expect(document.querySelectorAll('#morph-tracks .morph-track')).toHaveLength(2);
    // "Use selected" on the new (active) track leaves track 0 alone
    S.activeSelectedLayer = C;
    setMorphSource();
    S.activeSelectedLayer = A;
    setMorphTarget(1);
    expect(track(0)).toEqual({ from: A, to: B });
    expect(track(1)).toEqual({ from: C, to: A });
    expect(completeTracks()).toHaveLength(2);
    expect(slotName(1, 'from')).toBe('Bystander');
    // explicit index targets a track that is not active
    S.activeSelectedLayer = C;
    setMorphTarget(0);
    expect(track(0)).toEqual({ from: A, to: C });
    swapMorphEnds(0);
    expect(track(0)).toEqual({ from: C, to: A });
    removeMorphTrack(0);
    expect(S.morphTracks).toHaveLength(1);
    expect(track(0)).toEqual({ from: C, to: A });
    expect(S.morphActiveTrack).toBe(0);
    // removing the last track just empties it
    removeMorphTrack(0);
    expect(S.morphTracks).toHaveLength(1);
    expect(track(0)).toEqual({ from: null, to: null });
    setTracks([A, B], [B, C]);
    clearMorph();
    expect(S.morphTracks).toEqual([{ from: null, to: null }]);
  });

  it('buildMorphPlan matches counts, keeps the drawn vertices and reports no tangles', () => {
    setTracks([A, B]);
    const plan = buildMorphPlan();
    expect(plan).toBeTruthy();
    expect(plan.from).toHaveLength(plan.to.length);
    expect(plan.meta.pointCount).toBe(40);
    expect(plan.meta.addedA).toBe(36);
    expect(plan.meta.tangles).toBe(0);
    expect(plan.nameA).toBe('Box');
    expect(plan.fillB).toBe('#f59e0b');
    // Drawn corners of A survive the densification (projected)
    const proj = plan.proj;
    for (const ll of A.getLatLngs()[0]) {
      const p = proj.project(ll.lat, ll.lng);
      expect(plan.from.some((q) => near(q, [p.x, p.y], 1e-6))).toBe(true);
    }
    // the fit uses only A and B unless other shapes are included
    expect(plan.bounds.contains(C.getBounds())).toBe(false);
    expect(buildMorphPlan()).toBe(plan); // cached
    setMorphOption('includeOthers', true);
    expect(buildMorphPlan().bounds.contains(C.getBounds())).toBe(true);
  });

  it('a removed shape empties its slot and disables export', () => {
    setTracks([A, B]);
    updateMorphUI();
    expect(document.getElementById('btn-morph-export').disabled).toBe(false);
    S.drawnItems.removeLayer(B);
    updateMorphUI();
    expect(track().to).toBeNull();
    expect(document.getElementById('btn-morph-export').disabled).toBe(true);
    expect(buildMorphPlan()).toBeNull();
  });

  it('a multi-part shape (mainland + island + hole) is animated as one bridged outline', () => {
    const multi = L.polygon([
      [[[51.50, -0.20], [51.50, -0.12], [51.56, -0.12], [51.56, -0.20]], [[51.52, -0.18], [51.52, -0.15], [51.54, -0.15], [51.54, -0.18]]],
      [[[51.51, -0.10], [51.51, -0.08], [51.53, -0.08], [51.53, -0.10]]],
    ], { color: '#8b5cf6', fillColor: '#8b5cf6' });
    multi.feature = { type: 'Feature', properties: { name: 'Archipelago', fill: '#8b5cf6' } };
    S.drawnItems.addLayer(multi);
    setTracks([multi, B]);
    const plan = buildMorphPlan();
    expect(plan).toBeTruthy();
    const t = plan.tracks[0];
    expect(t.shapeA.parts).toBe(2);
    expect(t.shapeA.holes).toBe(1);
    expect(t.shapeA.bridges).toBe(2);
    expect(t.notes.join(' ')).toMatch(/Archipelago: 2 parts \+ 1 hole joined by 2 hair-thin bridges/);
    expect(t.meta.tangles).toBe(0);
    // every drawn vertex of every part is a keyframed point (bridge ends sit 0.01 px off)
    const proj = plan.proj;
    for (const part of polygonParts(multi.getLatLngs())) {
      for (const ring of [part.outer, ...part.holes]) for (const ll of ring) {
        const p = proj.project(ll.lat, ll.lng);
        expect(t.from.some((q) => near(q, [p.x, p.y], BRIDGE_GAP / 2 + 1e-6))).toBe(true);
      }
    }
    // the exported layer is a single contour
    const doc = parseXml(buildAlightMotionMorphXML(plan).xml);
    expect(doc.querySelectorAll('shape > path > contour')).toHaveLength(1);
    expect(doc.querySelector('shape').getAttribute('label')).toBe('Archipelago → Blob');
  });

  it('exports a full Alight Motion scene with the keyframed layer on top', () => {
    setTracks([A, B]);
    setMorphOption('duration', 2);
    setMorphOption('holdStart', 0.25);
    setMorphOption('holdEnd', 0.75);
    setMorphOption('easing', 'easeOut');
    const built = buildAlightMotionMorphXML();
    expect(built.timeline.totalMs).toBe(3000);
    const doc = parseXml(built.xml);
    const scene = doc.documentElement;
    expect(scene.tagName).toBe('scene');
    expect(scene.getAttribute('totalTime')).toBe('3000');
    expect(scene.getAttribute('width')).toBe('1080');
    expect(scene.getAttribute('height')).toBe('1920');
    expect(scene.getAttribute('am')).toMatch(/^com\.alightcreative\.motion\//);
    const shapes = scene.querySelectorAll(':scope > shape');
    expect(shapes).toHaveLength(1);
    const shape = shapes[0];
    expect(shape.getAttribute('label')).toBe('Box → Blob');
    expect(shape.getAttribute('endTime')).toBe('3000');
    expect(shape.getAttribute('id')).toBe('2000000001');
    expect(shape.querySelectorAll('path > contour > knot')).toHaveLength(40);
    const kfs = shape.querySelector('knot p').querySelectorAll('kf');
    expect(kfs[0].getAttribute('t')).toBe(String((0.25 / 3).toFixed(6)));
    expect(kfs[1].getAttribute('t')).toBe('0.750000');
    expect(kfs[1].getAttribute('e')).toBe('cubicBezier 0.0 0.0 0.58 1.0');
    // the fill animates from green to amber
    expect([...shape.querySelectorAll('fillColor > kf')].map((k) => k.getAttribute('v'))).toEqual(['#ff10b981', '#fff59e0b']);
    // all keyed knots stay inside the canvas (projection fits A ∪ B)
    const [lx, ly] = shape.querySelector('location').getAttribute('value').split(',').map(Number);
    shape.querySelectorAll('knot kf').forEach((kf) => {
      const [x, y] = kf.getAttribute('v').split(',').map(Number);
      expect(lx + x).toBeGreaterThanOrEqual(79);
      expect(lx + x).toBeLessThanOrEqual(1001);
      expect(ly + y).toBeGreaterThanOrEqual(79);
      expect(ly + y).toBeLessThanOrEqual(1841);
    });

    // include the bystander as a static layer below the animation
    setMorphOption('includeOthers', true);
    const withOthers = parseXml(buildAlightMotionMorphXML().xml);
    const all = withOthers.querySelectorAll(':scope > shape');
    expect(all).toHaveLength(2);
    expect(all[0].getAttribute('label')).toBe('Bystander');
    expect(all[0].getAttribute('id')).toBe('2000000001');
    expect(all[0].querySelector('path').getAttribute('d')).toMatch(/^M /);
    expect(all[0].getAttribute('endTime')).toBe('3000');
    expect(all[1].getAttribute('label')).toBe('Box → Blob');
    expect(all[1].getAttribute('id')).toBe('2000000002');
  });

  it('several tracks export as several keyframed layers, together or in sequence', () => {
    const D = poly([[51.40, -0.30], [51.40, -0.25], [51.45, -0.25], [51.45, -0.30]], 'Second start', '#ef4444');
    setTracks([A, B], [D, C]);
    setMorphOption('duration', 1);
    setMorphOption('holdStart', 0.5);
    setMorphOption('holdEnd', 0.5);
    const plan = buildMorphPlan();
    expect(plan.tracks).toHaveLength(2);
    expect(plan.bounds.contains(D.getBounds())).toBe(true);
    let built = buildAlightMotionMorphXML(plan);
    expect(built.tracks).toBe(2);
    expect(built.totalMs).toBe(2000);
    let doc = parseXml(built.xml);
    let shapes = doc.querySelectorAll(':scope > shape');
    expect(shapes).toHaveLength(2);
    expect(shapes[0].getAttribute('label')).toBe('Box → Blob');
    expect(shapes[1].getAttribute('label')).toBe('Second start → Bystander');
    expect(shapes[0].getAttribute('id')).toBe('2000000001');
    expect(shapes[1].getAttribute('id')).toBe('2000000002');
    // together: identical keyframe times
    const kf = (shape) => [...shape.querySelector('knot p').querySelectorAll('kf')].map((k) => k.getAttribute('t'));
    expect(kf(shapes[0])).toEqual(['0.250000', '0.750000']);
    expect(kf(shapes[1])).toEqual(['0.250000', '0.750000']);

    // sequence: track 2 moves after track 1, total grows by one duration
    setMorphOption('sequence', 'sequence');
    expect(S.morphSequence).toBe(true);
    built = buildAlightMotionMorphXML();
    expect(built.totalMs).toBe(3000);
    doc = parseXml(built.xml);
    shapes = doc.querySelectorAll(':scope > shape');
    expect(doc.documentElement.getAttribute('totalTime')).toBe('3000');
    expect(shapes[0].getAttribute('endTime')).toBe('3000');
    expect(kf(shapes[0])).toEqual([(500 / 3000).toFixed(6), '0.500000']);
    expect(kf(shapes[1])).toEqual(['0.500000', (2500 / 3000).toFixed(6)]);
    expect(document.getElementById('morph-total-time').textContent).toBe('3.0 s total · 2 morphs in sequence');

    // the shapes used by any track are not duplicated as static layers
    setMorphOption('includeOthers', true);
    doc = parseXml(buildAlightMotionMorphXML().xml);
    expect([...doc.querySelectorAll(':scope > shape')].map((s) => s.getAttribute('label'))).toEqual(['Box → Blob', 'Second start → Bystander']);
    S.drawnItems.removeLayer(D);
  });

  it('downloadAlightMotionMorph saves the .xml and the legacy static export still works', async () => {
    setTracks([A, B]);
    const cap = captureDownload();
    try {
      expect(downloadAlightMotionMorph()).toBe(true);
      expect(cap.saved).toHaveLength(1);
      const text = cap.text(0);
      expect(text.startsWith(`<?xml version='1.0' encoding='UTF-8' ?>`)).toBe(true);
      expect(text).toContain('<path>');
      expect(text).toContain('<contour closed="true">');

      downloadAlightMotionXML();
      expect(cap.saved).toHaveLength(2);
      const legacy = cap.text(1);
      const doc = parseXml(legacy);
      const shapes = doc.querySelectorAll('scene > shape');
      expect(shapes).toHaveLength(3);
      expect(shapes[0].getAttribute('id')).toBe('2000000001');
      expect(shapes[2].getAttribute('id')).toBe('2000000003');
      expect(shapes[0].getAttribute('endTime')).toBe('5000');
      expect(doc.documentElement.getAttribute('totalTime')).toBe('5000');
      shapes.forEach((s) => expect(s.querySelector('path').getAttribute('d')).toMatch(/^M .*L /));
    } finally {
      cap.restore();
    }
  });

  it('preview adds one ghost polygon per track that follows the morph and is removed on stop', async () => {
    setTracks([A, B], [B, C]);
    expect(startMorphPreview()).toBe(true);
    expect(S.morphPreviewLayer).toBeTruthy();
    expect(S.map.hasLayer(S.morphPreviewLayer)).toBe(true);
    expect(S.drawnItems.hasLayer(S.morphPreviewLayer), 'ghost is not an exportable shape').toBe(false);
    expect(document.getElementById('btn-morph-preview').classList.contains('is-playing')).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    const group = S.morphPreviewLayer;
    const ghosts = group.getLayers();
    expect(ghosts).toHaveLength(2);
    expect(ghosts[0].getLatLngs()[0]).toHaveLength(40);
    expect(ghosts[1].getLatLngs()[0]).toHaveLength(40);
    expect(toggleMorphPreview(), 'toggle while playing stops').toBe(false);
    expect(S.morphPreviewLayer).toBeNull();
    expect(S.map.hasLayer(group)).toBe(false);
    expect(document.getElementById('btn-morph-preview').classList.contains('is-playing')).toBe(false);
  });

  it('projection is Web Mercator by default and round-trips through unproject', () => {
    const bounds = L.latLngBounds([40, -10], [70, 10]);
    const proj = makeAlightProjection(bounds);
    expect(proj.projection).toBe('mercator');
    const p = proj.project(51.53, -0.12);
    const ll = proj.unproject(p.x, p.y);
    expect(ll.lat).toBeCloseTo(51.53, 9);
    expect(ll.lng).toBeCloseTo(-0.12, 9);
    // a degree of latitude is taller near the pole than near the equator (Mercator stretch),
    // and matches Leaflet's own projection ratio
    const near40 = proj.project(40, 0).y - proj.project(41, 0).y;
    const near69 = proj.project(69, 0).y - proj.project(70, 0).y;
    expect(near69 / near40).toBeGreaterThan(2);
    const lf = (lat) => L.CRS.EPSG3857.project(L.latLng(lat, 0)).y;
    expect(near69 / near40).toBeCloseTo((lf(70) - lf(69)) / (lf(41) - lf(40)), 6);
    // the fit stays inside the margins
    for (const [lat, lng] of [[40, -10], [70, 10], [40, 10], [70, -10]]) {
      const q = proj.project(lat, lng);
      expect(q.x).toBeGreaterThanOrEqual(80 - 1e-6);
      expect(q.x).toBeLessThanOrEqual(1000 + 1e-6);
      expect(q.y).toBeGreaterThanOrEqual(80 - 1e-6);
      expect(q.y).toBeLessThanOrEqual(1840 + 1e-6);
    }
    // the legacy equirectangular fit is still available
    const eq = makeAlightProjection(bounds, { projection: 'equirectangular' });
    expect(eq.projection).toBe('equirectangular');
    expect(eq.project(40, 0).y - eq.project(41, 0).y).toBeCloseTo(eq.project(69, 0).y - eq.project(70, 0).y, 9);
  });
});
