/**
 * A deliberately small DOM + Canvas2D stand-in, just complete enough to run
 * the real application modules in Node and assert on what they do.
 *
 * It is a test harness, not a browser: selectors support `#id`, `.class`,
 * `tag`, `[attr="value"]` and descendant combinations of those.
 */

/* ------------------------------------------------------------------ events */

class EventStub {
  constructor(type, props = {}) {
    this.type = type;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    Object.assign(this, props);
  }

  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
  stopImmediatePropagation() { this.propagationStopped = true; }
}

/* --------------------------------------------------------------- DOM nodes */

class FakeText {
  constructor(text) { this.nodeType = 3; this.data = String(text); this.parentNode = null; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

class ClassList {
  constructor(element) { this.el = element; this.tokens = new Set(); }
  _sync() { this.el._attrs.class = [...this.tokens].join(' '); }
  add(...names) { names.filter(Boolean).forEach((n) => this.tokens.add(n)); this._sync(); }
  remove(...names) { names.forEach((n) => this.tokens.delete(n)); this._sync(); }
  contains(name) { return this.tokens.has(name); }
  toggle(name, force) {
    const on = force === undefined ? !this.tokens.has(name) : !!force;
    if (on) this.tokens.add(name); else this.tokens.delete(name);
    this._sync();
    return on;
  }
  get value() { return [...this.tokens].join(' '); }
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

let nodeId = 0;

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.localName = String(tagName).toLowerCase();
    this.ownerDocument = ownerDocument || null;
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = Object.create(null);
    this._listeners = Object.create(null);
    this._text = '';
    this._html = '';
    this._uid = ++nodeId;
    this.classList = new ClassList(this);
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.files = [];
    this._w = 300;
    this._h = 150;
  }

  /* --- tree --- */
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get childElementCount() { return this.children.length; }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return !!node._isDocument;
  }

  appendChild(node) {
    if (!node) throw new Error('appendChild(null)');
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    const i = this.childNodes.indexOf(ref);
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, node);
    return node;
  }

  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) { this.childNodes.splice(i, 1); node.parentNode = null; }
    return node;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  replaceChildren(...nodes) {
    for (const child of this.childNodes.slice()) { child.parentNode = null; }
    this.childNodes = [];
    this._text = '';
    for (const node of nodes) {
      if (node === null || node === undefined || node === false) continue;
      this.appendChild(typeof node === 'string' || typeof node === 'number'
        ? new FakeText(String(node)) : node);
    }
  }

  /* --- attributes --- */
  setAttribute(name, value) {
    const v = value === true ? '' : String(value);
    this._attrs[name] = v;
    if (name === 'class') {
      this.classList.tokens = new Set(v.split(/\s+/).filter(Boolean));
    } else if (name === 'id') {
      this.id = v;
    } else if (name.startsWith('data-')) {
      this.dataset[camel(name.slice(5))] = v;
    } else if (name === 'hidden') {
      this.hidden = true;
    } else if (name === 'value') {
      this.value = v;
    } else if (name === 'checked') {
      this.checked = true;
    } else if (name === 'disabled') {
      this.disabled = true;
    }
  }

  getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; }
  hasAttribute(name) { return name in this._attrs; }
  removeAttribute(name) {
    delete this._attrs[name];
    if (name === 'class') this.classList.tokens = new Set();
    if (name === 'hidden') this.hidden = false;
  }

  get id() { return this._attrs.id || ''; }
  set id(v) { this._attrs.id = String(v); }

  get className() { return this._attrs.class || ''; }
  set className(v) {
    this._attrs.class = String(v);
    this.classList.tokens = new Set(String(v).split(/\s+/).filter(Boolean));
  }

  /* --- text/html --- */
  get textContent() {
    if (this._html) return this._html.replace(/<[^>]*>/g, '');
    return this.childNodes.map((n) => n.textContent).join('');
  }

  set textContent(value) {
    for (const child of this.childNodes.slice()) child.parentNode = null;
    this.childNodes = [];
    this._html = '';
    if (value !== '' && value !== null && value !== undefined) {
      this.appendChild(new FakeText(String(value)));
    }
  }

  get innerHTML() { return this._html; }
  set innerHTML(value) {
    for (const child of this.childNodes.slice()) child.parentNode = null;
    this.childNodes = [];
    this._html = String(value);
    // Enough parsing for the snippets the app injects (icons, links).
    for (const node of parseFragment(this._html, this.ownerDocument)) this.appendChild(node);
  }

  /* --- events --- */
  addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this._listeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  dispatchEvent(event) {
    const evt = event instanceof EventStub ? event : new EventStub(event.type, event);
    let node = this;
    evt.target = this;
    while (node) {
      evt.currentTarget = node;
      for (const fn of (node._listeners[evt.type] || []).slice()) {
        fn.call(node, evt);
        if (evt.propagationStopped) return !evt.defaultPrevented;
      }
      node = node.parentNode;
    }
    return !evt.defaultPrevented;
  }

  click() { this.dispatchEvent(new EventStub('click', { button: 0, bubbles: true })); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument) this.ownerDocument.activeElement = this.ownerDocument.body; }
  select() { this._selected = true; }

  /* --- geometry --- */
  getBoundingClientRect() {
    return {
      x: 0, y: 0, left: 0, top: 0, right: this._w, bottom: this._h,
      width: this._w, height: this._h,
    };
  }

  setSize(w, h) { this._w = w; this._h = h; return this; }

  /* --- querying --- */
  querySelector(selector) { return querySelectorAll(this, selector)[0] || null; }
  querySelectorAll(selector) { return querySelectorAll(this, selector); }
  closest(selector) {
    const parts = selector.trim().split(/\s+/).map(parseCompound);
    let node = this;
    while (node && node.nodeType === 1) {
      if (matchesCompound(node, parts[parts.length - 1])) return node;
      node = node.parentNode;
    }
    return null;
  }

  /* --- canvas --- */
  getContext(kind) {
    if (kind !== '2d') return null;
    if (!this._ctx) this._ctx = new ContextStub(this);
    return this._ctx;
  }

  setPointerCapture() {}
  releasePointerCapture() {}
}

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

/* ------------------------------------------------------------- selectors */

function parseCompound(text) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  const re = /([#.]?[\w-]+)|\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g;
  let m;
  let first = true;
  while ((m = re.exec(text))) {
    if (m[2] !== undefined) { out.attrs.push([m[2], m[3] === undefined ? null : m[3]]); continue; }
    const token = m[1];
    if (token.startsWith('#')) out.id = token.slice(1);
    else if (token.startsWith('.')) out.classes.push(token.slice(1));
    else if (first) out.tag = token.toUpperCase();
    first = false;
  }
  return out;
}

function matchesCompound(el, c) {
  if (el.nodeType !== 1) return false;
  if (c.tag && c.tag !== '*' && el.tagName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const [name, value] of c.attrs) {
    const attr = name === 'class' ? el.className : el.getAttribute(name);
    if (attr === null || attr === undefined) return false;
    if (value !== null && attr !== value) return false;
  }
  return true;
}

function descendants(root) {
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

function querySelectorAll(root, selector) {
  const all = descendants(root);
  const parts = String(selector).trim().split(/\s*,\s*/);
  const found = [];
  for (const part of parts) {
    const chain = part.trim().split(/\s+/).filter(Boolean).map(parseCompound);
    let matched = all.filter((el) => matchesCompound(el, chain[0]));
    for (let i = 1; i < chain.length; i++) {
      const parents = matched;
      matched = all.filter((el) => matchesCompound(el, chain[i]) && parents.some((p) => {
        let node = el.parentNode;
        while (node) { if (node === p) return true; node = node.parentNode; }
        return false;
      }));
    }
    for (const el of matched) if (!found.includes(el)) found.push(el);
  }
  return found;
}

/* ----------------------------------------------------------- HTML parsing */

const ATTR_RE = /([\w:@.-]+)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;

function parseAttributes(text, element) {
  for (const m of text.matchAll(ATTR_RE)) {
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    element.setAttribute(m[1], value);
  }
}

function parseFragment(html, doc) {
  const nodes = [];
  const stack = [];
  const root = { appendChild: (n) => nodes.push(n), childNodes: nodes };
  let cursor = root;
  const re = /<!--[\s\S]*?-->|<!\[CDATA[\s\S]*?\]\]>|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^>]*?)?)(\/?)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    const [full, closeTag, openTag, attrs, selfClose, text] = m;
    if (full.startsWith('<!--') || full.toLowerCase().startsWith('<!')) continue;
    if (closeTag) {
      if (stack.length) cursor = stack.pop();
      continue;
    }
    if (openTag) {
      const el = new FakeElement(openTag, doc);
      if (attrs) parseAttributes(attrs, el);
      cursor.appendChild(el);
      const lower = openTag.toLowerCase();
      if (!selfClose && !VOID_TAGS.has(lower)) {
        if (lower === 'script' || lower === 'style' || lower === 'textarea') {
          // Consume raw text up to the matching close tag.
          const endRe = new RegExp(`</${lower}\\s*>`, 'i');
          const rest = html.slice(re.lastIndex);
          const end = rest.search(endRe);
          if (end >= 0) {
            el._text = rest.slice(0, end);
            el.value = el._text;
            re.lastIndex += end + rest.slice(end).match(endRe)[0].length;
          }
          continue;
        }
        stack.push(cursor);
        cursor = el;
      }
      continue;
    }
    if (text !== undefined) {
      const trimmed = text.replace(/\s+/g, ' ');
      if (trimmed.trim()) cursor.appendChild(new FakeText(text));
      void trimmed;
    }
  }
  return nodes;
}

/* ---------------------------------------------------------------- document */

class FakeDocument extends FakeElement {
  constructor() {
    super('document');
    this._isDocument = true;
    this.ownerDocument = this;
    this.activeElement = null;
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.head = new FakeElement('head', this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
  }

  createElement(tag) { return new FakeElement(tag, this); }
  createTextNode(text) { return new FakeText(text); }
  createDocumentFragment() { const f = new FakeElement('fragment', this); return f; }
  getElementById(id) { return querySelectorAll(this, `#${id}`)[0] || null; }
  getElementsByClassName(cls) { return querySelectorAll(this, `.${cls}`); }
  execCommand() { return true; }
}

/* --------------------------------------------------------------- canvas2d */

function mulMatrix(p, q) {
  return {
    a: p.a * q.a + p.c * q.b,
    b: p.b * q.a + p.d * q.b,
    c: p.a * q.c + p.c * q.d,
    d: p.b * q.c + p.d * q.d,
    e: p.a * q.e + p.c * q.f + p.e,
    f: p.b * q.e + p.d * q.f + p.f,
  };
}

class MatrixStub {
  constructor(m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) { Object.assign(this, m); }
  multiplySelf(o) { const r = mulMatrix(this, o); Object.assign(this, r); return this; }
  invertSelf() {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c;
    if (!det) return new MatrixStub();
    return new MatrixStub({
      a: d / det, b: -b / det, c: -c / det, d: a / det,
      e: (c * f - d * e) / det, f: (b * e - a * f) / det,
    });
  }
  inverse() { return this.invertSelf(); }
  transformPoint(p) {
    return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f };
  }
}

class PathStub {
  constructor() { this.ops = []; }
  moveTo(...a) { this.ops.push(['moveTo', ...a]); }
  lineTo(...a) { this.ops.push(['lineTo', ...a]); }
  closePath() { this.ops.push(['closePath']); }
  arc(...a) { this.ops.push(['arc', ...a]); }
  rect(...a) { this.ops.push(['rect', ...a]); }
  roundRect(...a) { this.ops.push(['roundRect', ...a]); }
  arcTo(...a) { this.ops.push(['arcTo', ...a]); }
}

class ContextStub {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this.state = {
      fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
      font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
      lineJoin: 'miter', lineCap: 'butt', lineDashOffset: 0,
      imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
    };
    this._stack = [];
    this._transform = new MatrixStub();
    this._lineDash = [];
    for (const key of Object.keys(this.state)) {
      Object.defineProperty(this, key, {
        get: () => this.state[key],
        set: (v) => {
          this.state[key] = v;
          // Painting with a pattern/colour is the interesting part for the
          // image-fill tests, so record the assignment too.
          if (key === 'fillStyle' || key === 'strokeStyle') this.calls.push({ name: key, args: [v] });
        },
        enumerable: true,
      });
    }
  }

  _log(name, args) { this.calls.push({ name, args: Array.from(args) }); }
  named(name) { return this.calls.filter((c) => c.name === name); }
  last(name) { const list = this.named(name); return list[list.length - 1] || null; }
  reset() { this.calls = []; }

  save() { this._stack.push({ ...this.state, t: new MatrixStub(this._transform) }); this._log('save', arguments); }
  restore() {
    const s = this._stack.pop();
    if (s) { this._transform = s.t; delete s.t; Object.assign(this.state, s); }
    this._log('restore', arguments);
  }

  setTransform(a, b, c, d, e, f) {
    if (a && typeof a === 'object') this._transform = new MatrixStub({ a: a.a, b: a.b, c: a.c, d: a.d, e: a.e, f: a.f });
    else this._transform = new MatrixStub({ a, b, c, d, e, f });
    this._log('setTransform', arguments);
  }
  getTransform() { return new MatrixStub(this._transform); }
  translate(x, y) { this._transform = mulMatrix(this._transform, { a: 1, b: 0, c: 0, d: 1, e: x, f: y }); this._log('translate', arguments); }
  scale(x, y) { this._transform = mulMatrix(this._transform, { a: x, b: 0, c: 0, d: y === undefined ? x : y, e: 0, f: 0 }); this._log('scale', arguments); }
  rotate(r) {
    const c = Math.cos(r), s = Math.sin(r);
    this._transform = mulMatrix(this._transform, { a: c, b: s, c: -s, d: c, e: 0, f: 0 });
    this._log('rotate', arguments);
  }
  transform(m) { this._transform = mulMatrix(this._transform, m); this._log('transform', arguments); }

  setLineDash(arr) { this._lineDash = Array.isArray(arr) ? arr.slice() : []; this._log('setLineDash', arguments); }
  getLineDash() { return this._lineDash.slice(); }

  beginPath() { this._log('beginPath', arguments); }
  closePath() { this._log('closePath', arguments); }
  moveTo() { this._log('moveTo', arguments); }
  lineTo() { this._log('lineTo', arguments); }
  arc() { this._log('arc', arguments); }
  arcTo() { this._log('arcTo', arguments); }
  rect() { this._log('rect', arguments); }
  roundRect() { this._log('roundRect', arguments); }
  quadraticCurveTo() { this._log('quadraticCurveTo', arguments); }
  bezierCurveTo() { this._log('bezierCurveTo', arguments); }

  fill() { this._log('fill', arguments); }
  stroke() { this._log('stroke', arguments); }
  clip() { this._log('clip', arguments); }
  fillRect() { this._log('fillRect', arguments); }
  strokeRect() { this._log('strokeRect', arguments); }
  clearRect() { this._log('clearRect', arguments); }
  fillText() { this._log('fillText', arguments); }
  strokeText() { this._log('strokeText', arguments); }
  getImageData(x, y, w, h) {
    // Deterministic stand-in pixels: (200, 100, 50, opaque).
    const data = new Uint8ClampedArray(Math.max(1, w * h) * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200; data[i + 1] = 100; data[i + 2] = 50; data[i + 3] = 255;
    }
    return { data, width: w, height: h };
  }

  measureText(text) { return { width: String(text).length * 6.2, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; }

  drawImage(image) {
    if (!image) throw new Error('drawImage() called with no image');
    if (!image.width && !image.naturalWidth) throw new Error('drawImage() called with an empty source');
    this._log('drawImage', arguments);
  }

  createPattern(source, repetition) {
    if (!source) throw new Error('createPattern() called with no source');
    this._log('createPattern', [source, repetition]);
    return { __pattern: true, source, repetition, setTransform() {} };
  }

  createLinearGradient() { return { addColorStop() {} }; }
}

/* ------------------------------------------------------------- browser-ish */

class FakeImage {
  constructor() {
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.width = 0;
    this.height = 0;
    this.complete = false;
    this._src = '';
  }

  get src() { return this._src; }
  set src(value) {
    this._src = String(value);
    const fail = /fail|404|broken/i.test(this._src);
    queueMicrotask(() => {
      if (fail) { this.onerror && this.onerror(new Error('load failed')); return; }
      const size = FakeImage.sizes.get(this._src);
      this.naturalWidth = (size && size[0]) || 512;
      this.naturalHeight = (size && size[1]) || 341;
      this.width = this.naturalWidth;
      this.height = this.naturalHeight;
      this.complete = true;
      this.onload && this.onload();
    });
  }
}
FakeImage.sizes = new Map();

class FakeFileReader {
  readAsDataURL(file) {
    queueMicrotask(() => {
      this.result = `data:${file.type || 'image/png'};base64,${Buffer.from(file.name || 'x').toString('base64')}`;
      this.onload && this.onload();
    });
  }
}

class FakeResizeObserver {
  constructor(cb) { this.cb = cb; FakeResizeObserver.instances.push(this); }
  observe() {}
  unobserve() {}
  disconnect() {}
}
FakeResizeObserver.instances = [];

class StorageStub {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
  setItem(k, v) { this.map.set(String(k), String(v)); }
  removeItem(k) { this.map.delete(String(k)); }
  clear() { this.map.clear(); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

const timers = { raf: [], timeouts: new Set() };

function rafStub(fn) {
  const handle = setTimeout(() => {
    timers.raf = timers.raf.filter((h) => h !== handle);
    fn(performance.now());
  }, 0);
  timers.raf.push(handle);
  return handle;
}

function clearRaf(handle) { clearTimeout(handle); timers.raf = timers.raf.filter((h) => h !== handle); }

/** Let queued microtasks, timers and rAF callbacks run. */
export async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

/* ------------------------------------------------------------------ install */

export function installDOM(html) {
  const document = new FakeDocument();
  const nodes = parseFragment(html, document);
  const rootHtml = nodes.find((n) => n.tagName === 'HTML');
  if (rootHtml) {
    // Adopt <head>/<body> children into the document's own head/body.
    for (const section of rootHtml.children) {
      const target = section.tagName === 'HEAD' ? document.head : document.body;
      for (const child of section.children.slice()) target.appendChild(child);
    }
  } else {
    for (const node of nodes) document.body.appendChild(node);
  }

  const listeners = new Map();
  const window = {
    document,
    devicePixelRatio: 2,
    innerWidth: 1440,
    innerHeight: 900,
    isSecureContext: true,
    location: { href: 'https://localhost/', origin: 'https://localhost', protocol: 'https:' },
    navigator: { userAgent: 'node-test', clipboard: { writeText: async () => {} } },
    localStorage: new StorageStub(),
    requestAnimationFrame: rafStub,
    cancelAnimationFrame: clearRaf,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      const list = listeners.get(type) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    dispatch(type, event) {
      for (const fn of (listeners.get(type) || []).slice()) fn(event);
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    Blob: globalThis.Blob,
    File: class File extends globalThis.Blob {
      constructor(parts, name, opts = {}) { super(parts, opts); this.name = name; this.type = opts.type || ''; }
      text() { return super.text(); }
    },
    URL: globalThis.URL,
    performance,
    setTimeout,
    clearTimeout,
  };
  window.window = window;
  window.self = window;

  const g = globalThis;
  const define = (name, value) => Object.defineProperty(g, name, { value, configurable: true, writable: true });

  define('window', window);
  define('document', document);
  define('localStorage', window.localStorage);
  define('navigator', window.navigator);
  define('location', window.location);
  define('requestAnimationFrame', rafStub);
  define('cancelAnimationFrame', clearRaf);
  define('Image', FakeImage);
  define('HTMLImageElement', FakeImage);
  define('FileReader', FakeFileReader);
  define('ResizeObserver', FakeResizeObserver);
  define('Path2D', PathStub);
  define('DOMMatrix', MatrixStub);
  define('DOMPoint', class DOMPoint { constructor(x = 0, y = 0) { this.x = x; this.y = y; } });
  define('devicePixelRatio', window.devicePixelRatio);
  define('innerWidth', window.innerWidth);
  define('getComputedStyle', window.getComputedStyle);
  define('Element', FakeElement);
  define('Node', FakeElement);
  define('Event', EventStub);
  define('CustomEvent', EventStub);
  define('File', window.File);

  return { window, document, listeners };
}

/* ----------------------------------------------------------------- helpers */

export function event(type, props = {}) {
  return new EventStub(type, { bubbles: true, cancelable: true, ...props });
}

export function pointer(type, x, y, extra = {}) {
  return event(type, {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  });
}

export { FakeElement, FakeDocument, FakeText, EventStub, PathStub, MatrixStub, ContextStub, FakeImage };
