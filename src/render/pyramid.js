/**
 * Image fills are painted from a resolution pyramid (a "mipmap" chain) instead
 * of a single bitmap.
 *
 * Why that matters — the classic two-sided artefact this replaces:
 *
 *   • Zoom far out  → the pattern is drawn at a few pixels wide. A single
 *     bitmap gets point/bilinear-sampled, most of its texels are skipped and
 *     thin or semi-transparent artwork washes out into a pale, faint smear.
 *     With a pyramid we pick the level whose texel size is ≈ one screen pixel,
 *     so the shape fills with an even, correctly-weighted colour (at the very
 *     smallest sizes we paint the pyramid's precomputed average colour, which
 *     is exactly what the pattern converges to).
 *
 *   • Zoom far in   → the same bitmap gets magnified into coarse, soft blocks.
 *     We pick the base level and, with `noUpscale`, stop magnifying past the
 *     image's own resolution instead of inventing pixels.
 *
 * Everything is drawn in device pixels (CSS px × devicePixelRatio), so fills
 * stay sharp on high-density displays too.
 */

const MAX_TEXTURE = 2048;     // widest edge kept at pyramid level 0
const MAX_LEVELS = 12;

/** Half-size repeatedly, with high-quality resampling at every step. */
function downscale(source, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function buildPyramid(img) {
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  if (!natW || !natH) return null;

  const cap = Math.min(1, MAX_TEXTURE / Math.max(natW, natH));
  let w = natW * cap;
  let h = natH * cap;

  const levels = [];
  levels.push(cap < 1 ? downscale(img, w, h) : img);
  while ((w > 1 || h > 1) && levels.length < MAX_LEVELS) {
    const prev = levels[levels.length - 1];
    w = Math.max(1, w / 2);
    h = Math.max(1, h / 2);
    levels.push(downscale(prev, w, h));
  }

  return {
    levels,
    base: { w: levels[0].width || natW, h: levels[0].height || natH },
    aspect: natH / natW,
    natural: { w: natW, h: natH },
    avg: averageColor(levels[levels.length - 1]),
    patterns: new WeakMap(),   // ctx -> Map(level -> CanvasPattern)
  };
}

/** Mean colour of a (tiny) pyramid level; null if the canvas is tainted. */
function averageColor(canvas) {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return null;
    const { data } = ctx.getImageData(0, 0, w, h);
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
    }
    const n = data.length / 4;
    return { r: r / n, g: g / n, b: b / n, a: a / n / 255 };
  } catch {
    return null;   // cross-origin image without CORS: fine, just no average
  }
}

export function rgbaString(c, alpha = 1) {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${(c.a ?? 1) * alpha})`;
}

/**
 * Choose the pyramid level whose texels best match the on-screen size.
 *
 * @param {object} pyramid
 * @param {number} sizeCssPx   target width of the image in CSS pixels
 * @param {number} dpr         devicePixelRatio of the output canvas
 * @returns {{level:number, canvas:*, devicePx:number}}
 */
export function pickLevel(pyramid, sizeCssPx, dpr = 1) {
  const levels = pyramid.levels;
  const target = Math.max(0.5, sizeCssPx * dpr);
  const ideal = Math.log2(pyramid.base.w / target);
  const level = Math.max(0, Math.min(levels.length - 1, Math.round(ideal)));
  return { level, canvas: levels[level], devicePx: target };
}

/** Repeat pattern for a pyramid level, cached per rendering context. */
export function patternFor(ctx, pyramid, level) {
  let byLevel = pyramid.patterns.get(ctx);
  if (!byLevel) {
    byLevel = new Map();
    pyramid.patterns.set(ctx, byLevel);
  }
  let pattern = byLevel.get(level);
  if (!pattern) {
    pattern = ctx.createPattern(pyramid.levels[level], 'repeat');
    byLevel.set(level, pattern);
  }
  return pattern;
}

/* ------------------------------------------------------------ image cache */

export function loadHtmlImage(url, { cors = true } = {}) {
  return new Promise((resolve, reject) => {
    const remote = /^(https?:)?\/\//i.test(url);
    const img = new Image();
    if (cors && remote) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (cors && remote) {
        // Some hosts omit CORS headers: retry opaque (still drawable, just
        // without pixel access for the average colour).
        loadHtmlImage(url, { cors: false }).then(resolve, reject);
        return;
      }
      reject(new Error('could not load image'));
    };
    img.src = url;
  });
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Owns every image the app paints with: loads it once, builds the pyramid
 * once, and reports state changes so the UI can show spinners/thumbnails.
 */
export class ImageLibrary {
  constructor({ onChange = () => {} } = {}) {
    this.entries = new Map();  // url -> entry
    this.onChange = onChange;
  }

  has(url) { return !!url && this.entries.has(url); }

  /** @returns {null|{state, pyramid, error, width, height, url, name}} */
  get(url) {
    if (!url) return null;
    return this.entries.get(url) || null;
  }

  isReady(url) {
    const entry = this.get(url);
    return !!(entry && entry.state === 'ready' && entry.pyramid);
  }

  /** Start (or return) loading an image; safe to call repeatedly. */
  load(url, meta = {}) {
    if (!url) return Promise.resolve(null);
    let entry = this.entries.get(url);
    if (entry) {
      if (meta.name && !entry.name) entry.name = meta.name;
      if (entry.state === 'ready') return Promise.resolve(entry);
      if (entry.promise) return entry.promise;
    }

    entry = {
      url,
      name: meta.name || '',
      state: 'loading',
      pyramid: null,
      img: null,
      error: null,
      width: 0,
      height: 0,
      bytes: meta.bytes || 0,
      promise: null,
    };
    this.entries.set(url, entry);

    entry.promise = loadHtmlImage(url)
      .then((img) => {
        entry.img = img;
        entry.width = img.naturalWidth || img.width;
        entry.height = img.naturalHeight || img.height;
        entry.pyramid = buildPyramid(img);
        entry.state = entry.pyramid ? 'ready' : 'error';
        if (!entry.pyramid) entry.error = new Error('unsupported image');
        this.onChange(entry);
        return entry;
      })
      .catch((err) => {
        entry.state = 'error';
        entry.error = err;
        this.onChange(entry);
        return entry;
      });

    this.onChange(entry);
    return entry.promise;
  }

  /** Pre-register an image we already hold (e.g. from a Commons thumbnail). */
  register(url, img, meta = {}) {
    const entry = {
      url,
      name: meta.name || '',
      state: 'ready',
      pyramid: buildPyramid(img),
      img,
      error: null,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      bytes: meta.bytes || 0,
      promise: Promise.resolve(),
    };
    this.entries.set(url, entry);
    this.onChange(entry);
    return entry;
  }

  /**
   * Forget a cached image. Object URLs are deliberately *not* revoked: an
   * undo can bring a deleted feature (and its blob: URL) back to life.
   */
  remove(url) { this.entries.delete(url); }
}

export { MAX_TEXTURE };
