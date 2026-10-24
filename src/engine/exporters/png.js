// Split out of the original single-file engine (see legacy/index.html).
// Origin: TRANSPARENT PNG VECTOR RENDERER

import L from 'leaflet';
import { S } from '../state.js';
import { PREVIEW_COLOR } from '../constants.js';
import { closeDrawers, showToast } from '../uiHelpers.js';

// ================= TRANSPARENT PNG VECTOR RENDERER =================
export function downloadTransparentPNG(cropTight = true, { pixelPerfect = false } = {}) {
  const layers = S.drawnItems.getLayers();
  if (layers.length === 0) {
    showToast("Please draw at least one shape first!");
    return;
  }
  showToast(pixelPerfect
    ? "Rendering pixel-perfect PNG with hard edges..."
    : "Rendering transparent PNG of drawn shapes...");
  closeDrawers();
  const dpr = pixelPerfect ? 1 : 2;
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

  if (pixelPerfect) {
    const scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = canvas.width;
    scratchCanvas.height = canvas.height;
    const scratchCtx = scratchCanvas.getContext('2d');
    if (!scratchCtx) {
      showToast("Pixel-perfect PNG export is not supported in this browser");
      return;
    }
    ctx.imageSmoothingEnabled = false;
    scratchCtx.imageSmoothingEnabled = false;
    try {
      for (const layer of layers) {
        // Harden fill and stroke separately so intentional layer opacity remains
        // intact and antialiased edges cannot blend their colors together.
        for (const paint of ['fill', 'stroke']) {
          if (!hasVectorPaint(layer, paint)) continue;
          scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
          scratchCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
          scratchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawVectorLayerToCanvas(scratchCtx, layer, minX, minY, paint);
          const imageData = scratchCtx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height);
          hardenAlphaCoverage(imageData, layerPaintOpacity(layer, paint));
          scratchCtx.putImageData(imageData, 0, 0);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(scratchCanvas, 0, 0);
          ctx.restore();
        }
      }
    } catch (error) {
      console.error('Pixel-perfect PNG export failed', error);
      showToast("Pixel-perfect PNG export failed in this browser");
      return;
    }
  } else {
    layers.forEach((layer) => {
      drawVectorLayerToCanvas(ctx, layer, minX, minY);
    });
  }

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast("Export failed");
      return;
    }
    const url = URL.createObjectURL(blob);
    const dlLink = document.createElement('a');
    dlLink.href = url;
    dlLink.download = pixelPerfect
      ? `drawn_region_pixel_perfect_${Date.now()}.png`
      : `drawn_region_transparent_${Date.now()}.png`;
    document.body.appendChild(dlLink);
    dlLink.click();
    dlLink.remove();
    URL.revokeObjectURL(url);
    showToast(pixelPerfect ? "Pixel-perfect PNG downloaded!" : "Transparent PNG downloaded!");
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

function layerPaintOpacity(layer, paint) {
  const options = layer.options || {};
  const props = layer.feature && layer.feature.properties || {};
  if (paint === 'fill') {
    return clampAlpha(options.fillOpacity ?? props['fill-opacity'], layer instanceof L.Marker ? 1 : 0.2);
  }
  return clampAlpha(options.opacity, 1);
}

function hasVectorPaint(layer, paint) {
  const options = layer.options || {};
  const props = layer.feature && layer.feature.properties || {};
  if (paint === 'fill') {
    const hasFillGeometry = layer instanceof L.Polygon
      || layer instanceof L.CircleMarker
      || layer instanceof L.Marker;
    return hasFillGeometry && options.fill !== false && props.fill !== false
      && layerPaintOpacity(layer, paint) > 0;
  }
  const hasStrokeGeometry = layer instanceof L.Polyline
    || layer instanceof L.CircleMarker
    || layer instanceof L.Marker;
  const hasExplicitMarkerStroke = options.weight !== undefined || props['stroke-width'] !== undefined;
  const width = Math.max(0, readNumber(options.weight, readNumber(props['stroke-width'], 3)));
  return hasStrokeGeometry && options.stroke !== false && props.stroke !== false && width > 0
    && (!(layer instanceof L.Marker) || hasExplicitMarkerStroke)
    && layerPaintOpacity(layer, paint) > 0;
}

/** Convert antialiased coverage into hard on/off edge pixels at the paint opacity. */
export function hardenAlphaCoverage(imageData, opacity, threshold = 0.5) {
  const targetAlpha = Math.round(clampAlpha(opacity) * 255);
  const cutoff = targetAlpha * clampAlpha(threshold, 0.5);
  const data = imageData && imageData.data;
  if (!data || targetAlpha <= 0) return imageData;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < cutoff) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    } else if (data[i + 3] > 0) {
      data[i + 3] = targetAlpha;
    }
  }
  return imageData;
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

export function drawVectorLayerToCanvas(ctx, layer, offsetX, offsetY, paint = 'both') {
  const opts = layer.options || {};
  const props = layer.feature && layer.feature.properties || {};
  const fillColor = opts.fillColor || props.fill || opts.color || props.stroke || PREVIEW_COLOR;
  const strokeColor = opts.color || props.stroke || fillColor;
  const fillOpacity = layerPaintOpacity(layer, 'fill');
  const strokeOpacity = layerPaintOpacity(layer, 'stroke');
  const strokeWidth = Math.max(0, readNumber(opts.weight, readNumber(props['stroke-width'], 3)));
  const dashArray = parseDashArray(opts.dashArray ?? props['stroke-dasharray']);
  const lineCap = ['butt', 'round', 'square'].includes(opts.lineCap) ? opts.lineCap : 'round';
  const lineJoin = ['round', 'bevel', 'miter'].includes(opts.lineJoin) ? opts.lineJoin : 'round';
  const baseAlpha = clampAlpha(ctx.globalAlpha, 1);
  const canFill = paint !== 'stroke' && hasVectorPaint(layer, 'fill');
  const canStroke = paint !== 'fill' && hasVectorPaint(layer, 'stroke');

  ctx.save();
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = lineJoin;
  ctx.lineCap = lineCap;
  ctx.lineDashOffset = readNumber(opts.dashOffset ?? props['stroke-dashoffset'], 0);
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash(dashArray);

  if (layer instanceof L.Polygon) {
    renderPolygonPath(ctx, layer.getLatLngs(), offsetX, offsetY);
    if (canFill) {
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
    if (canFill) {
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
    if (canFill) {
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
