/**
 * MapView owns the canvas, the camera (centre + fractional zoom), pointer
 * gestures and the render loop. Everything is drawn in CSS-pixel space with a
 * single devicePixelRatio transform, which keeps hairlines crisp and image
 * fills at the display's real resolution.
 */

import { Emitter, clamp, easeInOut } from '../core/util.js';
import {
  cameraMatrix, projectWrapped, unprojectPoint, metersPerPixel,
  lngToUnitX, latToUnitY, unitXToLng, unitYToLat, TILE_SIZE, centerOfBBox, wrapLng,
} from '../core/geo.js';
import { TileLayer, PROVIDERS } from './tiles.js';

const BACKGROUNDS = { osm: '#e8ecf1', light: '#f2f4f7', dark: '#171c24', none: '#f4f6f8' };

export class MapView extends Emitter {
  constructor(canvas, { center = { lng: 15, lat: 30 }, zoom = 2.4, provider = 'osm' } = {}) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.camera = { center: { ...center }, zoom };
    this.minZoom = 0;
    this.maxZoom = 22;

    this.tiles = new TileLayer({ provider, onLoad: () => this.requestRender() });
    this.renderer = null;   // assigned by the app
    this.tool = null;       // active drawing/editing tool

    this._raf = 0;
    this._pointers = new Map();
    this._pan = null;
    this._pinch = null;
    this._anim = null;
    this._rect = null;
    this.hovered = null;

    this._bindCanvas();
    this._bindResize();
    this.resize();
  }

  /* ------------------------------------------------------------- viewport */

  _bindResize() {
    const target = this.canvas.parentElement || this.canvas;
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(target);
    }
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = clamp(window.devicePixelRatio || 1, 1, 3);

    if (w === this.width && h === this.height && dpr === this.dpr) { this._rect = null; return; }
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this._rect = null;
    this.requestRender();
    this.emit('resize', { w, h });
  }

  rect() {
    if (!this._rect) this._rect = this.canvas.getBoundingClientRect();
    return this._rect;
  }

  /* -------------------------------------------------------------- camera */

  matrix() { return cameraMatrix(this.camera, this.width, this.height); }

  project(lng, lat) {
    const m = this.matrix();
    return projectWrapped(m, lng, lat, this.camera.center.lng);
  }

  projectLngLat(lngLat) { return this.project(lngLat[0], lngLat[1]); }

  unproject(x, y) { return unprojectPoint(this.matrix(), x, y); }

  center() { return { ...this.camera.center }; }
  zoom() { return this.camera.zoom; }

  setZoom(zoom, anchor = null) {
    const next = clamp(zoom, this.minZoom, this.maxZoom);
    if (next === this.camera.zoom) return;
    const pt = anchor || { x: this.width / 2, y: this.height / 2 };
    const keep = this.unproject(pt.x, pt.y);
    this.camera.zoom = next;
    const after = this.project(keep.lng, keep.lat);
    this._shiftByPixels(pt.x - after.x, pt.y - after.y);
    this._changed('zoom');
  }

  zoomBy(delta, anchor = null) { this.setZoom(this.camera.zoom + delta, anchor); }
  zoomIn() { this.setZoom(this.camera.zoom + 1); }
  zoomOut() { this.setZoom(this.camera.zoom - 1); }

  setCenter(lngLat, reason = 'move') {
    this.camera.center = { lng: wrapLng(lngLat.lng), lat: clamp(lngLat.lat, -89.9, 89.9) };
    this._changed(reason);
  }

  setView(center, zoom, { animate = false, duration = 420 } = {}) {
    const target = {
      center: { lng: wrapLng(center.lng), lat: clamp(center.lat, -89.9, 89.9) },
      zoom: clamp(zoom === undefined ? this.camera.zoom : zoom, this.minZoom, this.maxZoom),
    };
    if (!animate) {
      this.camera = target;
      this._changed('view');
      return;
    }
    this._animateTo(target, duration);
  }

  _animateTo(target, duration) {
    const from = { center: { ...this.camera.center }, zoom: this.camera.zoom };
    const start = performance.now();
    const fromX = lngToUnitX(from.center.lng);
    const fromY = latToUnitY(from.center.lat);
    let toX = lngToUnitX(target.center.lng);
    const toY = latToUnitY(target.center.lat);
    // Take the short way round instead of spinning across the whole world.
    if (toX - fromX > 0.5) toX -= 1;
    else if (fromX - toX > 0.5) toX += 1;

    if (this._anim) cancelAnimationFrame(this._anim);
    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      const e = easeInOut(t);
      // Interpolate in linear world space so the path never bends near the poles.
      this.camera.center = {
        lng: wrapLng(unitXToLng(fromX + (toX - fromX) * e)),
        lat: unitYToLat(fromY + (toY - fromY) * e),
      };
      this.camera.zoom = from.zoom + (target.zoom - from.zoom) * e;
      this._changed('animate');
      this._anim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this._anim = requestAnimationFrame(step);
  }

  stopAnimation() {
    if (this._anim) { cancelAnimationFrame(this._anim); this._anim = 0; }
  }

  /** Fit a lng/lat bbox into the viewport. */
  fitBounds(bbox, { padding = 48, animate = true, maxZoom = 18 } = {}) {
    if (!bbox) return;
    const w = Math.max(1, this.width - padding * 2);
    const h = Math.max(1, this.height - padding * 2);

    const x0 = lngToUnitX(bbox.minLng);
    const x1 = lngToUnitX(bbox.maxLng);
    const y0 = latToUnitY(bbox.maxLat);
    const y1 = latToUnitY(bbox.minLat);
    const dx = Math.max(x1 - x0, 1e-9);
    const dy = Math.max(y1 - y0, 1e-9);

    const zoom = clamp(
      Math.log2(Math.min(w / (dx * TILE_SIZE), h / (dy * TILE_SIZE))),
      this.minZoom, Math.min(maxZoom, this.maxZoom),
    );
    const center = centerOfBBox({
      minLng: bbox.minLng, maxLng: bbox.maxLng, minLat: bbox.minLat, maxLat: bbox.maxLat,
    });
    // Mercator-correct vertical centring.
    center.lat = unitYToLat((y0 + y1) / 2);
    if (dx < 1e-8 && dy < 1e-8) {
      this.setView(center, Math.min(maxZoom, 15), { animate });
      return;
    }
    this.setView(center, zoom, { animate });
  }

  _shiftByPixels(dx, dy) {
    if (!dx && !dy) return;
    const m = this.matrix();
    const shifted = { ...m, ox: m.ox + dx, oy: m.oy + dy };
    const c = unprojectPoint(shifted, this.width / 2, this.height / 2);
    this.camera.center = { lng: wrapLng(c.lng), lat: clamp(c.lat, -89.9, 89.9) };
  }

  panByPixels(dx, dy) {
    this._shiftByPixels(dx, dy);
    this._changed('pan');
  }

  metersPerPixel(lat = this.camera.center.lat) {
    return metersPerPixel(this.camera.zoom, lat);
  }

  setBasemap(key) {
    this.tiles.setProvider(key);
    this._changed('basemap');
    this.emit('basemap', key);
  }

  get basemap() { return this.tiles.provider; }

  _changed(reason) {
    this.requestRender();
    this.emit('move', { reason, camera: this.camera });
  }

  /* -------------------------------------------------------------- render */

  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.draw();
    });
  }

  draw() {
    const ctx = this.ctx;
    const m = this.matrix();
    const { width: w, height: h } = this;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = BACKGROUNDS[this.tiles.provider] || '#eef1f5';
    ctx.fillRect(0, 0, w, h);

    this.tiles.draw(ctx, m, this.camera, w, h);
    if (this.tiles.provider === 'none') this._drawGraticule(ctx, m);

    if (this.renderer) this.renderer.draw(ctx, m, this);
    if (this.tool && this.tool.drawOverlay) this.tool.drawOverlay(ctx, m, this);

    this.emit('render', m);
  }

  /** Light coordinate grid so the map is still usable without a basemap. */
  _drawGraticule(ctx, m) {
    const step = this.camera.zoom < 2 ? 30 : this.camera.zoom < 4 ? 15 : this.camera.zoom < 7 ? 5 : 1;
    ctx.save();
    ctx.strokeStyle = 'rgba(20,30,45,.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lng = -180; lng <= 180; lng += step) {
      const p = this.project(lng, 0);
      ctx.moveTo(Math.round(p.x) + 0.5, 0);
      ctx.lineTo(Math.round(p.x) + 0.5, this.height);
    }
    for (let lat = -80; lat <= 80; lat += step) {
      const p = this.project(0, lat);
      ctx.moveTo(0, Math.round(p.y) + 0.5);
      ctx.lineTo(this.width, Math.round(p.y) + 0.5);
    }
    ctx.stroke();
    // Equator + prime meridian slightly stronger.
    ctx.strokeStyle = 'rgba(20,30,45,.25)';
    ctx.beginPath();
    const eq = this.project(0, 0);
    ctx.moveTo(0, Math.round(eq.y) + 0.5);
    ctx.lineTo(this.width, Math.round(eq.y) + 0.5);
    ctx.moveTo(Math.round(eq.x) + 0.5, 0);
    ctx.lineTo(Math.round(eq.x) + 0.5, this.height);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------ pointers */

  _bindCanvas() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this._onPointerDown);
    c.addEventListener('pointermove', this._onPointerMove);
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerUp);
    c.addEventListener('pointerleave', this._onPointerLeave);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    c.addEventListener('dblclick', this._onDblClick);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  point(e) {
    const r = this.rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  eventPayload(e) {
    const p = this.point(e);
    const lngLat = this.unproject(p.x, p.y);
    return {
      ...p,
      lngLat,
      originalEvent: e,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
      button: e.button,
      pointerId: e.pointerId,
    };
  }

  _onPointerDown = (e) => {
    this._rect = null;
    this.stopAnimation();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.point(e);
    this._pointers.set(e.pointerId, p);

    if (this._pointers.size === 2) {
      this._pan = null;
      const [a, b] = [...this._pointers.values()];
      this._pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }

    const payload = this.eventPayload(e);
    const handled = this.tool && this.tool.onPointerDown ? this.tool.onPointerDown(payload) === true : false;
    if (handled) return;

    if (e.button === 0 || e.button === 1) {
      this._pan = { last: p, moved: false, payload };
      this.canvas.classList.add('panning');
    }
  };

  _onPointerMove = (e) => {
    const p = this.point(e);
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, p);

    if (this._pinch && this._pointers.size >= 2) {
      const [a, b] = [...this._pointers.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = dist / this._pinch.dist;
      this.setZoom(this.camera.zoom + Math.log2(ratio), mid);
      this.panByPixels(mid.x - this._pinch.mid.x, mid.y - this._pinch.mid.y);
      this._pinch = { dist, mid };
      return;
    }

    if (this._pan) {
      const dx = p.x - this._pan.last.x;
      const dy = p.y - this._pan.last.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        this._pan.moved = true;
        this._pan.last = p;
        this.panByPixels(dx, dy);
      }
      return;
    }

    const payload = this.eventPayload(e);
    this.emit('hover', payload);
    if (this.tool && this.tool.onPointerMove) this.tool.onPointerMove(payload);
  };

  _onPointerUp = (e) => {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
    this.canvas.releasePointerCapture?.(e.pointerId);

    if (this._pan) {
      const moved = this._pan.moved;
      const payload = this._pan.payload;
      this._pan = null;
      this.canvas.classList.remove('panning');
      if (!moved && payload) {
        const up = this.eventPayload(e);
        if (this.tool && this.tool.onClick) this.tool.onClick(up);
        this.emit('click', up);
      }
      return;
    }
    if (this.tool && this.tool.onPointerUp) this.tool.onPointerUp(this.eventPayload(e));
  };

  _onPointerLeave = () => {
    this.hovered = null;
    if (this.tool && this.tool.onPointerLeave) this.tool.onPointerLeave();
    this.requestRender();
    this.emit('hover', null);
  };

  _onWheel = (e) => {
    e.preventDefault();
    this.stopAnimation();
    const p = this.point(e);
    let unit = e.deltaY;
    if (e.deltaMode === 1) unit *= 16;          // lines
    else if (e.deltaMode === 2) unit *= this.height;  // pages
    const factor = e.ctrlKey ? 0.008 : 0.0022;   // ctrl = trackpad pinch
    const delta = clamp(-unit * factor, -1.2, 1.2);
    this.setZoom(this.camera.zoom + delta, p);
  };

  _onDblClick = (e) => {
    e.preventDefault();
    const payload = this.eventPayload(e);
    const handled = this.tool && this.tool.onDoubleClick ? this.tool.onDoubleClick(payload) === true : false;
    if (handled) return;
    this.setZoom(this.camera.zoom + 1, this.point(e));
  };

  /** Keyboard shortcuts that belong to the map itself. */
  onKeyDown(e) {
    const step = 60;
    switch (e.key) {
      case '+': case '=': this.zoomIn(); return true;
      case '-': case '_': this.zoomOut(); return true;
      case 'ArrowLeft': this.panByPixels(step, 0); return true;
      case 'ArrowRight': this.panByPixels(-step, 0); return true;
      case 'ArrowUp': this.panByPixels(0, step); return true;
      case 'ArrowDown': this.panByPixels(0, -step); return true;
      default: return false;
    }
  }

  isPanning() { return !!this._pan; }
}

export { PROVIDERS };
