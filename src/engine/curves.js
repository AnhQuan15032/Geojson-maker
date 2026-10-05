// Split out of the original single-file engine (see legacy/index.html).
// Origin: CURVED EDGES (smooth individual polygon lines)  ·  CURVED EDGES — ALIGHT MOTION STYLE (v2)

import L from 'leaflet';
import * as lucide from '../lib/icons.js';
import { S } from './state.js';
import { chaikinOpen } from '../lib/util.js';
import { CURVE_DEFAULT_AMOUNT, CURVE_REF_ZOOM, curveStore } from './constants.js';
import { updateStats, updateStatsNow } from './quickTools.js';
import { invalidateHeavyStats } from './stats.js';
import { invalidateBakeSoon, refreshBake } from './tileBake.js';
import { showToast } from './uiHelpers.js';

export function geometryToLatLngs(geom) {
  const conv = ring => ring.map(c => L.latLng(c[1], c[0]));
  if (geom.type === 'Polygon') return geom.coordinates.map(conv);
  if (geom.type === 'MultiPolygon') return geom.coordinates.map(poly => poly.map(conv));
  return [];
}

export function countEdgesInGeometry(geom) {
  if (!geom) return 0;
  const perRing = r => Math.max(0, r.length - 1);
  if (geom.type === 'Polygon') return geom.coordinates.reduce((s, r) => s + perRing(r), 0);
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((s, poly) => s + poly.reduce((s2, r) => s2 + perRing(r), 0), 0);
  return 0;
}

export function allEdgeKeys(geom) {
  const keys = [];
  const addRing = (ring, ringKey) => {
    for (let i = 0; i < ring.length - 1; i++) keys.push(`${ringKey}:${i}`);
  };
  if (geom.type === 'Polygon') geom.coordinates.forEach((ring, ri) => addRing(ring, `r${ri}`));else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((poly, pi) => poly.forEach((ring, ri) => addRing(ring, `p${pi}r${ri}`)));
  return keys;
}

// Quadratic Bézier bow for one edge, always bulging away from the centroid

// Quadratic Bézier bow for one edge, always bulging away from the centroid
export function curveRing(ring, ringKey, curvedSet, amount, cosLat) {
  const r = ring.slice();
  if (r.length > 2 && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]);
  const n = r.length - 1;
  if (n < 3) return r;
  let cx = 0,
    cy = 0;
  for (let i = 0; i < n; i++) {
    cx += r[i][0];
    cy += r[i][1];
  }
  cx /= n;
  cy /= n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = r[i],
      b = r[i + 1];
    out.push(a);
    if (!curvedSet.has(`${ringKey}:${i}`)) continue;
    const dxE = (b[0] - a[0]) * cosLat;
    const dyE = b[1] - a[1];
    const lenE = Math.hypot(dxE, dyE);
    if (lenE <= 1e-12) continue;

    // outward normal in equirectangular space
    const nxE = -dyE / lenE;
    const nyE = dxE / lenE;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const oxE = (mx - cx) * cosLat;
    const oyE = my - cy;
    const sign = oxE * nxE + oyE * nyE >= 0 ? 1 : -1;
    const bulge = lenE * amount * sign;
    const ctrlX = mx + nxE * bulge / cosLat;
    const ctrlY = my + nyE * bulge;
    const samples = Math.min(32, Math.max(6, Math.round(lenE * 1200)));
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      const mt = 1 - t;
      out.push([mt * mt * a[0] + 2 * mt * t * ctrlX + t * t * b[0], mt * mt * a[1] + 2 * mt * t * ctrlY + t * t * b[1]]);
    }
  }
  out.push(r[0]);
  return out;
}

export function applyCurvesToGeometry(geom, curvedSet, amount) {
  const cosLat = Math.max(Math.cos(S.map.getCenter().lat * Math.PI / 180), 0.15);
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map((ring, ri) => curveRing(ring, `r${ri}`, curvedSet, amount, cosLat))
    };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly, pi) => poly.map((ring, ri) => curveRing(ring, `p${pi}r${ri}`, curvedSet, amount, cosLat)))
    };
  }
  return geom;
}

export function curveHandleIcon(curved) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.6);background:${curved ? '#e879f9' : '#64748b'};cursor:crosshair"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

export function clearCurveHandles() {
  S.curveHandles.forEach(h => S.map.removeLayer(h.marker));
  S.curveHandles = [];
}

export function buildCurveHandles(layer, st) {
  clearCurveHandles();
  const g = st.original;
  const rings = [];
  if (g.type === 'Polygon') g.coordinates.forEach((ring, ri) => rings.push({
    key: `r${ri}`,
    ring
  }));else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly, pi) => poly.forEach((ring, ri) => rings.push({
    key: `p${pi}r${ri}`,
    ring
  })));
  rings.forEach(({
    key,
    ring
  }) => {
    const closed = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
    const n = Math.max(0, ring.length - 1);
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = closed ? ring[i + 1] : ring[(i + 1) % (ring.length - 1)];
      if (!a || !b) continue;
      const edgeKey = `${key}:${i}`;
      const marker = L.marker(L.latLng((a[1] + b[1]) / 2, (a[0] + b[0]) / 2), {
        bubblingMouseEvents: false,
        zIndexOffset: 900,
        icon: curveHandleIcon(st.curved.has(edgeKey))
      }).addTo(S.map);
      marker.on('click', e => {
        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        toggleEdgeCurve(edgeKey);
      });
      S.curveHandles.push({
        marker,
        key: edgeKey
      });
    }
  });
}

export function refreshCurveHandleColors() {
  const st = curveStore.get(S.curveModeLayer);
  if (!st) return;
  S.curveHandles.forEach(h => h.marker.setIcon(curveHandleIcon(st.curved.has(h.key))));
}

export function toggleEdgeCurve(edgeKey) {
  const layer = S.curveModeLayer || S.activeSelectedLayer;
  const st = curveStore.get(layer);
  if (!st) return;
  if (st.curved.has(edgeKey)) st.curved.delete(edgeKey);else st.curved.add(edgeKey);
  rebuildCurvedGeometry(layer);
  refreshCurveHandleColors();
}

// More depth = more smoothing passes on the live preview
export function drawCurvePreviewPasses() {
  return Math.max(1, Math.min(4, Math.round(S.drawCurveAmount * 8)));
}

export function setupDrawCurveGhost() {
  cleanupDrawCurveGhost();
  S.drawGhostLayer = L.polyline([], {
    color: '#e879f9',
    weight: 2.5,
    opacity: 1,
    dashArray: `${Math.max(2, 8 - S.drawCurveAmount * 8)}, 6`,
    lineJoin: 'round',
    lineCap: 'round',
    interactive: false
  }).addTo(S.map);
}

export function updateDrawCurveGhost() {
  if (!S.drawGhostLayer || !S.drawGhostWorking) return;
  let lls = [];
  try {
    lls = S.drawGhostWorking.getLatLngs();
  } catch (e) {
    return;
  }
  if (!Array.isArray(lls) || lls.length === 0) {
    S.drawGhostLayer.setLatLngs([]);
    return;
  }
  const flat = Array.isArray(lls[0]) ? lls.flat(2) : lls;
  if (flat.length < 2) {
    S.drawGhostLayer.setLatLngs([]);
    return;
  }
  const smooth = chaikinOpen(flat.map(ll => [ll.lng, ll.lat]), drawCurvePreviewPasses());
  S.drawGhostLayer.setLatLngs(smooth.map(c => L.latLng(c[1], c[0])));
}

export function cleanupDrawCurveGhost() {
  if (S.drawGhostLayer) {
    S.map.removeLayer(S.drawGhostLayer);
    S.drawGhostLayer = null;
  }
  S.drawGhostWorking = null;
}

export function updateDrawCurveUI() {
  const state = document.getElementById('draw-curve-state');
  if (state) {
    state.textContent = S.drawCurveEnabled ? 'ON' : 'OFF';
    state.className = S.drawCurveEnabled ? 'text-[10px] font-bold text-fuchsia-300' : 'text-[10px] font-bold text-slate-400';
  }
  const chk = document.getElementById('draw-curve-enabled');
  if (chk) chk.checked = S.drawCurveEnabled;
  const slider = document.getElementById('draw-curve-depth');
  if (slider) slider.value = Math.round(S.drawCurveAmount * 100);
  const lbl = document.getElementById('draw-curve-depth-val');
  if (lbl) lbl.textContent = `${Math.round(S.drawCurveAmount * 100)}%`;
}

export function loadDrawCurvePrefs() {
  try {
    const s = JSON.parse(localStorage.getItem('draw_curve') || 'null');
    if (s) {
      S.drawCurveEnabled = !!s.enabled;
      if (typeof s.amount === 'number') S.drawCurveAmount = Math.min(Math.max(s.amount, 0.05), 0.95);
    }
  } catch (e) {}
  updateDrawCurveUI();
}

export function saveDrawCurvePrefs() {
  try {
    localStorage.setItem('draw_curve', JSON.stringify({
      enabled: S.drawCurveEnabled,
      amount: S.drawCurveAmount
    }));
  } catch (e) {}
}

export function setDrawCurveEnabled(checked) {
  S.drawCurveEnabled = !!checked;
  saveDrawCurvePrefs();
  updateDrawCurveUI();
  if (!S.drawCurveEnabled) cleanupDrawCurveGhost();
  showToast(S.drawCurveEnabled ? 'Curve while drawing: ON — new shapes arrive pre-curved' : 'Curve while drawing: OFF');
}

export function llOfVertex(v) {
  return S.map.unproject(L.point(v.x, v.y), CURVE_REF_ZOOM);
}

export function vertexFromLatLng(ll) {
  const p = S.map.project(ll, CURVE_REF_ZOOM);
  return {
    x: p.x,
    y: p.y,
    mode: 'corner',
    hIn: [0, 0],
    hOut: [0, 0]
  };
}

export function ensureCurveStore(layer) {
  if (!curveStore.has(layer)) {
    const g = layer.toGeoJSON().geometry;
    if (!g || g.type !== 'Polygon' && g.type !== 'MultiPolygon') return null;
    const geomPolys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const polys = geomPolys.map(rings => rings.map(ring => {
      const pts = ring.slice();
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      return pts.map(c => vertexFromLatLng(L.latLng(c[1], c[0])));
    }));
    curveStore.set(layer, {
      polys,
      isMulti: g.type === 'MultiPolygon',
      amount: CURVE_DEFAULT_AMOUNT
    });
  }
  return curveStore.get(layer);
}

export function countSmoothVertices(st) {
  let smooth = 0,
    total = 0;
  st.polys.forEach(rings => rings.forEach(ring => ring.forEach(v => {
    total++;
    if (v.mode === 'smooth') smooth++;
  })));
  return {
    smooth,
    total
  };
}

export function countVerticesInGeometry(g) {
  const cnt = ring => Math.max(0, ring.length - 1);
  if (!g) return 0;
  if (g.type === 'Polygon') return g.coordinates.reduce((s, r) => s + cnt(r), 0);
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, p) => s + p.reduce((s2, r) => s2 + cnt(r), 0), 0);
  return 0;
}

// Catmull-Rom style auto tangent → symmetric handles (AM's auto-smooth)

// Catmull-Rom style auto tangent → symmetric handles (AM's auto-smooth)
export function autoSmoothHandle(ring, i, amount) {
  const n = ring.length;
  const cur = ring[i];
  if (n < 3) {
    cur.hOut = [0, 0];
    cur.hIn = [0, 0];
    return;
  }
  const prev = ring[(i - 1 + n) % n];
  const next = ring[(i + 1) % n];
  let tx = next.x - prev.x;
  let ty = next.y - prev.y;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
  const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
  const factor = Math.min(amount / CURVE_DEFAULT_AMOUNT, 1.6);
  const k = Math.min(d1, d2) * 0.4 * factor;
  cur.hOut = [tx * k, ty * k];
  cur.hIn = [-tx * k, -ty * k];
}

// Cubic Bézier sampling between consecutive vertices

// Cubic Bézier sampling between consecutive vertices
export function ringToBezierLatLngs(ring) {
  const n = ring.length;
  const out = [];
  if (n === 0) return out;
  if (n < 3) {
    ring.forEach(v => out.push(llOfVertex(v)));
    out.push(llOfVertex(ring[0]));
    return out;
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    out.push(llOfVertex(a));
    const c1x = a.x + a.hOut[0],
      c1y = a.y + a.hOut[1];
    const c2x = b.x + b.hIn[0],
      c2y = b.y + b.hIn[1];
    const straight = a.hOut[0] === 0 && a.hOut[1] === 0 && b.hIn[0] === 0 && b.hIn[1] === 0;
    if (straight) continue;
    const S = 22;
    for (let s = 1; s < S; s++) {
      const t = s / S;
      const mt = 1 - t;
      const x = mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x;
      const y = mt * mt * mt * a.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * b.y;
      out.push(S.map.unproject(L.point(x, y), CURVE_REF_ZOOM));
    }
  }
  out.push(llOfVertex(ring[0]));
  return out;
}

// silent = used during live drags: rebuild the drawn outline only, and let
// the geometry serialization + stats wait until the drag ends.

// silent = used during live drags: rebuild the drawn outline only, and let
// the geometry serialization + stats wait until the drag ends.
export function rebuildCurvedGeometry(layer, silent) {
  const st = curveStore.get(layer);
  if (!st) return;
  const ringsOut = st.polys.map(rings => rings.map(ring => ringToBezierLatLngs(ring)));
  layer.setLatLngs(st.isMulti ? ringsOut : ringsOut[0]);
  if (!silent) {
    if (layer.feature) layer.feature.geometry = layer.toGeoJSON().geometry;
    updateStats();
  } else {
    invalidateHeavyStats(600);
  }
  updateCurveStatusUI(layer);
  if (typeof refreshBake === 'function' && S.bakedActive) invalidateBakeSoon();
}

export function scheduleCurveRebuild(layer) {
  if (S.curveRebuildQueued) return;
  S.curveRebuildQueued = true;
  requestAnimationFrame(() => {
    S.curveRebuildQueued = false;
    rebuildCurvedGeometry(layer, true);
  });
}

// One full (non-silent) pass when a drag finishes: syncs the exported
// geometry and refreshes stats exactly once per gesture.

export function scheduleDragSettle(layer) {
  if (S.curveSettleTimer) clearTimeout(S.curveSettleTimer);
  S.curveSettleTimer = setTimeout(() => {
    S.curveSettleTimer = null;
    rebuildCurvedGeometry(layer, false);
    updateStatsNow();
  }, 120);
}

export function updateCurveStatusUI(layer) {
  const el = document.getElementById('curve-status');
  if (!el) return;
  const st = layer ? curveStore.get(layer) : null;
  if (!st) {
    let total = 0;
    try {
      total = layer ? countVerticesInGeometry(layer.toGeoJSON().geometry) : 0;
    } catch (e) {}
    el.textContent = `0 / ${total} curve points`;
    return;
  }
  const c = countSmoothVertices(st);
  el.textContent = `${c.smooth} / ${c.total} curve points`;
}

export function updateCurveButtons() {
  const btn = document.getElementById('btn-curve-mode');
  if (!btn) return;
  if (S.curveMode) {
    btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-300"></i> Done`;
    btn.classList.add('bg-fuchsia-600', 'text-white');
    btn.classList.remove('bg-slate-700', 'text-slate-200');
  } else {
    btn.innerHTML = `<i data-lucide="pencil-ruler" class="w-3.5 h-3.5 text-fuchsia-300"></i> Edit Points`;
    btn.classList.remove('bg-fuchsia-600', 'text-white');
    btn.classList.add('bg-slate-700', 'text-slate-200');
  }
  lucide.createIcons();
}

// ---- Point / handle markers (AM-style) ----

// ---- Point / handle markers (AM-style) ----
export function vertexIcon(mode) {
  const fill = mode === 'smooth' ? '#e879f9' : '#f8fafc';
  const border = mode === 'smooth' ? '#701a75' : '#0f172a';
  return L.divIcon({
    className: '',
    html: `<div style="width:13px;height:13px;background:${fill};border:2px solid ${border};border-radius:3px;transform:rotate(45deg);box-shadow:0 1px 5px rgba(0,0,0,.75);cursor:move"></div>`,
    iconSize: [13, 13],
    iconAnchor: [6.5, 6.5]
  });
}

export function curveHandleMarkerIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:11px;height:11px;background:#fbbf24;border:2px solid #78350f;border-radius:9999px;box-shadow:0 1px 4px rgba(0,0,0,.75);cursor:grab"></div>`,
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5]
  });
}

export function handlePos(v, side) {
  const h = side === 'out' ? v.hOut : v.hIn;
  return L.point(v.x + h[0], v.y + h[1]);
}

export function refreshHandleArms() {
  const arms = [];
  S.vertexMarkers.forEach(m => {
    if (m.kind !== 'handle' || !m.marker) return;
    const anchor = S.vertexMarkers.find(a => a.kind === 'anchor' && a.pi === m.pi && a.ri === m.ri && a.vi === m.vi && a.marker);
    if (anchor) arms.push([anchor.marker.getLatLng(), m.marker.getLatLng()]);
  });
  if (!S.handleArmLayer) {
    S.handleArmLayer = L.polyline(arms, {
      color: '#f0abfc',
      weight: 1,
      opacity: 0.8,
      dashArray: '3,4',
      interactive: false
    }).addTo(S.map);
  } else {
    S.handleArmLayer.setLatLngs(arms);
  }
}

export function clearCurveMarkers() {
  S.vertexMarkers.forEach(m => {
    if (m.marker) S.map.removeLayer(m.marker);
  });
  S.vertexMarkers = [];
  if (S.handleArmLayer) {
    S.map.removeLayer(S.handleArmLayer);
    S.handleArmLayer = null;
  }
}

export function buildCurveMarkers(layer) {
  clearCurveMarkers();
  const st = curveStore.get(layer);
  if (!st) return;
  st.polys.forEach((rings, pi) => rings.forEach((ring, ri) => ring.forEach((v, vi) => {
    const anchor = L.marker(llOfVertex(v), {
      draggable: true,
      zIndexOffset: 1200,
      bubblingMouseEvents: false,
      icon: vertexIcon(v.mode)
    }).addTo(S.map);
    S.vertexMarkers.push({
      kind: 'anchor',
      marker: anchor,
      pi,
      ri,
      vi
    });
    anchor.on('dragstart', () => {
      S.vertexDragFlag = true;
    });
    anchor.on('drag', e => {
      const p = S.map.project(e.target.getLatLng(), CURVE_REF_ZOOM);
      v.x = p.x;
      v.y = p.y;
      S.vertexMarkers.forEach(hm => {
        if (hm.kind === 'handle' && hm.marker && hm.pi === pi && hm.ri === ri && hm.vi === vi) {
          hm.marker.setLatLng(S.map.unproject(handlePos(v, hm.side), CURVE_REF_ZOOM));
        }
      });
      refreshHandleArms();
      scheduleCurveRebuild(layer);
    });
    anchor.on('dragend', () => {
      setTimeout(() => {
        S.vertexDragFlag = false;
      }, 60);
      scheduleDragSettle(layer);
    });
    anchor.on('click', e => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      if (S.vertexDragFlag) return;
      toggleVertexMode(layer, pi, ri, vi);
    });
    if (v.mode === 'smooth') {
      ['in', 'out'].forEach(side => {
        const ctrl = L.marker(S.map.unproject(handlePos(v, side), CURVE_REF_ZOOM), {
          draggable: true,
          zIndexOffset: 1100,
          bubblingMouseEvents: false,
          icon: curveHandleMarkerIcon()
        }).addTo(S.map);
        S.vertexMarkers.push({
          kind: 'handle',
          marker: ctrl,
          pi,
          ri,
          vi,
          side
        });
        ctrl.on('drag', e => {
          const p = S.map.project(e.target.getLatLng(), CURVE_REF_ZOOM);
          const vec = [p.x - v.x, p.y - v.y];
          if (side === 'out') {
            v.hOut = vec;
            v.hIn = [-vec[0], -vec[1]];
          } else {
            v.hIn = vec;
            v.hOut = [-vec[0], -vec[1]];
          }
          const other = S.vertexMarkers.find(hm => hm.kind === 'handle' && hm.marker && hm.pi === pi && hm.ri === ri && hm.vi === vi && hm.side !== side);
          if (other) other.marker.setLatLng(S.map.unproject(handlePos(v, other.side), CURVE_REF_ZOOM));
          refreshHandleArms();
          scheduleCurveRebuild(layer);
        });
        ctrl.on('dragend', () => scheduleDragSettle(layer));
      });
    }
  })));
  refreshHandleArms();
}

export function toggleVertexMode(layer, pi, ri, vi) {
  const st = curveStore.get(layer);
  if (!st) return;
  const ring = st.polys[pi][ri];
  const v = ring[vi];
  if (v.mode === 'corner') {
    v.mode = 'smooth';
    autoSmoothHandle(ring, vi, st.amount);
  } else {
    v.mode = 'corner';
    v.hIn = [0, 0];
    v.hOut = [0, 0];
  }
  rebuildCurvedGeometry(layer);
  buildCurveMarkers(layer);
  updateCurveStatusUI(layer);
}

export function toggleCurveEdgeMode() {
  const layer = S.activeSelectedLayer;
  if (!layer || !(layer instanceof L.Polygon)) {
    showToast('Select a polygon first');
    return;
  }
  if (S.curveMode) {
    exitCurveEdgeMode();
    return;
  }
  if (!ensureCurveStore(layer)) {
    showToast('This shape cannot be curved');
    return;
  }
  S.curveMode = true;
  S.curveModeLayer = layer;
  buildCurveMarkers(layer);
  updateCurveButtons();
  showToast('Tap a point to switch corner ⇄ curve · drag the amber handles to shape it');
}

export function exitCurveEdgeMode() {
  S.curveMode = false;
  S.curveModeLayer = null;
  clearCurveMarkers();
  updateCurveButtons();
}

export function retuneCurveAmount(layer, amount) {
  const st = curveStore.get(layer);
  if (!st) return false;
  st.amount = Math.min(Math.max(amount, 0.05), 0.95);
  let any = false;
  st.polys.forEach(rings => rings.forEach(ring => ring.forEach((v, i) => {
    if (v.mode === 'smooth') {
      any = true;
      autoSmoothHandle(ring, i, st.amount);
    }
  })));
  if (any) {
    rebuildCurvedGeometry(layer);
    if (S.curveMode && S.curveModeLayer === layer) buildCurveMarkers(layer);
  }
  return any;
}

export function curveLayerAllEdges(layer, amount) {
  const st = ensureCurveStore(layer);
  if (!st) return;
  if (typeof amount === 'number') st.amount = Math.min(Math.max(amount, 0.05), 0.95);
  st.polys.forEach(rings => rings.forEach(ring => ring.forEach((v, i) => {
    v.mode = 'smooth';
    autoSmoothHandle(ring, i, st.amount);
  })));
  rebuildCurvedGeometry(layer);
  if (S.curveMode && S.curveModeLayer === layer) buildCurveMarkers(layer);
}

export function curveAllEdges() {
  const layer = S.activeSelectedLayer;
  if (!layer || !(layer instanceof L.Polygon)) {
    showToast('Select a polygon first');
    return;
  }
  curveLayerAllEdges(layer);
  updateCurveStatusUI(layer);
  showToast('All points switched to curve (smooth) mode');
}

export function straightenAllEdges() {
  const layer = S.activeSelectedLayer;
  const st = layer ? curveStore.get(layer) : null;
  if (!st) {
    showToast('Nothing to straighten on this shape');
    return;
  }
  st.polys.forEach(rings => rings.forEach(ring => ring.forEach(v => {
    v.mode = 'corner';
    v.hIn = [0, 0];
    v.hOut = [0, 0];
  })));
  rebuildCurvedGeometry(layer);
  if (S.curveMode && S.curveModeLayer === layer) buildCurveMarkers(layer);
  showToast('All points set to corner (sharp) mode');
}

export function setCurveAmount(val) {
  const lbl = document.getElementById('curve-amount-val');
  if (lbl) lbl.textContent = `${val}%`;
  const layer = S.activeSelectedLayer;
  if (!layer || !(layer instanceof L.Polygon)) return;
  retuneCurveAmount(layer, parseInt(val, 10) / 100);
}

export function setDrawCurveDepth(val) {
  S.drawCurveAmount = Math.min(Math.max(parseInt(val, 10) / 100, 0.05), 0.95);
  saveDrawCurvePrefs();
  updateDrawCurveUI();
  if (S.drawGhostLayer) updateDrawCurveGhost();
  const layer = S.activeSelectedLayer;
  if (layer && layer instanceof L.Polygon) retuneCurveAmount(layer, S.drawCurveAmount);
}

// ================= MAKE POLYGON PART OF THE MAP (tile baker) =================
// Renders the working shapes straight into a Leaflet GridLayer: every tile is
// painted at native resolution from the live GeoJSON, so the shapes behave
// exactly like base-map tiles (crisp at any zoom, panning/zooming free) and
// sit beneath country borders + place labels.
