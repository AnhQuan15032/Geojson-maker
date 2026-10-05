// Split out of the original single-file engine (see legacy/index.html).
// Origin: AUTO-GEOREFERENCE ENGINE

import L from 'leaflet';
import { S } from './state.js';
import { bboxOfLine, mercLL, mercXY } from '../lib/util.js';
import { topojson } from './heavyLibs.js';
import { createImageControlHandles, overlayProjectedBounds, syncScaleUI } from './overlayImage.js';
import { showToast } from './uiHelpers.js';

// Zoom-0 pixel lengths are geography-invariant; these convert between
// a raster's pixel grid and that invariant unit.
export function rasterToZoom0(stat, v) {
  return v * stat.k / Math.pow(2, stat.z0);
}

export function zoom0ToRaster(stat, v) {
  return v * Math.pow(2, stat.z0) / stat.k;
}

export function zoom0ToStatPoint(stat, x0, y0) {
  const s = Math.pow(2, stat.z0);
  return {
    x: (x0 * s - stat.nw.x) / stat.k,
    y: (y0 * s - stat.nw.y) / stat.k
  };
}

export function statToLatLng(stat, x, y) {
  return mercLL(stat.nw.x + x * stat.k, stat.nw.y + y * stat.k, stat.z0);
}

export async function ensureWorldBorders() {
  if (S.worldBorderLines.length > 0) return;
  if (S.bordersChanPromise) return S.bordersChanPromise;
  S.bordersChanPromise = (async () => {
    try {
      let topo;
      try {
        const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json');
        if (!r.ok) throw new Error('retry');
        topo = await r.json();
      } catch (e) {
        const r2 = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-50m.json');
        topo = await r2.json();
      }
      const mesh = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
      S.worldBorderLines = (mesh.coordinates || []).map(line => ({
        line,
        bbox: bboxOfLine(line)
      }));
    } catch (e) {
      console.warn('Border channel unavailable:', e);
      S.worldBorderLines = [];
    }
  })();
  return S.bordersChanPromise;
}

// ---- Chamfer distance transform (3/4 weights ≈ 1 / √2) ---------------

// ---- Chamfer distance transform (3/4 weights ≈ 1 / √2) ---------------
export function buildDistanceMap(mask, W, H) {
  const INF = 32000;
  const n = W * H;
  const d = new Int16Array(n);
  for (let i = 0; i < n; i++) d[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) v = Math.min(v, d[i - W] + 3);
      if (x > 0 && y > 0) v = Math.min(v, d[i - W - 1] + 4);
      if (x < W - 1 && y > 0) v = Math.min(v, d[i - W + 1] + 4);
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < H - 1) v = Math.min(v, d[i + W] + 3);
      if (x < W - 1 && y < H - 1) v = Math.min(v, d[i + W + 1] + 4);
      if (x > 0 && y < H - 1) v = Math.min(v, d[i + W - 1] + 4);
      d[i] = v;
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const px = Math.round(d[i] / 3);
    out[i] = px > 255 ? 255 : px;
  }
  return out;
}

// Distance map of the overlay's own linework in image-local space —
// powers the reverse (map → image) half of the symmetric matcher.

// Distance map of the overlay's own linework in image-local space —
// powers the reverse (map → image) half of the symmetric matcher.
export function buildOverlayDistanceMap(pts, GW, GH) {
  const n = GW * GH;
  const mask = new Uint8Array(n);
  for (let i = 0; i < pts.length; i += 2) {
    const gx = Math.min(GW - 1, Math.max(0, Math.round((pts[i] + 0.5) * GW)));
    const gy = Math.min(GH - 1, Math.max(0, Math.round((pts[i + 1] + 0.5) * GH)));
    mask[gy * GW + gx] = 1;
  }
  return buildDistanceMap(mask, GW, GH);
}

// Sample reference edge pixels so we can measure how well real coastline
// pixels are explained by the overlay (the reverse direction).

// Sample reference edge pixels so we can measure how well real coastline
// pixels are explained by the overlay (the reverse direction).
export function sampleMaskPoints(mask, W, H, maxPts) {
  let total = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) total++;
  if (total === 0) return new Float32Array(0);
  const cap = Math.min(total, maxPts);
  const stride = Math.max(1, Math.floor(total / cap));
  const out = new Float32Array(cap * 2);
  let j = 0,
    seen = 0;
  for (let i = 0; i < mask.length && j < cap; i++) {
    if (!mask[i]) continue;
    if (seen++ % stride !== 0) continue;
    const x = i % W;
    out[j * 2] = x;
    out[j * 2 + 1] = (i - x) / W;
    j++;
  }
  return out.subarray(0, j * 2);
}

// ---- Reference rasterizer -------------------------------------------

// ---- Reference rasterizer -------------------------------------------
export function rasterizeReference(bounds, maxDim) {
  const z0 = S.map.getBoundsZoom(bounds);
  const nw = mercXY(bounds.getNorth(), bounds.getWest(), z0);
  const se = mercXY(bounds.getSouth(), bounds.getEast(), z0);
  const boxW = Math.max(Math.abs(se.x - nw.x), 1);
  const boxH = Math.max(Math.abs(se.y - nw.y), 1);
  const k = Math.max(boxW, boxH) / maxDim; // projected px per raster px
  const W = Math.max(32, Math.round(boxW / k));
  const H = Math.max(32, Math.round(boxH / k));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', {
    willReadFrequently: true
  });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const pxScale = Math.pow(2, z0);
  const toX = lng => (mercXY(0, lng, z0).x - nw.x) / k;
  const toY = lat => (mercXY(lat, 0, z0).y - nw.y) / k;
  const lngMin = bounds.getWest(),
    lngMax = bounds.getEast();
  const latMin = bounds.getSouth(),
    latMax = bounds.getNorth();
  const overlaps = b => !(lngMin > b[2] || lngMax < b[0] || latMin > b[3] || latMax < b[1]);

  // Channel 1 — filled landmasses (their boundary = coastline)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let f = 0; f < S.landFeaturesList.length; f++) {
    const feat = S.landFeaturesList[f];
    if (feat.bbox && !overlaps(feat.bbox)) continue;
    const geom = feat.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (let pi = 0; pi < polys.length; pi++) {
      const rings = polys[pi];
      for (let ri = 0; ri < rings.length; ri++) {
        const ring = rings[ri];
        for (let vi = 0; vi < ring.length; vi++) {
          const x = toX(ring[vi][0]);
          const y = toY(ring[vi][1]);
          if (vi === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
    }
  }
  ctx.fill('evenodd');

  // Channel 2 — country / province border lines
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let b = 0; b < S.worldBorderLines.length; b++) {
    const bl = S.worldBorderLines[b];
    if (!overlaps(bl.bbox)) continue;
    const line = bl.line;
    for (let vi = 0; vi < line.length; vi++) {
      const x = toX(line[vi][0]);
      const y = toY(line[vi][1]);
      if (vi === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // ---- edge mask (boundary of drawn linework) ----
  const data = ctx.getImageData(0, 0, W, H).data;
  const n = W * H;
  const binary = new Uint8Array(n);
  for (let i = 0; i < n; i++) binary[i] = data[i * 4] > 110 ? 1 : 0;
  const mask = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!binary[i]) continue;
      const l = x > 0 ? binary[i - 1] : 0;
      const r = x < W - 1 ? binary[i + 1] : 0;
      const u = y > 0 ? binary[i - W] : 0;
      const dn = y < H - 1 ? binary[i + W] : 0;
      if (!l || !r || !u || !dn) mask[i] = 1;
    }
  }
  return {
    distMap: buildDistanceMap(mask, W, H),
    refPts: sampleMaskPoints(mask, W, H, 2600),
    // for reverse (map → image) matching
    W,
    H,
    k,
    z0,
    nw,
    bounds
  };
}

// ---- Overlay linework extraction (Sobel + adaptive threshold) --------

// ---- Overlay linework extraction (Sobel + adaptive threshold) --------
export function extractOverlayEdgePoints(srcUrl, maxDim, sens) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth || 640;
      const natH = img.naturalHeight || 640;
      const ratio = natW / natH;
      let w = maxDim,
        h = Math.round(maxDim / ratio);
      if (h > maxDim) {
        h = maxDim;
        w = Math.round(maxDim * ratio);
      }
      w = Math.max(w, 16);
      h = Math.max(h, 16);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d', {
        willReadFrequently: true
      });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      const n = w * h;
      const gray = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        gray[i] = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
      }
      const mag = new Float32Array(n);
      const gxA = new Float32Array(n);
      const gyA = new Float32Array(n);
      const hist = new Uint32Array(256);
      let maxV = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
          const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
          gxA[i] = gx;
          gyA[i] = gy;
          const m = Math.sqrt(gx * gx + gy * gy);
          mag[i] = m;
          if (m > maxV) maxV = m;
        }
      }
      if (maxV <= 0) {
        resolve({
          pts: new Float32Array(0),
          ratio,
          w,
          h
        });
        return;
      }

      // --- Non-maximum suppression: thin thick strokes into 1px lines ---
      const thin = new Float32Array(n);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const m = mag[i];
          if (m <= 0) continue;
          let dir = Math.round(Math.atan2(gyA[i], gxA[i]) / (Math.PI / 4));
          dir = (dir % 4 + 4) % 4;
          let na, nb;
          if (dir === 0) {
            na = mag[i - 1];
            nb = mag[i + 1];
          } else if (dir === 1) {
            na = mag[i - w - 1];
            nb = mag[i + w + 1];
          } else if (dir === 2) {
            na = mag[i - w];
            nb = mag[i + w];
          } else {
            na = mag[i - w + 1];
            nb = mag[i + w - 1];
          }
          if (m >= na && m >= nb) thin[i] = m;
        }
      }
      for (let i = 0; i < n; i++) {
        if (thin[i] > 0) hist[Math.min(255, Math.round(thin[i] / maxV * 255))]++;
      }
      const frac = sens === 'high' ? 0.05 : sens === 'low' ? 0.012 : 0.026;
      const target = Math.max(1, Math.floor(n * frac));
      let acc = 0,
        thrBin = 200;
      for (let b = 255; b > 0; b--) {
        acc += hist[b];
        if (acc >= target) {
          thrBin = b;
          break;
        }
      }
      const thr = thrBin / 255 * maxV;
      const raw = [];
      for (let i = 0; i < n; i++) if (thin[i] >= thr) raw.push(i);
      if (raw.length === 0) {
        resolve({
          pts: new Float32Array(0),
          ratio,
          w,
          h
        });
        return;
      }

      // --- Speck rejection: drop isolated clusters (captions, legend dots, dust) ---
      const BX = 20,
        BY = 20;
      const bw = w / BX,
        bh = h / BY;
      const bins = new Uint32Array(BX * BY);
      const binOf = new Int32Array(n).fill(-1);
      for (let k2 = 0; k2 < raw.length; k2++) {
        const idx = raw[k2];
        const x = idx % w,
          y = (idx - x) / w;
        const bx = Math.min(BX - 1, x / bw | 0);
        const by = Math.min(BY - 1, y / bh | 0);
        const bIdx = by * BX + bx;
        binOf[idx] = bIdx;
        bins[bIdx]++;
      }
      const dense = new Uint8Array(BX * BY);
      for (let by = 0; by < BY; by++) {
        for (let bx = 0; bx < BX; bx++) {
          const bIdx = by * BX + bx;
          if (bins[bIdx] >= 3) {
            dense[bIdx] = 1;
            continue;
          }
          let nbCount = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = bx + dx,
                ny = by + dy;
              if (nx < 0 || ny < 0 || nx >= BX || ny >= BY) continue;
              nbCount += bins[ny * BX + nx];
            }
          }
          dense[bIdx] = nbCount >= 8 ? 1 : 0;
        }
      }
      const kept = raw.filter(idx => dense[binOf[idx]] === 1);
      const srcList = kept.length >= 60 ? kept : raw;
      const maxPts = 2400;
      const stride = Math.max(1, Math.ceil(srcList.length / maxPts));
      const pts = new Float32Array(Math.ceil(srcList.length / stride) * 2);
      let j = 0;
      for (let i2 = 0; i2 < srcList.length; i2 += stride) {
        const idx = srcList[i2];
        const x = idx % w;
        const y = (idx - x) / w;
        pts[j * 2] = x / w - 0.5;
        pts[j * 2 + 1] = y / h - 0.5;
        j++;
      }
      resolve({
        pts: pts.subarray(0, j * 2),
        ratio,
        w,
        h
      });
    };
    img.onerror = () => reject(new Error('Overlay image could not be decoded'));
    img.src = srcUrl;
  });
}

// ---- Symmetric truncated chamfer score --------------------------------
// Forward  (image → map): how much of the overlay's linework lies on real
//                         coastlines/borders.
// Reverse  (map → image): how much of the reference linework inside the
//                         image footprint is explained by the overlay
//                         (this punishes mismatched labels/legends).
export function scorePlacement(pts, stat, w, cx, cy, thetaRad, cap, matchCtx) {
  const distMap = stat.distMap;
  const W = stat.W,
    H = stat.H;
  const imgH = w / stat.ratio;
  const cosT = thetaRad ? Math.cos(thetaRad) : 1;
  const sinT = thetaRad ? Math.sin(thetaRad) : 0;
  const total = pts.length / 2;
  let hits = 0,
    sum = 0;
  for (let i = 0; i < total; i++) {
    let x = pts[i * 2] * w;
    let y = pts[i * 2 + 1] * imgH;
    if (thetaRad) {
      const rx = x * cosT - y * sinT;
      const ry = x * sinT + y * cosT;
      x = rx;
      y = ry;
    }
    const px = Math.round(cx + x);
    const py = Math.round(cy + y);
    if (px < 0 || py < 0 || px >= W || py >= H) {
      sum += cap;
      continue;
    }
    const d = distMap[py * W + px];
    sum += d;
    if (d <= cap) hits++;
  }
  const fwdHit = hits / total;
  let revHit = fwdHit;
  if (matchCtx && stat.refPts && stat.refPts.length > 0) {
    const {
      imageDT,
      GW,
      GH
    } = matchCtx;
    const refPts = stat.refPts;
    const conv = w / GW; // image-grid px → raster px
    let revMatched = 0,
      revTotal = 0;
    for (let i = 0; i < refPts.length; i += 2) {
      const dxn = (refPts[i] - cx) / w;
      const dyn = (refPts[i + 1] - cy) / imgH;
      let u, v;
      if (thetaRad) {
        u = dxn * cosT + dyn * sinT;
        v = -dxn * sinT + dyn * cosT;
      } else {
        u = dxn;
        v = dyn;
      }
      if (u < -0.56 || u > 0.56 || v < -0.56 || v > 0.56) continue; // outside the image footprint
      revTotal++;
      const gx = Math.round((u + 0.5) * GW);
      const gy = Math.round((v + 0.5) * GH);
      let dd;
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) dd = cap;else dd = imageDT[gy * GW + gx] * conv;
      if (dd <= cap) revMatched++;
    }
    // Only trust the reverse score once the footprint covers real linework
    if (revTotal >= 25) revHit = revMatched / revTotal;
  }
  const combined = matchCtx ? 0.6 * fwdHit + 0.4 * revHit : fwdHit;
  return {
    hits: combined,
    fwdHit,
    revHit,
    mean: sum / total
  };
}

// ---- Georef UI helpers ----------------------------------------------
export function setGeorefStatus(txt) {
  const b = document.getElementById('georef-status-badge');
  if (b) b.textContent = txt;
}

export function setGeorefProgress(pct, txt) {
  const box = document.getElementById('georef-progress');
  if (!box) return;
  box.classList.remove('hidden');
  document.getElementById('georef-progress-bar').style.width = `${Math.min(100, Math.max(0, pct))}%`;
  document.getElementById('georef-progress-pct').textContent = `${Math.round(pct)}%`;
  if (txt) document.getElementById('georef-progress-text').textContent = txt;
}

export function hideGeorefProgress() {
  const box = document.getElementById('georef-progress');
  if (box) box.classList.add('hidden');
}

export function showGeorefResult(conf, matchPct, detail) {
  document.getElementById('georef-result').classList.remove('hidden');
  document.getElementById('georef-conf-text').textContent = `Confidence ${conf}%`;
  document.getElementById('georef-match-text').textContent = `${matchPct}% lines aligned`;
  document.getElementById('georef-detail-text').textContent = detail;
}

export function snapshotOverlayState() {
  if (!S.referenceImageLayer || !S.imageCenter) return null;
  return {
    url: S.referenceImageRawUrl,
    ratio: S.imageNaturalAspectRatio,
    center: L.latLng(S.imageCenter.lat, S.imageCenter.lng),
    baseW: S.overlayBasePxW,
    baseH: S.overlayBasePxH,
    sW: S.scaleW,
    sH: S.scaleH,
    pxW: S.overlayPxW,
    pxH: S.overlayPxH
  };
}

export function restoreOverlayState(s) {
  if (!s) {
    showToast("Nothing to undo");
    return;
  }
  if (S.referenceImageLayer) {
    S.map.removeLayer(S.referenceImageLayer);
    S.referenceImageLayer = null;
  }
  S.referenceImageRawUrl = s.url;
  S.imageNaturalAspectRatio = s.ratio;
  S.imageCenter = s.center;
  S.overlayBasePxW = s.baseW;
  S.overlayBasePxH = s.baseH;
  S.scaleW = s.sW;
  S.scaleH = s.sH;
  S.overlayPxW = s.pxW;
  S.overlayPxH = s.pxH;
  const op = parseFloat(document.getElementById('image-opacity-slider').value || 70) / 100;
  S.referenceImageLayer = L.imageOverlay(s.url, overlayProjectedBounds(), {
    opacity: op,
    interactive: false,
    zIndex: 350
  }).addTo(S.map);
  createImageControlHandles();
  document.getElementById('image-controls').classList.remove('hidden');
  syncScaleUI();
}

export function undoGeorefDetection() {
  if (!S.lastGeorefSnapshot) {
    showToast("No detection to undo");
    return;
  }
  restoreOverlayState(S.lastGeorefSnapshot);
  S.lastGeorefSnapshot = null;
  document.getElementById('georef-result').classList.add('hidden');
  setGeorefStatus('Idle');
  showToast("Detection undone — previous placement restored");
}

export function bakeRotatedOverlay(srcUrl, deg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const rad = deg * Math.PI / 180;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const nw = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
      const nh = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
      const cv = document.createElement('canvas');
      cv.width = Math.max(nw, 8);
      cv.height = Math.max(nh, 8);
      const ctx = cv.getContext('2d');
      if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
      ctx.translate(cv.width / 2, cv.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -w / 2, -h / 2);
      resolve({
        url: cv.toDataURL('image/png'),
        ratio: cv.width / cv.height,
        widthScale: cv.width / w
      });
    };
    img.onerror = () => reject(new Error('Rotation bake failed'));
    img.src = srcUrl;
  });
}

// ================= SEA-COLOUR COASTLINE DETECTION =================
// Instead of guessing edges from whichever pixels have the strongest
// gradient (which happily follows captions, graticules and frames), the
// user picks the water colour of their map image. Pixels matching it are
// segmented out, and a marching-squares tracer produces the true
// coastline as continuous polylines. Those become the matcher's evidence
// and can also be dropped onto the map as real shapes.
