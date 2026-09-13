/**
 * Canvas renderer for the feature layer: fills (solid / tiled image /
 * stretched image / single image), outlines, labels, hover and selection
 * decoration.
 *
 * All drawing happens in CSS-pixel space (the view applies one dpr transform),
 * and image fills pick a pyramid level per frame from the *device* pixel size
 * they will occupy — that is what keeps them solid when zoomed out and sharp
 * when zoomed in.
 */

import { clamp, withAlpha, readableOn } from '../core/util.js';
import {
  pointInPolygonRings, distToPolylineSq, polygonCentroid, lngToUnitX, latToUnitY,
} from '../core/geo.js';
import { styleOf, featureName, dashKeyToArray } from '../core/geojson.js';
import { pickLevel, patternFor, rgbaString } from './pyramid.js';

export const ACCENT = '#2f6df6';
const HANDLE = 4.5;         // half-size of a vertex handle, CSS px
const HIT_TOLERANCE = 9;    // CSS px

/* ------------------------------------------------------- projection cache */

function pushPoint(out, x, y, bbox) {
  const p = { x, y };
  out.push(p);
  if (x < bbox.minX) bbox.minX = x;
  if (x > bbox.maxX) bbox.maxX = x;
  if (y < bbox.minY) bbox.minY = y;
  if (y > bbox.maxY) bbox.maxY = y;
  return p;
}

/** Project a feature's geometry into screen space (CSS pixels). */
export function projectFeature(feature, m, centerLng) {
  const g = feature.geometry;
  const path = new Path2D();
  const bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const geom = {
    type: g ? g.type : 'Point',
    path, bbox, rings: [], ringSources: [], polygons: [], lines: [], points: [],
    centroid: null, anchorLat: 0,
  };
  if (!g || !g.coordinates) return geom;

  const centerWorldX = lngToUnitX(centerLng) * m.scale;
  const world = m.scale;

  const proj = (pos) => {
    // Same world-copy snapping the map uses, so shapes crossing the date line
    // still land next to the camera instead of a world away.
    const wx = lngToUnitX(pos[0]) * world;
    return {
      x: wx + Math.round((centerWorldX - wx) / world) * world + m.ox,
      y: latToUnitY(pos[1]) * world + m.oy,
    };
  };

  let latSum = 0;
  let latCount = 0;
  const ringTo = (ring) => {
    geom.ringSources.push(ring);
    const pts = [];
    for (const pos of ring) {
      const p = proj(pos);
      pushPoint(pts, p.x, p.y, bbox);
      latSum += pos[1];
      latCount++;
    }
    return pts;
  };

  switch (g.type) {
    case 'Point': {
      const p = proj(g.coordinates);
      pushPoint(geom.points, p.x, p.y, bbox);
      geom.centroid = p;
      latSum = g.coordinates[1];
      latCount = 1;
      break;
    }
    case 'MultiPoint': {
      for (const pos of g.coordinates) {
        const p = proj(pos);
        pushPoint(geom.points, p.x, p.y, bbox);
      }
      geom.centroid = geom.points.length ? {
        x: geom.points.reduce((s, p) => s + p.x, 0) / geom.points.length,
        y: geom.points.reduce((s, p) => s + p.y, 0) / geom.points.length,
      } : null;
      break;
    }
    case 'LineString': {
      const pts = ringTo(g.coordinates);
      geom.lines.push(pts);
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
      geom.centroid = midOfLine(pts);
      break;
    }
    case 'MultiLineString': {
      const all = [];
      for (const line of g.coordinates) {
        const pts = ringTo(line);
        geom.lines.push(pts);
        all.push(...pts);
        path.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
      }
      geom.centroid = midOfLine(all);
      break;
    }
    case 'Polygon': {
      const rings = g.coordinates.map((r) => {
        const pts = ringTo(r);
        geom.rings.push(pts);
        return pts;
      });
      addRingsToPath(path, rings);
      geom.centroid = polygonCentroid(rings[0]);
      break;
    }
    case 'MultiPolygon': {
      const first = [];
      for (const poly of g.coordinates) {
        const rings = poly.map((r) => {
          const pts = ringTo(r);
          geom.rings.push(pts);
          return pts;
        });
        geom.polygons.push(rings);
        addRingsToPath(path, rings);
        if (!first.length) first.push(...rings[0]);
      }
      geom.centroid = polygonCentroid(first);
      break;
    }
    default: break;
  }

  geom.anchorLat = latCount ? latSum / latCount : 0;
  if (!geom.centroid && isFinite(bbox.minX)) {
    geom.centroid = { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
  }
  return geom;
}

function addRingsToPath(path, rings) {
  for (const pts of rings) {
    if (pts.length < 2) continue;
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    path.closePath();
  }
}

function midOfLine(pts) {
  if (!pts.length) return null;
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push(len);
    total += len;
  }
  if (!total) return pts[0];
  let target = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const t = segs[i] === 0 ? 0 : target / segs[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    target -= segs[i];
  }
  return pts[pts.length - 1];
}

/* ------------------------------------------------------------ hit testing */

export function hitTest(geom, style, point) {
  const type = geom.type;
  const r = HIT_TOLERANCE;
  if (type === 'Point' || type === 'MultiPoint') {
    const radius = markerRadius(style) + r;
    return geom.points.some((p) => (p.x - point.x) ** 2 + (p.y - point.y) ** 2 <= radius * radius);
  }
  if (type === 'Polygon' || type === 'MultiPolygon') {
    const polys = geom.polygons.length ? geom.polygons : [geom.rings];
    if (polys.some((rings) => rings.length && pointInPolygonRings(point, rings))) return true;
    // Slivers and thin shapes: being close to the outline is enough.
    return geom.rings.some((ring) => distToPolylineSq(point, ring) <= r * r);
  }
  return geom.lines.some((line) => distToPolylineSq(point, line) <= r * r);
}

export function markerRadius(style) {
  return 5.5 + Math.max(0, style['stroke-width']) * 0.6;
}

/* -------------------------------------------------------------- renderer */

export class Renderer {
  constructor({ store, images }) {
    this.store = store;
    this.images = images;
    this.hoverId = null;
    this.editVertices = true;    // toggled off while a draw tool is active
    this.showLabels = true;
    this.geoms = new Map();      // id -> screen geometry of the last frame
    this.frame = null;           // camera matrix of the frame being drawn
    this.pendingImages = new Set();
    this.onImageNeeded = () => {};
  }

  draw(ctx, m, view) {
    this.geoms.clear();
    this.frame = m;                 // reused by the fill painters below
    const features = this.store.features;
    const centerLng = view.camera.center.lng;

    for (const feature of features) {
      const geom = projectFeature(feature, m, centerLng);
      this.geoms.set(feature.id, geom);
      this.paint(ctx, view, feature, geom);
    }

    this.paintOverlay(ctx, view, m);
  }

  geomFor(id) { return this.geoms.get(id) || null; }

  /* ---------------------------------------------------------------- fill */

  paint(ctx, view, feature, geom) {
    const style = styleOf(feature);
    const isPoint = geom.type === 'Point' || geom.type === 'MultiPoint';

    if (isPoint) {
      this.paintPoints(ctx, view, feature, geom, style);
      return;
    }

    const isArea = geom.type === 'Polygon' || geom.type === 'MultiPolygon';
    if (isArea && style['fill-opacity'] > 0) this.paintFill(ctx, view, feature, geom, style);
    this.paintStroke(ctx, geom, style);
    if (this.showLabels) this.paintLabel(ctx, geom, style, featureName(feature));
  }

  paintFill(ctx, view, feature, geom, style) {
    const mode = style['fill-mode'];
    const image = style['image-fill'];
    const useImage = (mode === 'image' || mode === 'commons') && image && image.url;

    if (!useImage) {
      ctx.save();
      ctx.globalAlpha = clamp(style['fill-opacity'], 0, 1);
      ctx.fillStyle = style.fill;
      ctx.fill(geom.path);
      ctx.restore();
      return;
    }

    const entry = this.images.get(image.url);
    if (!entry || entry.state !== 'ready' || !entry.pyramid) {
      // Still loading (or failed): keep the shape visible with its base colour.
      if (!entry) { this.requestImage(image); }
      ctx.save();
      ctx.globalAlpha = clamp(style['fill-opacity'], 0, 1);
      ctx.fillStyle = style.fill;
      ctx.fill(geom.path);
      ctx.restore();
      if (entry && entry.state === 'error') this.drawMissingBadge(ctx, geom, image);
      return;
    }

    ctx.save();
    ctx.globalAlpha = clamp(style['fill-opacity'] * clamp(image.opacity, 0, 1), 0, 1);

    if (image.backdropOn) {
      ctx.save();
      ctx.globalAlpha = clamp(style['fill-opacity'], 0, 1);
      ctx.fillStyle = image.backdrop || '#ffffff';
      ctx.fill(geom.path);
      ctx.restore();
    }

    ctx.save();
    ctx.clip(geom.path);
    if (image.layout === 'stretch') this.paintStretch(ctx, view, geom, image, entry.pyramid);
    else if (image.layout === 'center') this.paintOnce(ctx, view, geom, image, entry.pyramid);
    else this.paintTiled(ctx, view, geom, image, entry.pyramid, style.fill);
    ctx.restore();
    ctx.restore();
  }

  requestImage(image) {
    if (this.pendingImages.has(image.url)) return;
    this.pendingImages.add(image.url);
    this.onImageNeeded(image);
    // Allow a retry if the first attempt is still in flight.
    setTimeout(() => this.pendingImages.delete(image.url), 1200);
  }

  /**
   * Tiled image fill.
   *
   * `anchor: 'screen'` keeps the tile a constant size in CSS pixels — the
   * pattern never changes character as you zoom. `anchor: 'ground'` fixes the
   * tile to a real-world size, so it grows with zoom; the pyramid level is
   * re-picked every frame to match, which is what stops it turning pale when
   * small and blocky when large.
   */
  paintTiled(ctx, view, geom, image, pyr, fallbackColour = '#ffffff') {
    const dpr = view.dpr;
    const lat = Number.isFinite(geom.anchorLat) ? geom.anchorLat : view.camera.center.lat;
    const mpp = view.metersPerPixel(clamp(lat, -85, 85));
    let sizePx = image.anchor === 'ground' ? image.size / Math.max(mpp, 1e-9) : image.size;

    if (image.anchor === 'ground' && image.noUpscale) {
      sizePx = Math.min(sizePx, pyr.base.w / dpr);
    }
    sizePx = clamp(sizePx, 0.02, 1e6);

    // Sub-pixel tiles converge on the image's mean colour: paint that directly
    // instead of letting the sampler thin the artwork out. globalAlpha already
    // carries fill-opacity × image opacity, so the colour is fully opaque here.
    if (sizePx * dpr < 1.8) {
      ctx.fillStyle = pyr.avg ? rgbaString(pyr.avg, 1) : fallbackColour;
      ctx.fillRect(geom.bbox.minX - 2, geom.bbox.minY - 2,
        geom.bbox.maxX - geom.bbox.minX + 4, geom.bbox.maxY - geom.bbox.minY + 4);
      return;
    }

    const { level } = pickLevel(pyr, sizePx, dpr);
    const levelCanvas = pyr.levels[level];
    const scale = sizePx / levelCanvas.width;
    const rad = (image.rotation || 0) * Math.PI / 180;

    ctx.save();
    // Pattern origin follows the map, so tiles stay glued to the ground.
    const m = this.frame || view.matrix();
    ctx.translate(m.ox + (image.offsetX || 0), m.oy + (image.offsetY || 0));
    if (rad) ctx.rotate(rad);
    ctx.scale(scale, scale);
    ctx.fillStyle = patternFor(ctx, pyr, level);

    // Cover the whole viewport inside the transformed space.
    const inv = ctx.getTransform().invertSelf();
    const w = view.width * dpr, h = view.height * dpr;
    const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([X, Y]) => ({
      x: inv.a * X + inv.c * Y + inv.e,
      y: inv.b * X + inv.d * Y + inv.f,
    }));
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const pad = levelCanvas.width + levelCanvas.height;
    ctx.fillRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
    ctx.restore();
  }

  paintStretch(ctx, view, geom, image, pyr) {
    const bbox = geom.bbox;
    const bw = Math.max(1, bbox.maxX - bbox.minX);
    const bh = Math.max(1, bbox.maxY - bbox.minY);
    const iw = pyr.base.w, ih = pyr.base.h;
    const ratio = image.fit === 'contain' ? Math.min(bw / iw, bh / ih) : Math.max(bw / iw, bh / ih);
    const dw = iw * ratio, dh = ih * ratio;
    const dx = bbox.minX + (bw - dw) / 2;
    const dy = bbox.minY + (bh - dh) / 2;

    const { level } = pickLevel(pyr, dw, view.dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pyr.levels[level], dx, dy, dw, dh);
  }

  paintOnce(ctx, view, geom, image, pyr) {
    const c = geom.centroid || { x: 0, y: 0 };
    const w = Math.max(2, image.width || 120);
    const h = w * (pyr.aspect || 1);
    const rad = (image.rotation || 0) * Math.PI / 180;
    const { level } = pickLevel(pyr, w, view.dpr);

    ctx.save();
    ctx.translate(c.x, c.y);
    if (rad) ctx.rotate(rad);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pyr.levels[level], -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawMissingBadge(ctx, geom, image) {
    const c = geom.centroid;
    if (!c) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.font = '600 10px system-ui, sans-serif';
    const text = `image not available${image.name ? `: ${image.name}` : ''}`;
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(20,26,36,.86)';
    roundRect(ctx, c.x - w / 2, c.y - 9, w, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#ffd9d5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.x, c.y + 0.5);
    ctx.restore();
  }

  /* -------------------------------------------------------------- stroke */

  paintStroke(ctx, geom, style) {
    const width = style['stroke-width'];
    if (!width || width <= 0 || style['stroke-opacity'] <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(style['stroke-opacity'], 0, 1);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const dash = dashKeyToArray(style['stroke-dash']);
    if (dash) {
      ctx.setLineDash(dash.map((d) => d * Math.max(1, width / 2)));
      ctx.lineDashOffset = 0;
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke(geom.path);
    ctx.restore();
  }

  /* -------------------------------------------------------------- points */

  paintPoints(ctx, view, feature, geom, style) {
    const r = markerRadius(style);
    const image = style['image-fill'];
    const useImage = style['fill-mode'] !== 'solid' && image && image.url && this.images.isReady(image.url);

    for (const p of geom.points) {
      ctx.save();
      if (useImage) {
        const entry = this.images.get(image.url);
        const circle = new Path2D();
        circle.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.clip(circle);
        if (image.backdropOn) {
          ctx.fillStyle = image.backdrop;
          ctx.fill(circle);
        }
        ctx.globalAlpha = clamp(style['fill-opacity'] * image.opacity, 0, 1);
        const fakeGeom = { bbox: { minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r }, centroid: p, anchorLat: view.camera.center.lat };
        if (image.layout === 'stretch') this.paintStretch(ctx, view, fakeGeom, { ...image, fit: 'cover' }, entry.pyramid);
        else if (image.layout === 'center') this.paintOnce(ctx, view, fakeGeom, { ...image, width: r * 2 }, entry.pyramid);
        else this.paintTiled(ctx, view, fakeGeom, image, entry.pyramid, style.fill);
      } else {
        if (style['fill-mode'] !== 'solid' && image && image.url) this.requestImage(image);
        ctx.globalAlpha = clamp(Math.max(style['fill-opacity'], 0.15), 0, 1);
        ctx.fillStyle = style.fill;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (style['stroke-width'] > 0 && style['stroke-opacity'] > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(style['stroke-opacity'], 0, 1);
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style['stroke-width'];
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (this.showLabels) {
        this.paintLabel(ctx, { centroid: { x: p.x, y: p.y - r - 6 } }, style, featureName(feature));
      }
    }
  }

  /* --------------------------------------------------------------- label */

  paintLabel(ctx, geom, style, text) {
    if (!style.label || !style.label.show || !text || !geom.centroid) return;
    const size = style.label.size || 12;
    ctx.save();
    ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5, size * 0.28);
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.strokeText(text, geom.centroid.x, geom.centroid.y);
    ctx.fillStyle = style.label.color || readableOn('#ffffff');
    ctx.fillText(text, geom.centroid.x, geom.centroid.y);
    ctx.restore();
  }

  /* ------------- hover + selection decoration + edit handles ------------- */

  paintOverlay(ctx, view, m) {
    const store = this.store;
    if (!store.features.length) return;

    if (this.hoverId && !store.selection.has(this.hoverId)) {
      const feature = store.byId(this.hoverId);
      const geom = feature && this.geoms.get(feature.id);
      if (geom) {
        ctx.save();
        ctx.strokeStyle = withAlpha(ACCENT, 0.85);
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.stroke(geom.path);
        ctx.restore();
      }
    }

    for (const feature of store.features) {
      if (!store.selection.has(feature.id)) continue;
      const geom = this.geoms.get(feature.id);
      if (!geom) continue;

      ctx.save();
      // Halo so the outline reads on any basemap.
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.stroke(geom.path);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke(geom.path);
      ctx.restore();

      if (this.editVertices && store.selection.size === 1) this.paintHandles(ctx, geom);
    }
  }

  paintHandles(ctx, geom) {
    const handles = handlesOf(geom);
    ctx.save();
    // Midpoints (insert a vertex by dragging one).
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = withAlpha(ACCENT, 0.9);
    ctx.lineWidth = 1.5;
    for (const h of handles.midpoints) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Vertices.
    for (const v of handles.vertices) {
      ctx.beginPath();
      roundRect(ctx, v.x - HANDLE, v.y - HANDLE, HANDLE * 2, HANDLE * 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Vertex + midpoint handles in screen space. Shared by the renderer (drawing
 * them) and the select tool (grabbing them).
 */
export function handlesOf(geom) {
  const vertices = [];
  const midpoints = [];

  if (geom.type === 'Point' || geom.type === 'MultiPoint') {
    return { vertices: geom.points.slice(), midpoints, pairs: [] };
  }

  // Pair every projected ring with the coordinate array it came from, so a
  // dragged handle can write straight back into the geometry.
  const pairs = [];
  if (geom.lines.length) {
    geom.lines.forEach((pts, i) => pairs.push({ pts, source: geom.ringSources[i], closed: false }));
  } else if (geom.polygons.length) {
    let i = 0;
    for (const poly of geom.polygons) {
      for (const ring of poly) pairs.push({ pts: ring, source: geom.ringSources[i++], closed: true });
    }
  } else {
    geom.rings.forEach((pts, i) => pairs.push({ pts, source: geom.ringSources[i], closed: true }));
  }

  for (const { pts, source, closed } of pairs) {
    if (!source) continue;
    const count = closed ? pts.length - 1 : pts.length;   // skip the duplicate closing vertex
    for (let i = 0; i < count; i++) {
      vertices.push({ x: pts[i].x, y: pts[i].y, source, index: i, closed });
    }
    for (let i = 0; i < pts.length - 1; i++) {
      midpoints.push({
        x: (pts[i].x + pts[i + 1].x) / 2,
        y: (pts[i].y + pts[i + 1].y) / 2,
        source, index: i + 1, closed,
      });
    }
  }
  return { vertices, midpoints, pairs };
}

export { HIT_TOLERANCE, HANDLE };
