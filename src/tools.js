/**
 * Pointer tools: select/edit plus the drawing tools.
 *
 * A tool receives normalised pointer payloads from MapView
 * ({x, y, lngLat, shift, alt, ctrl, button}) and returns `true` from
 * onPointerDown when it wants to own the gesture (the map then does not pan).
 */

import { clamp } from './core/util.js';
import { rectPositions, lineLength, polygonArea, orientRings } from './core/geo.js';
import { styleOf } from './core/geojson.js';
import { shiftGeometry } from './core/store.js';
import { handlesOf, hitTest } from './render/renderer.js';

const HANDLE_HIT = 10;
const MIN_SHAPE_PX = 4;      // ignore accidental micro-shapes
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const fmtLen = (m) => (m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);
const fmtArea = (m) => (m < 1e6 ? `${m.toFixed(0)} m²` : m < 1e8 ? `${(m / 1e4).toFixed(2)} ha` : `${(m / 1e6).toFixed(1)} km²`);

export class BaseTool {
  constructor(host) {
    this.host = host;                 // { view, store, renderer, manager }
    this.name = 'base';
    this.hint = '';
    this.cursor = '';
  }

  get view() { return this.host.view; }
  get store() { return this.host.store; }
  get renderer() { return this.host.renderer; }

  activate() { this.view.requestRender(); }
  deactivate() { this.view.requestRender(); }
  onPointerDown() { return false; }
  onPointerMove() {}
  onPointerUp() {}
  onClick() {}
  onDoubleClick() { return false; }
  onPointerLeave() {}
  onKeyDown() { return false; }
  drawOverlay() {}

  setCursor(name) {
    const c = this.view.canvas;
    c.classList.toggle('crosshair', name === 'crosshair');
    c.classList.toggle('pointing', name === 'pointer');
  }
}

/* ------------------------------------------------------------------ select */

export class SelectTool extends BaseTool {
  constructor(host) {
    super(host);
    this.name = 'select';
    this.hint = 'Click a shape to select it · drag vertices to reshape · drag a shape to move it';
    this.drag = null;
    this.marquee = null;
    this.hoverHandle = null;
  }

  activate() {
    super.activate();
    this.renderer.editVertices = true;
    this.setCursor('');
  }

  deactivate() {
    this.drag = null;
    this.marquee = null;
    this.hoverHandle = null;
    this.renderer.hoverId = null;
    super.deactivate();
  }

  /* ------------------------------------------------------------ picking */

  featureAt(pt) {
    const features = this.store.features;
    for (let i = features.length - 1; i >= 0; i--) {
      const feature = features[i];
      const geom = this.renderer.geomFor(feature.id);
      if (geom && hitTest(geom, styleOf(feature), pt)) return feature;
    }
    return null;
  }

  handleAt(pt) {
    if (this.store.selection.size !== 1) return null;
    const feature = this.store.selectedFeatures()[0];
    const geom = this.renderer.geomFor(feature.id);
    if (!geom) return null;

    if (geom.type === 'Point' || geom.type === 'MultiPoint') {
      const index = geom.points.findIndex((p) => dist(p, pt) <= HANDLE_HIT);
      if (index >= 0) return { kind: 'point', feature, geom, index };
      return null;
    }

    const handles = handlesOf(geom);
    for (const v of handles.vertices) {
      if (dist(v, pt) <= HANDLE_HIT) return { kind: 'vertex', feature, geom, handle: v };
    }
    for (const m of handles.midpoints) {
      if (dist(m, pt) <= HANDLE_HIT) return { kind: 'midpoint', feature, geom, handle: m };
    }
    return null;
  }

  /* -------------------------------------------------------------- gestures */

  onPointerDown(e) {
    if (e.button !== 0) return false;
    const pt = { x: e.x, y: e.y };

    const handle = this.handleAt(pt);
    if (handle) {
      if (handle.kind === 'midpoint') {
        // Dragging an edge midpoint inserts a vertex there.
        this.store.beginHistory('vertex');
        handle.handle.source.splice(handle.handle.index, 0, [e.lngLat.lng, e.lngLat.lat]);
        this.drag = {
          kind: 'vertex',
          feature: handle.feature,
          source: handle.handle.source,
          index: handle.handle.index,
          closed: handle.handle.closed,
          moved: true,
        };
      } else if (handle.kind === 'vertex') {
        this.drag = {
          kind: 'vertex',
          feature: handle.feature,
          source: handle.handle.source,
          index: handle.handle.index,
          closed: handle.handle.closed,
          moved: false,
          recorded: false,
        };
      } else {
        this.drag = { kind: 'point', feature: handle.feature, index: handle.index, moved: false, recorded: false };
      }
      this.view.requestRender();
      return true;
    }

    const feature = this.featureAt(pt);
    if (feature) {
      if (e.shift) {
        this.store.toggleSelect(feature.id);
        return true;
      }
      if (!this.store.selection.has(feature.id)) this.store.select(feature.id);
      const selected = this.store.selectedFeatures();
      this.drag = {
        kind: 'move',
        start: { ...e.lngLat },
        originals: selected.map((f) => ({ f, coords: clone(f.geometry.coordinates) })),
        moved: false,
        recorded: false,
      };
      return true;
    }

    if (e.shift) {
      this.marquee = { start: pt, end: pt };
      return true;
    }
    return false;   // empty space → the map pans
  }

  onPointerMove(e) {
    const pt = { x: e.x, y: e.y };

    if (this.marquee) {
      this.marquee.end = pt;
      this.view.requestRender();
      return;
    }

    if (!this.drag) {
      const handle = this.handleAt(pt);
      this.hoverHandle = handle;
      const feature = handle ? handle.feature : this.featureAt(pt);
      const id = feature ? feature.id : null;
      if (id !== this.renderer.hoverId) {
        this.renderer.hoverId = id;
        this.view.requestRender();
      }
      this.setCursor(handle || feature ? 'pointer' : '');
      return;
    }

    const { lng, lat } = e.lngLat;
    this.recordOnce();
    if (this.drag.kind === 'move') {
      const dLng = lng - this.drag.start.lng;
      const dLat = lat - this.drag.start.lat;
      if (dLng || dLat) this.drag.moved = true;
      this.store.applyLive(() => {
        for (const item of this.drag.originals) {
          item.f.geometry.coordinates = clone(item.coords);
          shiftGeometry(item.f.geometry, dLng, dLat);
        }
      }, 'move');
    } else if (this.drag.kind === 'vertex') {
      this.drag.moved = true;
      const source = this.drag.source;
      const i = this.drag.index;
      this.store.applyLive(() => {
        source[i] = [lng, lat];
        if (this.drag.closed && i === 0 && source.length > 1) source[source.length - 1] = [lng, lat];
        if (this.drag.closed && i === source.length - 2 && source.length > 2) source[source.length - 1] = [lng, lat];
      }, 'vertex');
    } else if (this.drag.kind === 'point') {
      this.drag.moved = true;
      const feature = this.drag.feature;
      this.store.applyLive(() => {
        if (feature.geometry.type === 'Point') feature.geometry.coordinates = [lng, lat];
        else feature.geometry.coordinates[this.drag.index] = [lng, lat];
      }, 'vertex');
    }
  }

  /** One undo step per gesture, recorded the first time something really moves. */
  recordOnce() {
    if (!this.drag || this.drag.recorded) return;
    this.drag.recorded = true;
    this.store.beginHistory(this.drag.kind === 'move' ? 'move' : 'vertex');
  }

  onPointerUp(e) {
    if (this.marquee) {
      const ids = this.featuresInMarquee(this.marquee.start, this.marquee.end);
      this.marquee = null;
      if (ids.length) this.store.select(ids, { additive: e.shift });
      else if (!e.shift) this.store.clearSelection();
      this.view.requestRender();
      return;
    }
    if (!this.drag) return;
    const wasVertexEdit = this.drag.kind !== 'move' && this.drag.moved;
    this.drag = null;
    if (wasVertexEdit) {
      // Editing can flip a ring's winding; restore it so holes stay holes.
      this.store.applyLive(() => {
        for (const f of this.store.selectedFeatures()) orientRings(f.geometry);
      }, 'orient');
    }
    this.view.requestRender();
  }

  onPointerLeave() {
    this.renderer.hoverId = null;
    this.hoverHandle = null;
    this.view.requestRender();
  }

  onClick(e) {
    // Reached only when the map did not pan and no feature was hit.
    if (!e.shift) this.store.clearSelection();
  }

  featuresInMarquee(a, b) {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    const ids = [];
    for (const feature of this.store.features) {
      const geom = this.renderer.geomFor(feature.id);
      if (!geom || !isFinite(geom.bbox.minX)) continue;
      const bb = geom.bbox;
      if (bb.maxX < minX || bb.minX > maxX || bb.maxY < minY || bb.minY > maxY) continue;
      ids.push(feature.id);
    }
    return ids;
  }

  /** Remove the vertex under the cursor, or the selection when there is none. */
  deleteAtCursor(pt) {
    const handle = pt ? this.handleAt(pt) : this.hoverHandle;
    if (handle && (handle.kind === 'vertex')) {
      const source = handle.handle.source;
      const min = handle.handle.closed ? 4 : 2;
      const realCount = handle.handle.closed ? source.length - 1 : source.length;
      if (realCount <= min) return false;
      this.store.mutate('vertex', () => { source.splice(handle.handle.index, 1); });
      return true;
    }
    return false;
  }

  nudge(dLng, dLat) {
    const selected = this.store.selectedFeatures();
    if (!selected.length) return false;
    this.store.mutate('nudge', () => {
      for (const f of selected) shiftGeometry(f.geometry, dLng, dLat);
    });
    return true;
  }

  drawOverlay(ctx) {
    if (!this.marquee) return;
    const { start, end } = this.marquee;
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    ctx.save();
    ctx.fillStyle = 'rgba(47,109,246,.14)';
    ctx.strokeStyle = '#2f6df6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();
  }
}

/* ------------------------------------------------------------ shape tools */

class ShapeTool extends BaseTool {
  constructor(host) {
    super(host);
    this.positions = [];
    this.cursor = null;
    this.cursorVisible = false;
  }

  activate() {
    super.activate();
    this.renderer.editVertices = false;
    this.renderer.hoverId = null;
    this.setCursor('crosshair');
  }

  deactivate() {
    this.reset();
    this.renderer.editVertices = true;
    super.deactivate();
  }

  reset() {
    this.positions = [];
    this.cursor = null;
    this.cursorVisible = false;
  }

  onPointerMove(e) {
    this.cursor = e.lngLat;
    this.cursorVisible = true;
    this.view.requestRender();
  }

  onPointerLeave() {
    this.cursorVisible = false;
    this.view.requestRender();
  }

  onClick(e) {
    const pos = [e.lngLat.lng, e.lngLat.lat];
    if (this.positions.length) {
      const last = this.positions[this.positions.length - 1];
      const a = this.view.project(last[0], last[1]);
      const b = this.view.project(pos[0], pos[1]);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2) return;   // double-add guard
    }
    if (this.canCloseOnClick && this.positions.length >= 3) {
      const first = this.view.project(this.positions[0][0], this.positions[0][1]);
      const here = this.view.project(pos[0], pos[1]);
      if (Math.hypot(first.x - here.x, first.y - here.y) <= HANDLE_HIT) {
        this.finish();
        return;
      }
    }
    this.positions.push(pos);
    this.view.requestRender();
    this.host.manager.updateHint();
  }

  onDoubleClick() {
    this.finish();
    return true;    // never let the map zoom while drawing
  }

  onKeyDown(e) {
    if (e.key === 'Enter') { this.finish(); return true; }
    if (e.key === 'Escape') {
      if (this.positions.length) { this.reset(); this.view.requestRender(); this.host.manager.updateHint(); return true; }
      return false;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (this.positions.length) {
        this.positions.pop();
        this.view.requestRender();
        this.host.manager.updateHint();
        return true;
      }
      return false;
    }
    return false;
  }

  minPositions() { return 2; }

  finish() {
    const geometry = this.buildGeometry();
    this.reset();
    this.view.requestRender();
    this.host.manager.updateHint();
    if (!geometry) return false;
    const feature = this.store.addGeometry(geometry);
    this.host.manager.afterCreate(feature);
    return true;
  }

  buildGeometry() { return null; }

  /* ------------------------------------------------------------- preview */

  projectAll() {
    return this.positions.map((p) => this.view.project(p[0], p[1]));
  }

  strokePreview(ctx, points, style, closed) {
    if (points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (closed) ctx.closePath();

    if (closed && style['fill-opacity'] > 0 && style['fill-mode'] === 'solid') {
      ctx.globalAlpha = clamp(style['fill-opacity'], 0, 1) * 0.75;
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    ctx.globalAlpha = clamp(style['stroke-opacity'], 0, 1);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(1.5, style['stroke-width']);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
  }

  drawDots(ctx, points) {
    ctx.save();
    for (let i = 0; i < points.length; i++) {
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, i === 0 ? 5 : 3.6, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#ffffff' : '#2f6df6';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2f6df6';
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBadge(ctx, text, at) {
    if (!text || !at) return;
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 14;
    const x = clamp(at.x + 12, 4, this.view.width - w - 4);
    const y = clamp(at.y - 26, 4, this.view.height - 26);
    ctx.fillStyle = 'rgba(20,26,36,.9)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, 20, 6) : ctx.rect(x, y, w, 20);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 7, y + 10.5);
    ctx.restore();
  }
}

export class LineTool extends ShapeTool {
  constructor(host) {
    super(host);
    this.name = 'line';
    this.hint = 'Click to add points · double-click or Enter to finish · Esc cancels';
  }

  buildGeometry() {
    if (this.positions.length < 2) return null;
    return { type: 'LineString', coordinates: this.positions.map((p) => [p[0], p[1]]) };
  }

  drawOverlay(ctx) {
    const style = this.store.defaultStyle;
    const points = this.projectAll();
    const live = this.cursorVisible && this.cursor ? this.view.project(this.cursor.lng, this.cursor.lat) : null;
    const all = live ? [...points, live] : points;
    this.strokePreview(ctx, all, style, false);
    this.drawDots(ctx, points);
    if (live && points.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(47,109,246,.55)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(live.x, live.y);
      ctx.stroke();
      ctx.restore();
    }
    if (points.length) {
      const metres = lineLength([...this.positions, ...(this.cursorVisible && this.cursor ? [[this.cursor.lng, this.cursor.lat]] : [])]);
      this.drawBadge(ctx, `${points.length} pt${points.length > 1 ? 's' : ''} · ${fmtLen(metres)}`, live || points[points.length - 1]);
    }
  }
}

export class PolygonTool extends ShapeTool {
  constructor(host) {
    super(host);
    this.name = 'polygon';
    this.hint = 'Click to add corners · click the first dot, double-click or Enter to close · Esc cancels';
    this.canCloseOnClick = true;
  }

  minPositions() { return 3; }

  buildGeometry() {
    if (this.positions.length < 3) return null;
    const ring = this.positions.map((p) => [p[0], p[1]]);
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    return { type: 'Polygon', coordinates: [ring] };
  }

  drawOverlay(ctx) {
    const style = this.store.defaultStyle;
    const points = this.projectAll();
    const live = this.cursorVisible && this.cursor ? this.view.project(this.cursor.lng, this.cursor.lat) : null;
    const all = live ? [...points, live] : points;
    this.strokePreview(ctx, all, style, points.length >= 2);
    this.drawDots(ctx, points);
    if (live && points.length >= 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(47,109,246,.5)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(live.x, live.y);
      ctx.lineTo(points[0].x, points[0].y);
      ctx.stroke();
      ctx.restore();
    }
    if (points.length) {
      const positions = [...this.positions, ...(this.cursorVisible && this.cursor ? [[this.cursor.lng, this.cursor.lat]] : [])];
      let text = `${points.length} corner${points.length > 1 ? 's' : ''}`;
      if (positions.length >= 3) {
        const ring = positions.map((p) => [p[0], p[1]]);
        ring.push([ring[0][0], ring[0][1]]);
        text += ` · ${fmtArea(polygonArea([ring]))}`;
      } else if (positions.length === 2) {
        text += ` · ${fmtLen(lineLength(positions))}`;
      }
      this.drawBadge(ctx, text, live || points[points.length - 1]);
    }
  }
}

export class RectTool extends BaseTool {
  constructor(host) {
    super(host);
    this.name = 'rect';
    this.hint = 'Drag out a rectangle';
    this.start = null;
    this.current = null;
    this.drawing = false;
  }

  activate() {
    super.activate();
    this.renderer.editVertices = false;
    this.renderer.hoverId = null;
    this.setCursor('crosshair');
  }

  deactivate() {
    this.start = this.current = null;
    this.drawing = false;
    this.renderer.editVertices = true;
    super.deactivate();
  }

  onPointerDown(e) {
    if (e.button !== 0) return false;
    this.start = { ...e.lngLat };
    this.current = { ...e.lngLat };
    this.drawing = true;
    this.view.requestRender();
    return true;
  }

  onPointerMove(e) {
    if (!this.drawing) return;
    this.current = { ...e.lngLat };
    this.view.requestRender();
  }

  onPointerUp(e) {
    if (!this.drawing) return;
    this.drawing = false;
    const a = this.start, b = e.lngLat;
    this.start = this.current = null;
    this.view.requestRender();
    if (!a || !b) return;
    const pa = this.view.project(a.lng, a.lat);
    const pb = this.view.project(b.lng, b.lat);
    if (Math.abs(pa.x - pb.x) < MIN_SHAPE_PX && Math.abs(pa.y - pb.y) < MIN_SHAPE_PX) {
      // Treat a click as a tiny square around the cursor rather than nothing.
      const mpp = this.view.metersPerPixel(a.lat);
      const d = (40 * mpp) / 111320;   // ~40 px worth of degrees
      const geometry = { type: 'Polygon', coordinates: rectPositions({ lng: a.lng - d, lat: a.lat - d }, { lng: a.lng + d, lat: a.lat + d }) };
      this.host.manager.afterCreate(this.store.addGeometry(geometry));
      return;
    }
    const geometry = { type: 'Polygon', coordinates: rectPositions(a, b) };
    this.host.manager.afterCreate(this.store.addGeometry(geometry));
  }

  drawOverlay(ctx) {
    if (!this.drawing || !this.start || !this.current) return;
    const a = this.view.project(this.start.lng, this.start.lat);
    const b = this.view.project(this.current.lng, this.current.lat);
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    const style = this.store.defaultStyle;

    ctx.save();
    if (style['fill-opacity'] > 0 && style['fill-mode'] === 'solid') {
      ctx.globalAlpha = clamp(style['fill-opacity'], 0, 1) * 0.75;
      ctx.fillStyle = style.fill;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = clamp(style['stroke-opacity'], 0, 1);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(1.5, style['stroke-width']);
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();

    const area = polygonArea(rectPositions(this.start, this.current));
    const text = `${fmtLen(Math.abs(this.current.lng - this.start.lng) * 111320 * Math.cos(this.start.lat * Math.PI / 180))} × ${fmtLen(Math.abs(this.current.lat - this.start.lat) * 110540)} · ${fmtArea(area)}`;
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 14;
    const bx = clamp(x + w + 8, 4, this.view.width - tw - 4);
    const by = clamp(y + h + 8, 4, this.view.height - 26);
    ctx.fillStyle = 'rgba(20,26,36,.9)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, tw, 20, 6) : ctx.rect(bx, by, tw, 20);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 7, by + 10.5);
    ctx.restore();
  }
}

export class PointTool extends BaseTool {
  constructor(host) {
    super(host);
    this.name = 'point';
    this.hint = 'Click to drop a point';
  }

  activate() {
    super.activate();
    this.renderer.editVertices = false;
    this.renderer.hoverId = null;
    this.setCursor('crosshair');
  }

  deactivate() {
    this.renderer.editVertices = true;
    super.deactivate();
  }

  onClick(e) {
    const geometry = { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] };
    this.host.manager.afterCreate(this.store.addGeometry(geometry));
  }
}

/* --------------------------------------------------------------- manager */

export const TOOL_ORDER = ['select', 'point', 'line', 'polygon', 'rect'];

export class ToolManager {
  constructor({ view, store, renderer, onHint = () => {}, onTool = () => {}, onCreate = () => {} }) {
    this.view = view;
    this.store = store;
    this.renderer = renderer;
    this.onHint = onHint;
    this.onTool = onTool;
    this.onCreate = onCreate;

    const host = { view, store, renderer, manager: this };
    this.tools = {
      select: new SelectTool(host),
      point: new PointTool(host),
      line: new LineTool(host),
      polygon: new PolygonTool(host),
      rect: new RectTool(host),
    };
    this.current = null;
    this.set('select');
  }

  get tool() { return this.current; }
  get name() { return this.current ? this.current.name : 'select'; }

  set(name) {
    const next = this.tools[name];
    if (!next || next === this.current) return;
    if (this.current) this.current.deactivate();
    this.current = next;
    this.view.tool = next;
    next.activate();
    this.updateHint();
    this.onTool(name);
  }

  updateHint() {
    const tool = this.current;
    if (!tool) return;
    let text = tool.hint;
    if (tool instanceof ShapeTool && tool.positions.length) {
      text = `${tool.positions.length} placed · ${tool.hint}`;
    }
    this.onHint(text);
  }

  hideHint() { this.onHint(''); }

  afterCreate(feature) {
    this.onCreate(feature);
  }

  /** Global keyboard handling for tools. Returns true when consumed. */
  onKeyDown(e) {
    const key = e.key;
    const lower = key.toLowerCase();
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const shortcut = { v: 'select', p: 'point', l: 'line', g: 'polygon', r: 'rect' }[lower];
      if (shortcut) { this.set(shortcut); return true; }
    }
    if (this.current && this.current.onKeyDown(e)) return true;

    if (key === 'Delete' || key === 'Backspace') {
      const select = this.tools.select;
      if (this.name === 'select' && select.deleteAtCursor()) return true;
      if (this.store.selection.size) { this.store.removeSelected(); return true; }
      return false;
    }
    if (key === 'Escape') {
      if (this.store.selection.size) { this.store.clearSelection(); return true; }
      return false;
    }
    if (key.startsWith('Arrow') && this.name === 'select' && this.store.selection.size) {
      const step = (e.shiftKey ? 10 : 1) * this.view.metersPerPixel() / 111320;
      const d = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
      }[key];
      const lngStep = d[0] / Math.max(0.2, Math.cos(this.view.camera.center.lat * Math.PI / 180));
      if (select.nudge(lngStep, d[1])) return true;
    }
    if ((e.ctrlKey || e.metaKey) && lower === 'a') {
      this.store.select(this.store.features.map((f) => f.id));
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && lower === 'd') {
      if (this.store.selection.size) { this.store.duplicateSelected(); return true; }
    }
    return false;
  }
}

