// Live image overlay for the Animate preview. The same morph ring used by the
// vector ghost is used as the optional clip, so the preview and exported mask
// stay in lockstep while the image follows each region's changing bounds.
import L from 'leaflet';

const clamp = (value, lo, hi, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function boundsOf(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring || []) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: Math.max(0.01, maxX - minX),
    height: Math.max(0.01, maxY - minY),
  };
}

function screenDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const MorphFlagPreviewLayer = L.Layer.extend({
  initialize(plan, image) {
    this._plan = plan;
    this._image = image;
    this._frames = [];
    this._settings = {};
  },

  onAdd(map) {
    this._map = map;
    let pane = map.getPane('morph-flag-preview');
    if (!pane) pane = map.createPane('morph-flag-preview');
    pane.style.zIndex = '650';
    pane.style.pointerEvents = 'none';
    this._canvas = L.DomUtil.create('canvas', 'morph-flag-preview-canvas', pane);
    this._canvas.style.position = 'absolute';
    this._canvas.style.pointerEvents = 'none';
    this._context = this._canvas.getContext('2d');
    map.on('move zoom resize viewreset', this._reset, this);
    this._reset();
  },

  onRemove(map) {
    map.off('move zoom resize viewreset', this._reset, this);
    if (this._canvas) L.DomUtil.remove(this._canvas);
    this._canvas = null;
    this._context = null;
    this._map = null;
  },

  setFrames(frames, settings) {
    this._frames = frames || [];
    this._settings = settings || {};
    this._redraw();
  },

  _reset() {
    if (!this._map || !this._canvas) return;
    const size = this._map.getSize();
    if (!size || size.x <= 0 || size.y <= 0) return;
    const dpr = Math.max(1, Number(globalThis.devicePixelRatio) || 1);
    const width = Math.max(1, Math.round(size.x * dpr));
    const height = Math.max(1, Math.round(size.y * dpr));
    if (this._canvas.width !== width) this._canvas.width = width;
    if (this._canvas.height !== height) this._canvas.height = height;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    this._dpr = dpr;
    this._size = size;
    this._origin = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, this._origin);
    this._redraw();
  },

  _redraw() {
    const map = this._map;
    const ctx = this._context;
    const image = this._image;
    if (!map || !ctx || !this._canvas || !this._size || !image || image.complete === false) return;
    const { x: width, y: height } = this._size;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!this._plan?.proj) return;

    const toLocal = ([x, y]) => {
      const ll = this._plan.proj.unproject(x, y);
      const point = map.latLngToLayerPoint(L.latLng(ll.lat, ll.lng)).subtract(this._origin);
      return { x: point.x, y: point.y };
    };
    const settings = this._settings;
    const scaleFrom = clamp(settings.scaleFrom, 10, 500, 100) / 100;
    const scaleTo = clamp(settings.scaleTo, 10, 500, 100) / 100;
    const offsetXFrom = clamp(settings.offsetXFrom, -100, 100, 0) / 100;
    const offsetXTo = clamp(settings.offsetXTo, -100, 100, 0) / 100;
    const offsetYFrom = clamp(settings.offsetYFrom, -100, 100, 0) / 100;
    const offsetYTo = clamp(settings.offsetYTo, -100, 100, 0) / 100;
    const rotationFrom = clamp(settings.rotationFrom, -360, 360, 0);
    const rotationTo = clamp(settings.rotationTo, -360, 360, 0);

    for (const frame of this._frames) {
      const ring = frame?.ring;
      if (!ring || ring.length < 3) continue;
      const u = Math.max(0, Math.min(1, Number(frame.u) || 0));
      const box = boundsOf(ring);
      const scale = scaleFrom + (scaleTo - scaleFrom) * u;
      const offsetX = offsetXFrom + (offsetXTo - offsetXFrom) * u;
      const offsetY = offsetYFrom + (offsetYTo - offsetYFrom) * u;
      const rotationDelta = ((rotationTo - rotationFrom + 540) % 360) - 180;
      const rotation = rotationFrom + rotationDelta * u;
      const center = [box.x + box.width * offsetX, box.y + box.height * offsetY];
      const centerPx = toLocal(center);
      const xEdge = toLocal([box.x + box.width / 2, box.y]);
      const yEdge = toLocal([box.x, box.y + box.height / 2]);
      const pixelsPerUnitX = screenDistance(toLocal([box.x + 1, box.y]), toLocal([box.x, box.y]));
      const pixelsPerUnitY = screenDistance(toLocal([box.x, box.y + 1]), toLocal([box.x, box.y]));
      const drawWidth = Math.max(1, screenDistance(xEdge, toLocal([box.x - box.width / 2, box.y])) * scale);
      const drawHeight = Math.max(1, screenDistance(yEdge, toLocal([box.x, box.y - box.height / 2])) * scale);
      // The edge samples above preserve Mercator's local scale. This fallback
      // handles zero-size map fixtures without turning the preview into NaN.
      const finalWidth = Number.isFinite(drawWidth) ? drawWidth : box.width * pixelsPerUnitX * scale;
      const finalHeight = Number.isFinite(drawHeight) ? drawHeight : box.height * pixelsPerUnitY * scale;

      ctx.save();
      if (settings.masked !== false) {
        ctx.beginPath();
        ring.forEach((point, index) => {
          const p = toLocal(point);
          if (index === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.clip();
      }
      ctx.translate(centerPx.x, centerPx.y);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(image, -finalWidth / 2, -finalHeight / 2, finalWidth, finalHeight);
      ctx.restore();
    }
  },
});
