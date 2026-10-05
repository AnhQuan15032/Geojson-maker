// Split out of the original single-file engine (see legacy/index.html).
// Origin: XML / KML GEOSPATIAL EXPORTER  ·  TRANSPARENT PNG VECTOR RENDERER  ·  FAST COASTLINE (VECTOR TILES)  ·  LOAD COUNTRIES AS EDITABLE GEOJSON  ·  MERGE REGIONS  ·  AUTO-GEOREFERENCE ENGINE  ·  SEA-COLOUR COASTLINE DETECTION  ·  BORDER DETAILENER (natural fractal roughener)  ·  CURVED EDGES (smooth individual polygon lines)  ·  SPLIT SHAPE WITH A LINE  ·  INTERACTIVE TUTORIAL

import L from 'leaflet';
import { GRID_CELL } from '../engine/constants.js';

export function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
    }
  });
}

// ================= TRANSPARENT PNG VECTOR RENDERER =================

export function hexToRgba(hex, alpha = 1) {
  let c = String(hex).replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return `rgba(16, 185, 129, ${alpha})`;
  const num = parseInt(c, 16);
  const r = num >> 16 & 255;
  const g = num >> 8 & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ================= REGION STYLE INSPECTOR =================

export function clampInt(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// ---- Tile-seam dissolve (the key to a genuinely real coastline) ----
// Vector tiles clip the ocean at every tile edge, so per-tile polygons come
// with straight false segments along tile borders. Turf unions touching
// polygons into connected landmasses, and the coastline is then read from
// the dissolved rings — seam-free, continuous, actual OSM geometry.
export function bboxArea(bb) {
  return Math.max(0, bb[2] - bb[0]) * Math.max(0, bb[3] - bb[1]);
}

export function bboxesTouch(a, b) {
  return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}

export function nowMs() {
  return window.performance && performance.now ? performance.now() : Date.now();
}

export function bboxOfRings(rings) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  rings.forEach(r => r.forEach(c => {
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  }));
  return [minX, minY, maxX, maxY];
}

export function gridKey(lng, lat) {
  return `${Math.floor(lng / GRID_CELL)}:${Math.floor(lat / GRID_CELL)}`;
}

// Fast turf-free bounding box (lng/lat order, same as turf.bbox)
export function computeGeoBbox(geometry) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const walk = arr => {
    if (typeof arr[0] === 'number') {
      if (arr[0] < minX) minX = arr[0];
      if (arr[0] > maxX) maxX = arr[0];
      if (arr[1] < minY) minY = arr[1];
      if (arr[1] > maxY) maxY = arr[1];
    } else {
      for (let i = 0; i < arr.length; i++) walk(arr[i]);
    }
  };
  walk(geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

// ================= AUTO-GEOREFERENCE ENGINE =================
// 1. Extracts the coastline/border linework from the overlay image (Sobel edges).
// 2. Rasterizes real geographic reference linework (offline world-atlas
//    coastlines + country borders) over the search area.
// 3. Template-matches the two with a truncated chamfer-distance objective
//    over a 4-stage coarse→fine scale, offset and rotation search.
// Everything runs in true Web-Mercator space, so the recovered placement
// is geographically exact and never distorted.
export function nextTick() {
  return new Promise(r => setTimeout(r, 0));
}

// Yields to the next animation frame — browsers clamp setTimeout(0) to ~4 ms,
// so rAF yields are up to 4× cheaper inside the bulk loading loops.

// Yields to the next animation frame — browsers clamp setTimeout(0) to ~4 ms,
// so rAF yields are up to 4× cheaper inside the bulk loading loops.
export function yieldFrame() {
  return new Promise(res => {
    if (window.requestAnimationFrame) requestAnimationFrame(() => res());else setTimeout(res, 16);
  });
}

// Web-Mercator helpers (identical maths to Leaflet's EPSG3857)

// Web-Mercator helpers (identical maths to Leaflet's EPSG3857)
export function mercXY(lat, lng, z) {
  const scale = 256 * Math.pow(2, z);
  const s = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180);
  return {
    x: (lng + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
  };
}

export function mercLL(x, y, z) {
  const scale = 256 * Math.pow(2, z);
  const lng = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / scale;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return L.latLng(lat, lng);
}

export function padBoundsLL(bounds, factor) {
  const c = bounds.getCenter();
  const dLat = Math.max((bounds.getNorth() - bounds.getSouth()) * factor / 2, 0.01);
  const dLng = Math.max((bounds.getEast() - bounds.getWest()) * factor / 2, 0.01);
  return L.latLngBounds([Math.max(-85, c.lat - dLat), c.lng - dLng], [Math.min(85, c.lat + dLat), c.lng + dLng]);
}

// Zoom-0 pixel lengths are geography-invariant; these convert between
// a raster's pixel grid and that invariant unit.

export function bboxOfLine(line) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  }
  return [minX, minY, maxX, maxY];
}

export function subsamplePts(pts, maxPts) {
  const total = pts.length / 2;
  if (total <= maxPts) return pts;
  const stride = total / maxPts;
  const out = new Float32Array(maxPts * 2);
  for (let i = 0; i < maxPts; i++) {
    const j = Math.min(total - 1, Math.round(i * stride));
    out[i * 2] = pts[j * 2];
    out[i * 2 + 1] = pts[j * 2 + 1];
  }
  return out;
}

// ---- Symmetric truncated chamfer score --------------------------------
// Forward  (image → map): how much of the overlay's linework lies on real
//                         coastlines/borders.
// Reverse  (map → image): how much of the reference linework inside the
//                         image footprint is explained by the overlay
//                         (this punishes mismatched labels/legends).

export function pushTop(list, item, maxLen) {
  list.push(item);
  list.sort((a, b) => b.hits - a.hits || a.mean - b.mean);
  if (list.length > maxLen) list.length = maxLen;
}

// ---- Georef UI helpers ----------------------------------------------

export function hexToRgbArr(hex) {
  let c = String(hex || '').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c.length === 6 ? c : 'a5bfdd', 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}

export function rgbToHexStr(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// ================= BORDER DETAILENER (natural fractal roughener) =================
// Classic midpoint-displacement fractals: each straight edge is recursively
// split and its midpoint pushed along the normal by a random amount that
// decays by the "roughness" persistence per level. Endpoints never move, so
// the region's footprint stays identical — only the outline gains detail.
export function rngFactory(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
}

export function countCoords(c) {
  if (!Array.isArray(c)) return 0;
  if (typeof c[0] === 'number') return 1;
  let n = 0;
  for (let i = 0; i < c.length; i++) n += countCoords(c[i]);
  return n;
}

export function chaikinOpen(pts, passes) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    if (p.length < 3) return p;
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

// More depth = more smoothing passes on the live preview

// Unit direction from b towards a (used to extend both path ends outward)
export function normDir(a, b) {
  let dx = a[0] - b[0];
  let dy = a[1] - b[1];
  const l = Math.hypot(dx, dy) || 1e-12;
  return [dx / l, dy / l];
}

// Which side of the (possibly bent) path is this point on? The path is
// treated as a chain of segments: we find the nearest segment and return
// the sign of the cross product there — a proper generalisation of
// "left/right of the line" for polylines.

export function rectOverlapArea(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

export function isElementVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return el.offsetParent !== null && r.width > 0 && r.height > 0;
}

// Every rect the card must avoid, with weights (higher = worse to cover)
