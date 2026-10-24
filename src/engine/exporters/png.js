// Split out of the original single-file engine (see legacy/index.html).
// Origin: TRANSPARENT PNG VECTOR RENDERER

import L from 'leaflet';
import { S } from '../state.js';
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
    const pad = Math.max(30, Math.ceil(maxStrokeBleed(layers)));
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
  canvas.width = Math.max(1, Math.ceil(width * dpr));
  canvas.height = Math.max(1, Math.ceil(height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    showToast("PNG export is not supported in this browser");
    return;
  }
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  layers.forEach((layer) => {
    drawVectorLayerToCanvas(ctx, layer, minX, minY);
  });
  canvas.toBlob((blob) => {
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

function maxStrokeBleed(layers) {
  return layers.reduce((max, layer) => {
    const options = layer.options || {};
    const weight = Math.max(0, readNumber(options.weight, 0));
    const markerRadius = layer instanceof L.CircleMarker
      ? Math.max(0, layer instanceof L.Circle
        ? readNumber(layer._radius, 0)
        : readNumber(layer.getRadius(), 0))
      : 0;
    return Math.max(max, weight / 2 + 2, markerRadius + weight / 2 + 2);
  }, 0);
}

function readNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampAlpha(value, fallback = 1) {
  return Math.min(1, Math.max(0, readNumber(value, fallback)));
}

function isLatLng(value) {
  return value !== null && typeof value === 'object'
    && Number.isFinite(value.lat) && Number.isFinite(value.lng);
}

/** Visit each independent coordinate sequence without joining separate parts. */
function forEachPath(coordinates, visit) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return;
  if (isLatLng(coordinates[0])) {
    visit(coordinates);
    return;
  }
  coordinates.forEach((part) => forEachPath(part, visit));
}

function canvasPoint(latlng, offsetX, offsetY) {
  const point = S.map.latLngToContainerPoint(latlng);
  return [point.x - offsetX, point.y - offsetY];
}

function appendOpenPath(ctx, line, offsetX, offsetY) {
  if (!Array.isArray(line) || line.length === 0) return;
  let started = false;
  for (const latlng of line) {
    if (!isLatLng(latlng)) continue;
    const [x, y] = canvasPoint(latlng, offsetX, offsetY);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
}

export function drawVectorLayerToCanvas(ctx, layer, offsetX, offsetY) {
  const opts = layer.options || {};
  const props = layer.feature && layer.feature.properties || {};
  const fillColor = opts.fillColor || props.fill || opts.color || props.stroke || PREVIEW_COLOR;
  const strokeColor = opts.color || props.stroke || fillColor;
  const isMarker = layer instanceof L.Marker;
  const fillOpacity = clampAlpha(opts.fillOpacity ?? props['fill-opacity'], isMarker ? 1 : 0.2);
  const strokeOpacity = clampAlpha(opts.opacity, 1);
  const hasExplicitStrokeWidth = opts.weight !== undefined || props['stroke-width'] !== undefined;
  const strokeWidth = Math.max(0, readNumber(opts.weight, readNumber(props['stroke-width'], 3)));
  const dashArray = parseDashArray(opts.dashArray ?? props['stroke-dasharray']);
  const lineWidth = strokeWidth;
  const lineCap = ['butt', 'round', 'square'].includes(opts.lineCap) ? opts.lineCap : 'round';
  const lineJoin = ['round', 'bevel', 'miter'].includes(opts.lineJoin) ? opts.lineJoin : 'round';
  const baseAlpha = clampAlpha(ctx.globalAlpha, 1);
  const canStroke = opts.stroke !== false && props.stroke !== false && lineWidth > 0
    && (!isMarker || hasExplicitStrokeWidth);
  const canFill = opts.fill !== false && props.fill !== false;

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = lineJoin;
  ctx.lineCap = lineCap;
  ctx.lineDashOffset = readNumber(opts.dashOffset ?? props['stroke-dashoffset'], 0);
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash(dashArray);

  if (layer instanceof L.Polygon) {
    renderPolygonPath(ctx, layer.getLatLngs(), offsetX, offsetY);
    if (canFill && fillOpacity > 0) {
      ctx.globalAlpha = baseAlpha * fillOpacity;
      ctx.fillStyle = fillColor;
      ctx.fill(opts.fillRule || 'evenodd');
    }
    if (canStroke) {
      ctx.globalAlpha = baseAlpha * strokeOpacity;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  } else if (layer instanceof L.Polyline) {
    renderLinePath(ctx, layer.getLatLngs(), offsetX, offsetY);
    if (canStroke) {
      ctx.globalAlpha = baseAlpha * strokeOpacity;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  } else if (layer instanceof L.CircleMarker) {
    const point = canvasPoint(layer.getLatLng(), offsetX, offsetY);
    const radius = layer instanceof L.Circle && Number.isFinite(layer._radius)
      ? Math.max(0, layer._radius)
      : Math.max(0, readNumber(layer.getRadius(), 6));
    ctx.beginPath();
    ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
    if (canFill && fillOpacity > 0) {
      ctx.globalAlpha = baseAlpha * fillOpacity;
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (canStroke) {
      ctx.globalAlpha = baseAlpha * strokeOpacity;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  } else if (layer instanceof L.Marker) {
    const point = canvasPoint(layer.getLatLng(), offsetX, offsetY);
    ctx.beginPath();
    ctx.arc(point[0], point[1], 6, 0, Math.PI * 2);
    if (canFill && fillOpacity > 0) {
      ctx.globalAlpha = baseAlpha * fillOpacity;
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (canStroke) {
      ctx.globalAlpha = baseAlpha * strokeOpacity;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function parseDashArray(value) {
  if (Array.isArray(value)) return value.map(Number).filter((number) => Number.isFinite(number) && number >= 0);
  if (typeof value === 'number') return value > 0 ? [value, value] : [];
  if (typeof value !== 'string' || !value.trim()) return [];
  const values = value.match(/\d*\.?\d+/g)?.map(Number) || [];
  return values.filter((number) => Number.isFinite(number) && number >= 0);
}

export function renderPolygonPath(ctx, latlngs, offsetX, offsetY) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return;
  ctx.beginPath();
  forEachPath(latlngs, (ring) => appendRingToPath(ctx, ring, offsetX, offsetY));
}

export function appendRingToPath(ctx, ring, offsetX, offsetY) {
  appendOpenPath(ctx, ring, offsetX, offsetY);
  if (Array.isArray(ring) && ring.some(isLatLng)) ctx.closePath();
}

export function renderLinePath(ctx, latlngs, offsetX, offsetY) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return;
  ctx.beginPath();
  forEachPath(latlngs, (line) => appendOpenPath(ctx, line, offsetX, offsetY));
}
