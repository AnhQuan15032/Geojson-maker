// Split out of the original single-file engine (see legacy/index.html).
// Origin: TRANSPARENT PNG VECTOR RENDERER

import L from 'leaflet';
import { S } from '../state.js';
import { hexToRgba } from '../../lib/util.js';
import { PREVIEW_COLOR } from '../constants.js';
import { closeDrawers, showToast } from '../uiHelpers.js';

// ================= TRANSPARENT PNG VECTOR RENDERER =================
export function downloadTransparentPNG(cropTight = true) {
  const layers = S.drawnItems.getLayers();
  if (layers.length === 0) {
    showToast("Please draw at least one shape first!");
    return;
  }
  showToast("Rendering transparent PNG of drawn shapes...");
  closeDrawers();
  const dpr = 2;
  const mapSize = S.map.getSize();
  let minX, minY, width, height;
  if (cropTight) {
    const bounds = S.drawnItems.getBounds();
    const nw = S.map.latLngToContainerPoint(bounds.getNorthWest());
    const se = S.map.latLngToContainerPoint(bounds.getSouthEast());
    const pad = 30;
    minX = Math.min(nw.x, se.x) - pad;
    minY = Math.min(nw.y, se.y) - pad;
    const maxX = Math.max(nw.x, se.x) + pad;
    const maxY = Math.max(nw.y, se.y) + pad;
    width = Math.max(maxX - minX, 10);
    height = Math.max(maxY - minY, 10);
  } else {
    minX = 0;
    minY = 0;
    width = mapSize.x;
    height = mapSize.y;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  S.drawnItems.eachLayer(layer => {
    drawVectorLayerToCanvas(ctx, layer, minX, minY);
  });
  canvas.toBlob(blob => {
    if (!blob) {
      showToast("Export failed");
      return;
    }
    const url = URL.createObjectURL(blob);
    const dlLink = document.createElement('a');
    dlLink.href = url;
    dlLink.download = `drawn_region_transparent_${Date.now()}.png`;
    document.body.appendChild(dlLink);
    dlLink.click();
    dlLink.remove();
    URL.revokeObjectURL(url);
    showToast("Transparent PNG downloaded!");
  }, 'image/png');
}

export function drawVectorLayerToCanvas(ctx, layer, offsetX, offsetY) {
  const opts = layer.options || {};
  const props = layer.feature && layer.feature.properties || {};
  const fillColor = opts.fillColor || props.fill || PREVIEW_COLOR;
  const strokeColor = opts.color || props.stroke || fillColor;
  const strokeWidth = Number(opts.weight || props['stroke-width'] || 0) || 0;
  ctx.save();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = hexToRgba(fillColor, 1.0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  if (layer instanceof L.Polygon) {
    const latlngs = layer.getLatLngs();
    renderPolygonPath(ctx, latlngs, offsetX, offsetY);
    ctx.fill('evenodd');
    if (strokeWidth > 0) ctx.stroke();
  } else if (layer instanceof L.Polyline) {
    ctx.lineWidth = strokeWidth > 0 ? strokeWidth : 3;
    const latlngs = layer.getLatLngs();
    renderLinePath(ctx, latlngs, offsetX, offsetY);
    ctx.stroke();
  } else if (layer instanceof L.Marker) {
    const pt = S.map.latLngToContainerPoint(layer.getLatLng());
    const x = pt.x - offsetX;
    const y = pt.y - offsetY;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderPolygonPath(ctx, latlngs, offsetX, offsetY) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return;
  if (Array.isArray(latlngs[0])) {
    ctx.beginPath();
    latlngs.forEach(ring => {
      if (Array.isArray(ring) && ring.length > 0 && Array.isArray(ring[0])) {
        ring.forEach(subring => appendRingToPath(ctx, subring, offsetX, offsetY));
      } else {
        appendRingToPath(ctx, ring, offsetX, offsetY);
      }
    });
  } else {
    ctx.beginPath();
    appendRingToPath(ctx, latlngs, offsetX, offsetY);
  }
}

export function appendRingToPath(ctx, ring, offsetX, offsetY) {
  ring.forEach((ll, i) => {
    const pt = S.map.latLngToContainerPoint(ll);
    const x = pt.x - offsetX;
    const y = pt.y - offsetY;
    if (i === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

export function renderLinePath(ctx, latlngs, offsetX, offsetY) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return;
  const flat = Array.isArray(latlngs[0]) ? latlngs.flat(3) : latlngs;
  ctx.beginPath();
  flat.forEach((ll, i) => {
    const pt = S.map.latLngToContainerPoint(ll);
    const x = pt.x - offsetX;
    const y = pt.y - offsetY;
    if (i === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
  });
}
