/**
 * Application state: the feature list, the current selection, the style used
 * for newly drawn shapes, and undo/redo history.
 *
 * The map starts empty on purpose — no sample shape, no presets.
 */

import { Emitter, clamp } from './util.js';
import {
  defaultStyle, normalizeStyle, styleOf, createFeature, featureName,
} from './geojson.js';
import { geometryArea, geometryLength, bboxOfFeatures } from './geo.js';

const clone = (value) => (typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)));

export function mergeStyle(style, patch) {
  const next = { ...style };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'image-fill' || key === 'label') {
      next[key] = { ...style[key], ...(value && typeof value === 'object' ? value : {}) };
    } else {
      next[key] = value;
    }
  }
  return normalizeStyle(next);
}

export class Store extends Emitter {
  constructor() {
    super();
    this.features = [];
    this.selection = new Set();
    this.defaultStyle = defaultStyle();
    this._history = [];
    this._future = [];
    this._dirty = false;
  }

  /* ------------------------------------------------------------- queries */

  get count() { return this.features.length; }
  selectedFeatures() { return this.features.filter((f) => this.selection.has(f.id)); }
  has(id) { return this.features.some((f) => f.id === id); }
  byId(id) { return this.features.find((f) => f.id === id) || null; }
  selectionSize() { return this.selection.size; }

  /** The style the Styles panel edits: selection (if any) else new-shape defaults. */
  editStyle() {
    const selected = this.selectedFeatures();
    if (!selected.length) return clone(this.defaultStyle);
    return clone(styleOf(selected[0]));
  }

  styleScope() {
    const n = this.selection.size;
    if (n === 0) return 'default';
    return n === 1 ? 'single' : 'multi';
  }

  bounds() { return bboxOfFeatures(this.features); }

  stats(feature) {
    const area = geometryArea(feature.geometry);
    const length = geometryLength(feature.geometry);
    const type = feature.geometry ? feature.geometry.type : '—';
    return { type, area, length, name: featureName(feature) };
  }

  /* ----------------------------------------------------------- selection */

  select(ids, { additive = false } = {}) {
    const list = [].concat(ids).filter((id) => id && this.has(id));
    if (additive) {
      for (const id of list) {
        if (this.selection.has(id)) this.selection.delete(id);
        else this.selection.add(id);
      }
    } else {
      this.selection.clear();
      for (const id of list) this.selection.add(id);
    }
    this._dirty = true;
    this.emit('selection');
    this.emit('change', { reason: 'selection' });
  }

  toggleSelect(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit('selection');
    this.emit('change', { reason: 'selection' });
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.emit('selection');
    this.emit('change', { reason: 'selection' });
  }

  /* ----------------------------------------------------------- mutations */

  /**
   * Record the current state for undo, run `fn`, then announce the change.
   * `key` lets a burst of related edits (typing, dragging a slider) collapse
   * into a single undo step. Pass `discrete` for a one-shot action that must
   * stay undoable on its own even when it repeats the action before it.
   */
  mutate(key, fn, { discrete = false } = {}) {
    this._push(key, discrete);
    const result = fn(this);
    this._future.length = 0;
    this._dirty = true;
    this.emit('change', { reason: key || 'edit' });
    return result;
  }

  /**
   * Start an undo step *before* a continuous gesture (drag), then keep
   * mutating live without recording further steps.
   */
  beginHistory(key) {
    this._push(key);
    this._future.length = 0;
    this.emit('history');
  }

  /** Mutate during a gesture: no new undo entry, listeners still fire. */
  applyLive(fn, reason = 'live') {
    fn(this);
    this._dirty = true;
    this.emit('change', { reason });
  }

  _push(key, discrete = false) {
    const now = Date.now();
    const last = this._history[this._history.length - 1];
    if (!discrete && key && last && last.key === key && now - last.t < 900) {
      last.t = now;
      return;
    }
    this._history.push({ key: key || null, t: now, snapshot: this._snapshot() });
    if (this._history.length > 80) this._history.shift();
  }

  _snapshot() {
    return {
      features: clone(this.features),
      selection: [...this.selection],
      defaultStyle: clone(this.defaultStyle),
    };
  }

  _restore(snapshot) {
    this.features = clone(snapshot.features);
    this.selection = new Set(snapshot.selection.filter((id) => this.has(id)));
    this.defaultStyle = normalizeStyle(snapshot.defaultStyle || defaultStyle());
    this._dirty = true;
    this.emit('selection');
    this.emit('change', { reason: 'history' });
  }

  get canUndo() { return this._history.length > 0; }
  get canRedo() { return this._future.length > 0; }

  undo() {
    const entry = this._history.pop();
    if (!entry) return false;
    this._future.push({ key: entry.key, t: Date.now(), snapshot: this._snapshot() });
    this._restore(entry.snapshot);
    this.emit('history');
    return true;
  }

  redo() {
    const entry = this._future.pop();
    if (!entry) return false;
    this._history.push({ key: entry.key, t: Date.now(), snapshot: this._snapshot() });
    this._restore(entry.snapshot);
    this.emit('history');
    return true;
  }

  clearHistory() {
    this._history.length = 0;
    this._future.length = 0;
    this.emit('history');
  }

  /* ------------------------------------------------------------- editing */

  addFeatures(features, { select = true, key = 'add' } = {}) {
    if (!features.length) return [];
    this.mutate(key, () => {
      for (const f of features) this.features.push(f);
      if (select) {
        this.selection.clear();
        for (const f of features) this.selection.add(f.id);
      }
    });
    return features;
  }

  addGeometry(geometry, style = null, props = {}) {
    const feature = createFeature(geometry, {
      style: style ? mergeStyle(this.defaultStyle, style) : clone(this.defaultStyle),
      properties: props,
    });
    this.addFeatures([feature]);
    return feature;
  }

  removeSelected() {
    if (!this.selection.size) return 0;
    const ids = [...this.selection];
    this.mutate('remove', () => {
      this.features = this.features.filter((f) => !this.selection.has(f.id));
      this.selection.clear();
    });
    return ids.length;
  }

  removeFeature(id) {
    this.mutate('remove', () => {
      this.features = this.features.filter((f) => f.id !== id);
      this.selection.delete(id);
    });
  }

  duplicateSelected() {
    const selected = this.selectedFeatures();
    if (!selected.length) return [];
    const copies = selected.map((f) => createFeature(clone(f.geometry), {
      properties: { ...(f.properties || {}), name: `${featureName(f)} copy` },
      style: clone(styleOf(f)),
    }));
    this.addFeatures(copies, { key: 'duplicate' });
    return copies;
  }

  clearAll() {
    if (!this.features.length) return;
    this.mutate('clear', () => {
      this.features = [];
      this.selection.clear();
    });
  }

  /** Move a feature in the draw order (later = on top). */
  reorder(id, direction) {
    const index = this.features.findIndex((f) => f.id === id);
    if (index < 0) return;
    const target = clamp(index + direction, 0, this.features.length - 1);
    if (target === index) return;
    this.mutate('order', () => {
      const [item] = this.features.splice(index, 1);
      this.features.splice(target, 0, item);
    });
  }

  /** Translate selected features by a lng/lat delta. */
  translateSelected(dLng, dLat, key = 'move') {
    const selected = this.selectedFeatures();
    if (!selected.length || (dLng === 0 && dLat === 0)) return;
    this.mutate(key, () => {
      for (const feature of selected) shiftGeometry(feature.geometry, dLng, dLat);
    });
  }

  /** Create a property with an empty value (setProperty('') means "remove"). */
  addProperty(id, name) {
    this.mutate(`props:${id}:${name}`, () => {
      const feature = this.byId(id);
      if (!feature) return;
      feature.properties = { ...(feature.properties || {}), [name]: '' };
    });
  }

  setProperty(id, name, value, key = 'props') {
    const feature = this.byId(id);
    if (!feature) return;
    this.mutate(key, () => {
      feature.properties = { ...(feature.properties || {}) };
      if (value === '' || value === null || value === undefined) delete feature.properties[name];
      else feature.properties[name] = value;
    });
  }

  /** Apply a partial style to the selection, to everything, or to the defaults. */
  setStyle(patch, scope = null, key = 'style') {
    const target = scope || this.styleScope();
    this.mutate(key, () => {
      if (target === 'default' || target === 'all-defaults') {
        this.defaultStyle = mergeStyle(this.defaultStyle, patch);
        if (target === 'all-defaults') {
          for (const f of this.features) f.style = mergeStyle(styleOf(f), patch);
        }
        return;
      }
      if (target === 'all') {
        for (const f of this.features) f.style = mergeStyle(styleOf(f), patch);
        this.defaultStyle = mergeStyle(this.defaultStyle, patch);
        return;
      }
      const selected = this.selectedFeatures();
      if (!selected.length) {
        this.defaultStyle = mergeStyle(this.defaultStyle, patch);
        return;
      }
      for (const f of selected) f.style = mergeStyle(styleOf(f), patch);
    });
  }

  resetStyle(scope = null) {
    const base = defaultStyle();
    this.setStyle(base, scope, 'style-reset');
  }

  /* ---------------------------------------------------------- (de)serialise */

  load(features, { replace = true, select = false } = {}) {
    this.mutate(replace ? 'import' : 'import-add', () => {
      if (replace) { this.features = []; this.selection.clear(); }
      for (const f of features) this.features.push(f);
      if (select) {
        this.selection.clear();
        for (const f of features) this.selection.add(f.id);
      }
    });
  }

  serialize(camera) {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      camera: camera ? { center: camera.center, zoom: camera.zoom } : null,
      defaultStyle: this.defaultStyle,
      features: this.features.map((f) => ({
        type: 'Feature',
        id: f.id,
        properties: f.properties || {},
        geometry: f.geometry,
        style: styleOf(f),
      })),
    };
  }

  hydrate(data) {
    if (!data || typeof data !== 'object') return false;
    const incoming = Array.isArray(data.features) ? data.features : [];
    const features = [];
    for (const raw of incoming) {
      if (!raw || !raw.geometry) continue;
      const feature = createFeature(clone(raw.geometry), {
        id: raw.id || undefined,
        properties: raw.properties || {},
        style: normalizeStyle(raw.style || {}),
      });
      // Preserve a style that only survived inside properties.
      if (!raw.style) feature.style = normalizeStyle(styleFromPropsOnly(raw.properties));
      features.push(feature);
    }
    this.features = features;
    this.selection.clear();
    this.defaultStyle = normalizeStyle(data.defaultStyle || defaultStyle());
    this.clearHistory();
    this._dirty = true;
    this.emit('change', { reason: 'hydrate' });
    return true;
  }

  get dirty() { return this._dirty; }
  markSaved() { this._dirty = false; }
}

function styleFromPropsOnly(props) {
  // Lazy import cycle avoidance: normalizeStyle already reads properties keys.
  return props && typeof props === 'object'
    ? normalizeStyle({
      stroke: props.stroke,
      'stroke-opacity': props['stroke-opacity'],
      'stroke-width': props['stroke-width'],
      fill: props.fill,
      'fill-opacity': props['fill-opacity'],
      'fill-mode': props['fill-mode'],
      'image-fill': props['x-image-fill'],
      label: props['x-label'],
    })
    : defaultStyle();
}

/** In-place translation of every position in a geometry. */
export function shiftGeometry(geometry, dLng, dLat) {
  if (!geometry || !geometry.coordinates) return;
  const walk = (node, depth) => {
    if (depth === 0) {
      node[0] += dLng;
      node[1] += dLat;
      return;
    }
    for (const child of node) walk(child, depth - 1);
  };
  const depth = {
    Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3,
  }[geometry.type];
  if (depth !== undefined) walk(geometry.coordinates, depth);
}

export { featureName, styleOf, createFeature };
