/**
 * Tiny helpers shared across the app: an event emitter, DOM shortcuts and
 * a few numeric/formatting utilities.
 */

/* ------------------------------------------------------------------ events */

export class Emitter {
  constructor() { this._h = Object.create(null); }

  on(type, fn) {
    (this._h[type] || (this._h[type] = [])).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const list = this._h[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, payload) {
    const list = this._h[type];
    if (!list) return;
    // Copy: a handler may unsubscribe while we iterate.
    for (const fn of list.slice()) fn(payload);
  }
}

/* --------------------------------------------------------------------- dom */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/** Wire a <div class="seg"> of radio inputs: keeps `.sel` in sync, calls back. */
export function segmented(container, onChange) {
  const labels = $$('label', container);
  const inputs = $$('input[type=radio]', container);

  const sync = () => {
    for (const l of labels) {
      const input = $('input', l);
      l.classList.toggle('sel', !!(input && input.checked));
    }
  };

  const set = (value, fire = false) => {
    for (const input of inputs) input.checked = input.value === value;
    sync();
    if (fire) onChange(value);
  };

  const get = () => {
    const checked = inputs.find((i) => i.checked);
    return checked ? checked.value : null;
  };

  for (const input of inputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      sync();
      onChange(input.value);
    });
  }
  sync();
  return { set, get, sync };
}

/* ------------------------------------------------------------------ numbers */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const round = (v, p = 0) => { const m = 10 ** p; return Math.round(v * m) / m; };
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Deterministic-enough unique id, no dependencies. */
export function uid(prefix = 'f') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* --------------------------------------------------------------- formatting */

export function fmtLatLng(lat, lng) {
  const la = `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}`;
  const lo = `${Math.abs(lng).toFixed(4)}°${lng < 0 ? 'W' : 'E'}`;
  return `${la} ${lo}`;
}

export function fmtLength(meters) {
  if (!isFinite(meters)) return '—';
  return meters < 1000 ? `${meters.toFixed(0)} m` : `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;
}

export function fmtArea(sqMeters) {
  if (!isFinite(sqMeters)) return '—';
  if (sqMeters < 1e6) return `${sqMeters.toFixed(0)} m²`;
  if (sqMeters < 1e8) return `${(sqMeters / 1e4).toFixed(2)} ha`;
  return `${(sqMeters / 1e6).toFixed(1)} km²`;
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** '#rrggbb' + alpha(0..1) -> 'rgba(r,g,b,a)' */
export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Relative luminance -> readable text colour for a swatch background. */
export function readableOn(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#131a24' : '#ffffff';
}
