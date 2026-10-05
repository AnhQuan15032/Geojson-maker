// Split out of the original single-file engine (see legacy/index.html).
// Origin: SEA-COLOUR COASTLINE DETECTION

import L from 'leaflet';
import * as lucide from '../lib/icons.js';
import { S } from './state.js';
import {
  hexToRgbArr,
  mercLL,
  nextTick,
  padBoundsLL,
  pushTop,
  rgbToHexStr,
  subsamplePts,
} from '../lib/util.js';
import { setupLayerProperties } from './colors.js';
import { OVERLAY_REF_ZOOM } from './constants.js';
import { onFeatureClick } from './exporters/geojson.js';
import {
  bakeRotatedOverlay,
  buildOverlayDistanceMap,
  ensureWorldBorders,
  extractOverlayEdgePoints,
  hideGeorefProgress,
  rasterToZoom0,
  rasterizeReference,
  scorePlacement,
  setGeorefProgress,
  setGeorefStatus,
  showGeorefResult,
  snapshotOverlayState,
  statToLatLng,
  zoom0ToRaster,
  zoom0ToStatPoint,
} from './georef.js';
import { ensureHeavyLibs } from './heavyLibs.js';
import { loadGlobalLandmass } from './merge.js';
import { createImageControlHandles, overlayProjectedBounds, syncScaleUI } from './overlayImage.js';
import { updateStats } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { closeDrawers, showToast } from './uiHelpers.js';

export function setSeaStatus(txt, tone) {
  const el = document.getElementById('sea-detect-status');
  if (!el) return;
  el.textContent = txt;
  el.className = tone === 'ok' ? 'text-[9px] font-mono text-emerald-400' : tone === 'busy' ? 'text-[9px] font-mono text-amber-300' : tone === 'warn' ? 'text-[9px] font-mono text-rose-300' : 'text-[9px] font-mono text-slate-400';
}

export function setSeaDetectEnabled(checked) {
  S.seaDetectEnabled = !!checked;
  const st = document.getElementById('sea-detect-state');
  if (st) {
    st.textContent = S.seaDetectEnabled ? 'ON' : 'OFF';
    st.className = S.seaDetectEnabled ? 'text-[9px] font-bold text-cyan-300' : 'text-[9px] font-bold text-slate-400';
  }
  showToast(S.seaDetectEnabled ? 'Sea-colour detection ON' : 'Sea-colour detection OFF — using generic edges');
}

export function setSeaColor(val) {
  S.seaColorHex = val;
  setSeaStatus(`sea colour ${val}`, null);
}

export function setSeaTolerance(val) {
  S.seaTolerance = Math.max(10, Math.min(160, parseInt(val, 10) || 60));
  const lbl = document.getElementById('sea-tol-val');
  if (lbl) lbl.textContent = S.seaTolerance;
}

// ---- Overlay pixel cache (one decode, reused for sampling + detection) ----

// ---- Overlay pixel cache (one decode, reused for sampling + detection) ----
export function loadOverlayPixels() {
  const url = S.referenceImageRawUrl;
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No overlay image loaded'));
      return;
    }
    if (S.overlayPixelCache && S.overlayPixelCache.url === url) {
      resolve(S.overlayPixelCache);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth || 640;
      const natH = img.naturalHeight || 640;
      const ratio = natW / natH;
      const MAX = 640;
      let w = MAX,
        h = Math.round(MAX / ratio);
      if (h > MAX) {
        h = MAX;
        w = Math.round(MAX * ratio);
      }
      w = Math.max(w, 24);
      h = Math.max(h, 24);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d', {
        willReadFrequently: true
      });
      ctx.drawImage(img, 0, 0, w, h);
      S.overlayPixelCache = {
        url,
        W: w,
        H: h,
        ratio,
        data: ctx.getImageData(0, 0, w, h).data
      };
      resolve(S.overlayPixelCache);
    };
    img.onerror = () => reject(new Error('Overlay image could not be decoded'));
    img.src = url;
  });
}

// ---- Overlay placement <-> image coordinates ----
// clamp = true never fails: a tap anywhere is projected onto the nearest
// point of the image, so the picker always samples something usable.

// ---- Overlay placement <-> image coordinates ----
// clamp = true never fails: a tap anywhere is projected onto the nearest
// point of the image, so the picker always samples something usable.
export function latLngToOverlayUV(latlng, clamp) {
  if (!S.imageCenter || !S.overlayPxW || !S.overlayPxH) return null;
  const c = S.map.project(S.imageCenter, OVERLAY_REF_ZOOM);
  const p = S.map.project(latlng, OVERLAY_REF_ZOOM);
  const u = (p.x - c.x) / S.overlayPxW;
  const v = (p.y - c.y) / S.overlayPxH;
  const outside = Math.abs(u) > 0.5 || Math.abs(v) > 0.5;
  if (outside && !clamp) return null;
  return {
    u: Math.max(-0.5, Math.min(0.5, u)),
    v: Math.max(-0.5, Math.min(0.5, v)),
    clamped: outside
  };
}

// Visual frame around the overlay so the user can see where to tap

export function showSeaPickHint() {
  hideSeaPickHint();
  if (!S.imageCenter || !S.overlayPxW || !S.overlayPxH) return;
  const b = overlayProjectedBounds();
  S.seaPickHintLayers.push(L.rectangle(b, {
    color: '#22d3ee',
    weight: 2,
    dashArray: '7,6',
    fillColor: '#22d3ee',
    fillOpacity: 0.06,
    interactive: false
  }).addTo(S.map));
  S.seaPickHintLayers.push(L.marker(b.getNorth(), {
    interactive: false,
    icon: L.divIcon({
      className: '',
      html: `<div style="transform:translate(-50%,-160%);white-space:nowrap;background:#0e7490;color:#fff;font-size:10px;font-weight:700;padding:4px 9px;border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,.6)">🎯 Tap the water anywhere in this frame</div>`,
      iconSize: [0, 0]
    })
  }).addTo(S.map));
}

export function hideSeaPickHint() {
  S.seaPickHintLayers.forEach(l => {
    try {
      S.map.removeLayer(l);
    } catch (e) {}
  });
  S.seaPickHintLayers = [];
}

export function overlayUVToLatLng(u, v) {
  const c = S.map.project(S.imageCenter, OVERLAY_REF_ZOOM);
  return S.map.unproject(L.point(c.x + u * S.overlayPxW, c.y + v * S.overlayPxH), OVERLAY_REF_ZOOM);
}

// ---- Eyedropper: sample the sea colour straight off the image ----

// ---- Eyedropper: sample the sea colour straight off the image ----
export function toggleSeaPickFromOverlay() {
  if (!S.referenceImageLayer || !S.imageCenter) {
    showToast('Upload and place an overlay image first');
    return;
  }
  S.seaPickMode = !S.seaPickMode;
  const btn = document.getElementById('btn-sea-pick');
  if (S.seaPickMode) {
    if (btn) btn.classList.add('bg-cyan-600', 'text-white');
    closeDrawers(); // the panels must not cover the map
    showSeaPickHint(); // dashed frame around the overlay
    S.map.getContainer().style.cursor = 'crosshair';
    S.map.once('click', onSeaPickClick);
    showToast('Tap the water inside the cyan frame — anywhere works, it snaps to the image');
  } else {
    if (btn) btn.classList.remove('bg-cyan-600', 'text-white');
    hideSeaPickHint();
    S.map.getContainer().style.cursor = '';
  }
}

export function cancelSeaPick() {
  if (!S.seaPickMode) return;
  S.seaPickMode = false;
  hideSeaPickHint();
  S.map.getContainer().style.cursor = '';
  const btn = document.getElementById('btn-sea-pick');
  if (btn) btn.classList.remove('bg-cyan-600', 'text-white');
}

export async function onSeaPickClick(e) {
  S.seaPickMode = false;
  hideSeaPickHint();
  S.map.getContainer().style.cursor = '';
  const btn = document.getElementById('btn-sea-pick');
  if (btn) btn.classList.remove('bg-cyan-600', 'text-white');
  try {
    const cache = await loadOverlayPixels();

    // Clamp onto the image — a near-miss still samples the closest pixel
    const uv = latLngToOverlayUV(e.latlng, true);
    if (!uv) {
      showToast('No overlay image loaded to sample');
      return;
    }
    const px = Math.max(0, Math.min(cache.W - 1, Math.round((uv.u + 0.5) * cache.W) - (uv.u >= 0.499 ? 1 : 0)));
    const py = Math.max(0, Math.min(cache.H - 1, Math.round((uv.v + 0.5) * cache.H) - (uv.v >= 0.499 ? 1 : 0)));
    const idx = (py * cache.W + px) * 4;
    const hex = rgbToHexStr(cache.data[idx], cache.data[idx + 1], cache.data[idx + 2]);
    S.seaColorHex = hex;
    const input = document.getElementById('sea-color');
    if (input) input.value = hex;
    setSeaStatus(`sea colour sampled: ${hex}`, 'ok');
    showToast(uv.clamped ? `Sampled the nearest overlay pixel (${hex}) — tap more centrally for exact colour` : `Sea colour sampled: ${hex}`);

    // Immediate feedback: trace the coast with the sampled colour
    let found = await detectCoastlineFromSeaColor();
    if (!found) {
      // Colour was close but not close enough — widen tolerance once, retry
      const newTol = Math.min(160, S.seaTolerance + 35);
      if (newTol > S.seaTolerance) {
        setSeaTolerance(newTol);
        const slider = document.getElementById('sea-tolerance');
        if (slider) slider.value = newTol;
        found = await detectCoastlineFromSeaColor();
        if (found) showToast(`Tolerance widened to ${newTol} — coastline found`);
      }
    }
  } catch (err) {
    showToast('Could not sample the image');
  }
}

// ---- Auto sea-colour: read it from the image's outer band ----
// Map imagery is almost always framed by water, so the most common colour
// along the border band is an excellent first guess.

// ---- Auto sea-colour: read it from the image's outer band ----
// Map imagery is almost always framed by water, so the most common colour
// along the border band is an excellent first guess.
export async function autoDetectSeaColor() {
  if (!S.referenceImageLayer) {
    showToast('Upload an overlay image first');
    return;
  }
  try {
    setSeaStatus('analysing image…', 'busy');
    const cache = await loadOverlayPixels();
    const {
      W,
      H,
      data
    } = cache;
    const band = Math.max(2, Math.round(Math.min(W, H) * 0.12));
    const bins = new Map();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!(x < band || y < band || x >= W - band || y >= H - band)) continue;
        const i = (y * W + x) * 4;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        const k = r >> 4 << 8 | g >> 4 << 4 | b >> 4;
        let e = bins.get(k);
        if (!e) {
          e = {
            n: 0,
            r: 0,
            g: 0,
            b: 0
          };
          bins.set(k, e);
        }
        e.n++;
        e.r += r;
        e.g += g;
        e.b += b;
      }
    }
    let best = null;
    bins.forEach(e => {
      if (!best || e.n > best.n) best = e;
    });
    if (!best) {
      setSeaStatus('could not analyse the image', 'warn');
      return;
    }
    const hex = rgbToHexStr(best.r / best.n, best.g / best.n, best.b / best.n);
    S.seaColorHex = hex;
    const input = document.getElementById('sea-color');
    if (input) input.value = hex;
    const found = await detectCoastlineFromSeaColor();
    if (!found) {
      const newTol = Math.min(160, S.seaTolerance + 40);
      setSeaTolerance(newTol);
      const slider = document.getElementById('sea-tolerance');
      if (slider) slider.value = newTol;
      await detectCoastlineFromSeaColor();
    }
    showToast(`Auto sea colour: ${hex} (from the image's outer band)`);
  } catch (err) {
    setSeaStatus('auto-detect failed', 'warn');
  }
}

// ---- Sea segmentation + marching-squares contour tracer ----

// ---- Sea segmentation + marching-squares contour tracer ----
export function buildSeaMask(cache, rgb, tol) {
  const {
    W,
    H,
    data
  } = cache;
  const n = W * H;
  const mask = new Uint8Array(n);
  const tol2 = tol * tol;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const dr = data[i] - rgb[0];
    const dg = data[i + 1] - rgb[1];
    const db = data[i + 2] - rgb[2];
    mask[p] = dr * dr + dg * dg + db * db <= tol2 ? 1 : 0;
  }
  return mask;
}

export function marchingSquaresContours(mask, W, H) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0;
  const segs = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = at(x, y),
        tr = at(x + 1, y),
        br = at(x + 1, y + 1),
        bl = at(x, y + 1);
      const idx = tl * 8 + tr * 4 + br * 2 + bl;
      if (idx === 0 || idx === 15) continue;
      const T = [x + 0.5, y],
        R = [x + 1, y + 0.5],
        B = [x + 0.5, y + 1],
        L = [x, y + 0.5];
      let s = null;
      switch (idx) {
        case 1:
          s = [[L, B]];
          break;
        case 2:
          s = [[B, R]];
          break;
        case 3:
          s = [[L, R]];
          break;
        case 4:
          s = [[T, R]];
          break;
        case 5:
          s = [[L, T], [B, R]];
          break;
        case 6:
          s = [[T, B]];
          break;
        case 7:
          s = [[L, T]];
          break;
        case 8:
          s = [[T, L]];
          break;
        case 9:
          s = [[T, B]];
          break;
        case 10:
          s = [[T, R], [L, B]];
          break;
        case 11:
          s = [[T, R]];
          break;
        case 12:
          s = [[L, R]];
          break;
        case 13:
          s = [[B, R]];
          break;
        case 14:
          s = [[L, B]];
          break;
      }
      if (s) s.forEach(seg => segs.push(seg));
    }
  }

  // Join the little segments into continuous coastlines
  const keyOf = p => `${p[0]},${p[1]}`;
  const adj = new Map();
  const add = (from, to) => {
    const k = keyOf(from);
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push({
      from,
      to
    });
  };
  segs.forEach(([a, b]) => {
    add(a, b);
    add(b, a);
  });
  const lines = [];
  adj.forEach((list, startKey) => {
    while (list.length) {
      const first = list.pop();
      const line = [first.from, first.to];
      let cur = keyOf(first.to);
      let guard = 0;
      while (cur && guard++ < 20000) {
        const arr = adj.get(cur);
        if (!arr || arr.length === 0) break;
        const nxt = arr.pop();
        line.push(nxt.to);
        cur = keyOf(nxt.to);
        if (cur === startKey) break;
      }
      if (line.length >= 3) lines.push(line);
    }
  });
  return lines;
}

export async function extractOverlayCoastPoints() {
  const cache = await loadOverlayPixels();
  const rgb = hexToRgbArr(S.seaColorHex);
  const mask = buildSeaMask(cache, rgb, S.seaTolerance);
  const lines = marchingSquaresContours(mask, cache.W, cache.H);
  if (lines.length === 0) return null;
  const norm = lines.map(line => line.map(([x, y]) => [x / cache.W - 0.5, y / cache.H - 0.5]));
  const arr = [];
  norm.forEach(line => line.forEach((p, i) => {
    if (i % 2 === 0) arr.push(p[0], p[1]);
  }));
  if (arr.length < 60) return null;
  let pts = subsamplePts(new Float32Array(arr), 2400);
  return {
    pts,
    ratio: cache.ratio,
    w: cache.W,
    h: cache.H,
    polylines: norm
  };
}

export async function detectCoastlineFromSeaColor() {
  if (!S.referenceImageLayer) {
    showToast('Upload an overlay image first');
    return;
  }
  setSeaStatus('tracing coastline…', 'busy');
  const btn = document.getElementById('btn-detect-coast');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-60');
  }
  try {
    const ext = await extractOverlayCoastPoints();
    if (!ext) {
      setSeaStatus(`no sea pixels matched ${S.seaColorHex} — raise tolerance`, 'warn');
      return false;
    }
    S.detectedCoastPolylines = ext.polylines;
    drawDetectedCoastPreview();
    const totalPts = ext.polylines.reduce((s, l) => s + l.length, 0);
    setSeaStatus(`${ext.polylines.length} coastline segments · ${totalPts.toLocaleString()} vertices`, 'ok');
    showToast(`Coastline traced from sea colour (${ext.polylines.length} segments)`);
    return true;
  } catch (err) {
    console.warn('Coast detection failed:', err);
    setSeaStatus('detection failed', 'warn');
    showToast('Coast detection failed: ' + err.message);
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-60');
    }
  }
}

export function drawDetectedCoastPreview() {
  clearDetectedCoastPreview();
  if (!S.detectedCoastPolylines || !S.imageCenter || !S.overlayPxW) return;
  const lls = S.detectedCoastPolylines.map(line => line.map(([u, v]) => overlayUVToLatLng(u, v)));
  S.detectedCoastPreviewLayer = L.polyline(lls, {
    color: '#f0abfc',
    weight: 2,
    opacity: 0.95,
    dashArray: '4,4',
    interactive: false
  }).addTo(S.map);
}

export function clearDetectedCoastPreview() {
  if (S.detectedCoastPreviewLayer) {
    S.map.removeLayer(S.detectedCoastPreviewLayer);
    S.detectedCoastPreviewLayer = null;
  }
  setSeaStatus('preview cleared', null);
}

export function addDetectedCoastAsShapes() {
  if (!S.detectedCoastPolylines || S.detectedCoastPolylines.length === 0) {
    showToast('Run "Detect coast" first');
    return;
  }
  if (!S.imageCenter || !S.overlayPxW) {
    showToast('Place the overlay (Auto Place or georeference) first');
    return;
  }
  const coords = S.detectedCoastPolylines.map(line => line.map(([u, v]) => {
    const ll = overlayUVToLatLng(u, v);
    return [ll.lng, ll.lat];
  }));
  const feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      coordinates: coords
    }
  };
  const layer = L.geoJSON(feature, {
    style: {
      color: '#f0abfc',
      weight: 2,
      opacity: 1,
      fillOpacity: 0,
      interactive: true
    }
  }).getLayers()[0];
  if (!layer) {
    showToast('Could not add the coastline');
    return;
  }
  setupLayerProperties(layer);
  layer.feature.properties.name = 'Detected Coastline (overlay)';
  layer.feature.properties.stroke = '#f0abfc';
  layer.feature.properties.fill = '#f0abfc';
  layer.feature.properties['stroke-width'] = 2;
  layer.on('click', () => {
    S.activeSelectedLayer = layer;
    populateStyleDrawer(layer);
    onFeatureClick(layer);
  });
  S.drawnItems.addLayer(layer);
  S.activeSelectedLayer = layer;
  updateStats();
  populateStyleDrawer(layer);
  const pts = coords.reduce((s, c) => s + c.length, 0);
  showToast(`Detected coastline added as an editable shape (${pts.toLocaleString()} points)`);
}

// ---- Search driver ---------------------------------------------------

// ---- Search driver ---------------------------------------------------
export async function runGeorefDetection() {
  if (S.georefBusy) return;
  if (!S.referenceImageLayer || !S.imageCenter) {
    showToast("Upload a reference image first");
    return;
  }
  S.georefBusy = true;
  const runBtn = document.getElementById('btn-georef-run');
  runBtn.disabled = true;
  runBtn.classList.add('opacity-60');
  document.getElementById('georef-result').classList.add('hidden');
  setGeorefStatus('Working…');
  setGeorefProgress(2, 'Loading reference map data…');
  try {
    await ensureHeavyLibs();
    await loadGlobalLandmass();
    await ensureWorldBorders();
    if (S.landFeaturesList.length === 0) {
      throw new Error('Reference map data unavailable — needs internet on first run.');
    }
    const sens = document.getElementById('georef-sens').value;
    const areaMode = document.getElementById('georef-area').value;
    const searchRot = document.getElementById('georef-rot').checked;

    // Evidence for the matcher: sea-colour coastline when enabled (far more
    // trustworthy on map images), otherwise the classic Sobel extraction.
    setGeorefProgress(9, S.seaDetectEnabled ? 'Tracing coastline from sea colour…' : 'Extracting outlines from your overlay…');
    await nextTick();
    let ext = null;
    if (S.seaDetectEnabled) {
      try {
        ext = await extractOverlayCoastPoints();
      } catch (e) {
        ext = null;
      }
      if (ext) {
        S.detectedCoastPolylines = ext.polylines;
        drawDetectedCoastPreview();
      } else {
        setSeaStatus('no sea pixels matched — falling back to edge detection', 'warn');
      }
    }
    if (!ext) ext = await extractOverlayEdgePoints(S.referenceImageRawUrl, 420, sens);
    if (!ext || ext.pts.length < 60) {
      throw new Error('Not enough coastline/linework found — tune the sea colour, or switch to "Detailed" line detail.');
    }
    const factor = areaMode === 'view' ? 1.2 : areaMode === 'wide' ? 3 : 8;
    const searchBounds = padBoundsLL(S.map.getBounds(), factor);
    setGeorefProgress(16, 'Rasterizing coastlines & borders…');
    await nextTick();
    const stat = rasterizeReference(searchBounds, 512);
    stat.ratio = ext.ratio;
    const ptsCoarse = subsamplePts(ext.pts, 620);

    // Symmetric matcher context: distance map of the overlay in image space
    const GW = 340;
    const GH = Math.max(24, Math.round(GW / ext.ratio));
    const matchCtx = {
      imageDT: buildOverlayDistanceMap(ext.pts, GW, GH),
      GW,
      GH
    };

    // ---------- Stage 1: coarse sweep over the whole search area ------
    const top = [];
    const allHits = [];
    const wSteps = 9;
    const wMin = stat.W * 0.28;
    const wMax = stat.W * 2.6;
    for (let si = 0; si < wSteps; si++) {
      const w = wMin * Math.pow(wMax / wMin, si / (wSteps - 1));
      const cap = Math.max(3, w * 0.03);
      const step = Math.max(4, Math.round(w / 16));
      for (let cx = -w / 4; cx <= stat.W + w / 4; cx += step) {
        for (let cy = -w / 4; cy <= stat.H + w / 4; cy += step) {
          const s = scorePlacement(ptsCoarse, stat, w, cx, cy, 0, cap, matchCtx);
          allHits.push(s.hits);
          pushTop(top, {
            w,
            cx,
            cy,
            theta: 0,
            hits: s.hits,
            fwdHit: s.fwdHit,
            revHit: s.revHit,
            mean: s.mean,
            stat
          }, 6);
        }
      }
      setGeorefProgress(20 + (si + 1) / wSteps * 22, `Stage 1/4 — coarse sweep ${Math.round((si + 1) / wSteps * 100)}%`);
      await nextTick();
    }
    if (top.length === 0) throw new Error('No candidate placement found in this area.');

    // ---------- Stages 2–4: localize one coarse candidate --------------
    const ptsFine = subsamplePts(ext.pts, 1200);
    const localize = async (c0, progressBase, progressSpan) => {
      const c0Px = {
        x: stat.nw.x + c0.cx * stat.k,
        y: stat.nw.y + c0.cy * stat.k
      }; // at stat.z0
      const zoom0X = c0Px.x / Math.pow(2, stat.z0);
      const zoom0Y = c0Px.y / Math.pow(2, stat.z0);
      const w0z0 = rasterToZoom0(stat, c0.w);
      const halfSpan = w0z0 * 1.3;
      const localBounds = L.latLngBounds(mercLL(zoom0X - halfSpan, zoom0Y + halfSpan, 0), mercLL(zoom0X + halfSpan, zoom0Y - halfSpan, 0));
      setGeorefProgress(progressBase, 'Rebuilding coastline map at high resolution…');
      await nextTick();
      const stat2 = rasterizeReference(localBounds, 900);
      stat2.ratio = ext.ratio;
      const c2 = zoom0ToStatPoint(stat2, zoom0X, zoom0Y);
      const w2 = zoom0ToRaster(stat2, w0z0);
      let candBest = null;
      const consider = cand => {
        if (!candBest || cand.hits > candBest.hits + 0.0015 || Math.abs(cand.hits - candBest.hits) <= 0.0015 && cand.mean < candBest.mean - 0.2) candBest = cand;
      };

      // Stage 2 — scale + position refinement at high resolution
      const sSteps = 7;
      for (let si = 0; si < sSteps; si++) {
        const f = Math.pow(1.12, si - (sSteps - 1) / 2); // ±~35%
        const w = w2 * f;
        const cap = Math.max(2, w * 0.025);
        const step = Math.max(1, Math.round(w / 44));
        const range = Math.round(w * 0.38);
        for (let cx = c2.x - range; cx <= c2.x + range; cx += step) {
          for (let cy = c2.y - range; cy <= c2.y + range; cy += step) {
            const s = scorePlacement(ptsFine, stat2, w, cx, cy, 0, cap, matchCtx);
            consider({
              w,
              cx,
              cy,
              theta: 0,
              hits: s.hits,
              fwdHit: s.fwdHit,
              revHit: s.revHit,
              mean: s.mean,
              stat: stat2
            });
          }
        }
        setGeorefProgress(progressBase + (si + 1) / sSteps * progressSpan * 0.34, `Fine scale search ${Math.round((si + 1) / sSteps * 100)}%`);
        await nextTick();
      }

      // Stage 3 — rotation search
      if (searchRot && candBest) {
        const base = {
          ...candBest
        };
        const rots = [-20, -14, -9, -5, 0, 5, 9, 14, 20];
        const ptsRot = subsamplePts(ext.pts, 1000);
        for (let ri = 0; ri < rots.length; ri++) {
          const th = rots[ri] * Math.PI / 180;
          const cap = Math.max(2, base.w * 0.025);
          const step = Math.max(1, Math.round(base.w / 60));
          const range = Math.round(base.w * 0.14);
          for (let sx = -1; sx <= 1; sx++) {
            const w = base.w * (1 + sx * 0.06);
            for (let cx = base.cx - range; cx <= base.cx + range; cx += step) {
              for (let cy = base.cy - range; cy <= base.cy + range; cy += step) {
                const s = scorePlacement(ptsRot, stat2, w, cx, cy, th, cap, matchCtx);
                consider({
                  w,
                  cx,
                  cy,
                  theta: rots[ri],
                  hits: s.hits,
                  fwdHit: s.fwdHit,
                  revHit: s.revHit,
                  mean: s.mean,
                  stat: stat2
                });
              }
            }
          }
          setGeorefProgress(progressBase + progressSpan * (0.34 + (ri + 1) / rots.length * 0.36), `Rotation sweep ${Math.round((ri + 1) / rots.length * 100)}%`);
          await nextTick();
        }
      }

      // Stage 4 — micro refinement
      if (candBest) {
        const base = {
          ...candBest
        };
        const ptsMicro = subsamplePts(ext.pts, 1600);
        const rotsFine = searchRot ? [-2.5, 0, 2.5] : [0];
        for (let ri = 0; ri < rotsFine.length; ri++) {
          const th = (base.theta + rotsFine[ri]) * Math.PI / 180;
          const cap = Math.max(2, base.w * 0.02);
          const step = Math.max(1, Math.round(base.w / 80));
          const range = Math.round(base.w * 0.05);
          for (let si = 0; si < 5; si++) {
            const w = base.w * (1 + (si - 2) * 0.012);
            for (let cx = base.cx - range; cx <= base.cx + range; cx += step) {
              for (let cy = base.cy - range; cy <= base.cy + range; cy += step) {
                const s = scorePlacement(ptsMicro, stat2, w, cx, cy, th, cap, matchCtx);
                if (!candBest || s.hits > candBest.hits + 0.001 || Math.abs(s.hits - candBest.hits) <= 0.001 && s.mean < candBest.mean - 0.2) {
                  candBest = {
                    w,
                    cx,
                    cy,
                    theta: base.theta + rotsFine[ri],
                    hits: s.hits,
                    fwdHit: s.fwdHit,
                    revHit: s.revHit,
                    mean: s.mean,
                    stat: stat2
                  };
                }
              }
            }
          }
          setGeorefProgress(progressBase + progressSpan * (0.72 + (ri + 1) / rotsFine.length * 0.26), `Micro refinement ${Math.round((ri + 1) / rotsFine.length * 100)}%`);
          await nextTick();
        }
      }
      return candBest;
    };

    // Localize the best coarse candidate; if it stays weak, try the
    // next-best candidates before giving up (guards false positives).
    let best = null;
    const attempts = Math.min(top.length, 3);
    for (let ci = 0; ci < attempts; ci++) {
      if (ci > 0) setGeorefProgress(46, `Trying alternative candidate #${ci + 1}…`);
      const b = await localize(top[ci], 46, 34);
      if (b && (!best || b.hits > best.hits + 0.002 || Math.abs(b.hits - best.hits) <= 0.002 && b.mean < best.mean - 0.2)) best = b;
      if (best && best.hits >= 0.52) break;
    }
    if (!best) throw new Error('Matching failed — no plausible placement found.');

    // ---------- Confidence -------------------------------------------------
    const hitsArr = allHits.length ? allHits : [0];
    let mean = 0;
    for (let i = 0; i < hitsArr.length; i++) mean += hitsArr[i];
    mean /= hitsArr.length;
    let variance = 0;
    for (let i = 0; i < hitsArr.length; i++) {
      const dd = hitsArr[i] - mean;
      variance += dd * dd;
    }
    const sd = Math.sqrt(variance / hitsArr.length);
    const z = sd > 1e-6 ? (best.hits - mean) / sd : best.hits > 0.15 ? 3 : 0;
    const capFinal = Math.max(2, best.w * 0.03);
    const distQ = Math.max(0, 1 - best.mean / capFinal);
    let conf = Math.round(Math.min(99, 100 * best.hits * (0.45 + 0.55 * distQ)));
    if (z < 1.5) conf = Math.min(conf, 35);else if (z < 2.5) conf = Math.min(conf, 55);
    if (conf < 3) conf = 3;
    setGeorefProgress(97, 'Applying placement…');
    await nextTick();

    // The winning candidate carries its own raster context (localize() builds
    // a fresh one per attempt) — never reference a leaked outer variable here.
    const finalStat = best.stat || stat;
    const geo = statToLatLng(finalStat, best.cx, best.cy);
    const widthKm = rasterToZoom0(finalStat, best.w) * 40075016.686 * Math.cos(geo.lat * Math.PI / 180) / 256 / 1000;
    const heightKm = widthKm / ext.ratio;
    await applyGeorefDetection(best, geo, widthKm, heightKm, conf, z);
    hideGeorefProgress();
    setGeorefStatus('Placed');
  } catch (err) {
    console.warn('Georef error:', err);
    hideGeorefProgress();
    setGeorefStatus('Failed');
    showToast('Detection failed: ' + err.message);
  } finally {
    S.georefBusy = false;
    runBtn.disabled = false;
    runBtn.classList.remove('opacity-60');
    lucide.createIcons();
  }
}

export async function applyGeorefDetection(best, geo, widthKm, heightKm, conf, z) {
  const snapshot = snapshotOverlayState();
  let baseW = rasterToZoom0(best.stat, best.w) * Math.pow(2, OVERLAY_REF_ZOOM);
  let srcUrl = S.referenceImageRawUrl;
  let ratio = S.imageNaturalAspectRatio;
  let bakeNote = 'north-up';
  if (Math.abs(best.theta) > 2.5) {
    const baked = await bakeRotatedOverlay(srcUrl, best.theta);
    srcUrl = baked.url;
    ratio = baked.ratio;
    baseW = baseW * baked.widthScale;
    bakeNote = `rotated ${best.theta.toFixed(1)}°`;
  }
  const baseH = baseW / ratio;
  if (S.referenceImageLayer) {
    S.map.removeLayer(S.referenceImageLayer);
    S.referenceImageLayer = null;
  }
  S.referenceImageRawUrl = srcUrl;
  S.imageNaturalAspectRatio = ratio;
  S.imageCenter = L.latLng(geo.lat, geo.lng);
  S.overlayBasePxW = baseW;
  S.overlayBasePxH = baseH;
  S.scaleW = 1.0;
  S.scaleH = 1.0;
  S.overlayPxW = baseW;
  S.overlayPxH = baseH;
  const op = parseFloat(document.getElementById('image-opacity-slider').value || 70) / 100;
  S.referenceImageLayer = L.imageOverlay(srcUrl, overlayProjectedBounds(), {
    opacity: op,
    interactive: false,
    zIndex: 350
  }).addTo(S.map);
  createImageControlHandles();
  document.getElementById('image-controls').classList.remove('hidden');
  syncScaleUI();
  S.lastGeorefSnapshot = snapshot;
  const fwdPct = best.fwdHit !== undefined ? Math.round(best.fwdHit * 100) : Math.round(best.hits * 100);
  const revPct = best.revHit !== undefined ? Math.round(best.revHit * 100) : fwdPct;
  const detail = `${geo.lat.toFixed(4)}°, ${geo.lng.toFixed(4)}° • ≈${widthKm.toFixed(widthKm < 100 ? 1 : 0)} × ${heightKm.toFixed(heightKm < 100 ? 1 : 0)} km • ${bakeNote} • z=${z.toFixed(2)} • image ${fwdPct}% / map ${revPct}%`;
  showGeorefResult(conf, fwdPct, detail);
  showToast(conf >= 55 ? `Overlay georeferenced (${conf}% confidence)` : `Placed with ${conf}% confidence — check / refine manually`);
}

// ================= BORDER DETAILENER (natural fractal roughener) =================
// Classic midpoint-displacement fractals: each straight edge is recursively
// split and its midpoint pushed along the normal by a random amount that
// decays by the "roughness" persistence per level. Endpoints never move, so
// the region's footprint stays identical — only the outline gains detail.
