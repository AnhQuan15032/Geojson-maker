/**
 * GeoJSON in/out plus the style model.
 *
 * Styling lives on the feature and is written to `properties` using
 * simplestyle-spec key names (`fill`, `stroke`, `stroke-width`, …) so other
 * tools understand it, with app-specific extras under `x-image-fill` /
 * `x-label`.
 */

import { uid } from './util.js';
import { orientRings } from './geo.js';

export const GEOMETRY_TYPES = new Set([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
]);

/** Property keys that are derived from the style object (hidden from the
 *  generic property editor, rebuilt on export). */
export const STYLE_KEYS = [
  'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'fill', 'fill-opacity',
  'fill-mode', 'x-image-fill', 'x-label', 'attribution',
];

export const DASHES = {
  solid: null,
  dashed: [7, 5],
  dotted: [1.6, 3.4],
  dashdot: [9, 4, 1.6, 4],
};

export function dashKeyToArray(key) {
  return DASHES[key] || null;
}

export function dashArrayToKey(arr) {
  if (!Array.isArray(arr) || !arr.length) return 'solid';
  const joined = arr.join(',');
  for (const [key, value] of Object.entries(DASHES)) {
    if (value && value.join(',') === joined) return key;
  }
  // Unknown pattern -> approximate by density.
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  return avg < 2.5 ? 'dotted' : 'dashed';
}

/* ------------------------------------------------------------------ style */

export function defaultImageFill() {
  return {
    url: null,             // object URL, data URL or http(s) URL
    name: '',              // human readable source name
    source: 'upload',      // upload | url | commons
    layout: 'tile',        // tile | stretch | center
    size: 72,              // tile size, in px (anchor=screen) or metres (anchor=ground)
    unit: 'px',            // derived from anchor, kept for export clarity
    anchor: 'screen',      // screen | ground
    rotation: 0,           // degrees
    offsetX: 0,
    offsetY: 0,
    fit: 'cover',          // cover | contain (stretch layout)
    width: 120,            // px (center layout)
    opacity: 1,
    backdrop: '#ffffff',
    backdropOn: false,
    noUpscale: true,       // don't magnify past native resolution
    attribution: '',       // e.g. "Author / CC BY-SA 4.0"
    page: '',              // Commons file page
    license: '',
  };
}

export function defaultStyle() {
  return {
    'stroke': '#2f6df6',
    'stroke-opacity': 1,
    'stroke-width': 2,
    'stroke-dash': 'solid',
    'fill': '#2f6df6',
    'fill-opacity': 0.25,
    'fill-mode': 'solid',
    'image-fill': defaultImageFill(),
    label: { show: false, size: 12, color: '#131a24' },
  };
}

const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);
const str = (v, fallback) => (typeof v === 'string' && v ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

export function normalizeImageFill(input = {}) {
  const base = defaultImageFill();
  if (!input || typeof input !== 'object') return base;
  const layout = ['tile', 'stretch', 'center'].includes(input.layout) ? input.layout : base.layout;
  const anchor = ['screen', 'ground'].includes(input.anchor) ? input.anchor : base.anchor;
  return {
    ...base,
    ...input,
    layout,
    anchor,
    unit: anchor === 'ground' ? 'm' : 'px',
    size: num(input.size, base.size),
    width: num(input.width, base.width),
    rotation: num(input.rotation, base.rotation),
    offsetX: num(input.offsetX, base.offsetX),
    offsetY: num(input.offsetY, base.offsetY),
    opacity: Math.max(0, Math.min(1, num(input.opacity, base.opacity))),
    fit: ['cover', 'contain'].includes(input.fit) ? input.fit : base.fit,
    url: typeof input.url === 'string' && input.url ? input.url : null,
    name: str(input.name, ''),
    source: ['upload', 'url', 'commons'].includes(input.source) ? input.source : base.source,
    backdrop: str(input.backdrop, base.backdrop),
    backdropOn: bool(input.backdropOn, base.backdropOn),
    noUpscale: bool(input.noUpscale, base.noUpscale),
    attribution: str(input.attribution, ''),
    page: str(input.page, ''),
    license: str(input.license, ''),
  };
}

export function normalizeStyle(input = {}) {
  const base = defaultStyle();
  const s = input && typeof input === 'object' ? input : {};
  const fillMode = ['solid', 'image', 'commons'].includes(s['fill-mode']) ? s['fill-mode'] : base['fill-mode'];
  const label = s.label && typeof s.label === 'object' ? s.label : {};
  return {
    'stroke': str(s.stroke, base.stroke),
    'stroke-opacity': Math.max(0, Math.min(1, num(s['stroke-opacity'], base['stroke-opacity']))),
    'stroke-width': Math.max(0, num(s['stroke-width'], base['stroke-width'])),
    'stroke-dash': str(s['stroke-dash'], base['stroke-dash']),
    'fill': str(s.fill, base.fill),
    'fill-opacity': Math.max(0, Math.min(1, num(s['fill-opacity'], base['fill-opacity']))),
    'fill-mode': fillMode,
    'image-fill': normalizeImageFill(s['image-fill']),
    label: {
      show: bool(label.show, base.label.show),
      size: Math.max(6, num(label.size, base.label.size)),
      color: str(label.color, base.label.color),
    },
  };
}

/** Style object -> GeoJSON `properties` fragment. */
export function styleToProperties(style, includeStyle = true) {
  if (!includeStyle) return {};
  const props = {
    stroke: style.stroke,
    'stroke-opacity': style['stroke-opacity'],
    'stroke-width': style['stroke-width'],
    fill: style.fill,
    'fill-opacity': style['fill-opacity'],
  };
  const dash = dashKeyToArray(style['stroke-dash']);
  if (dash) props['stroke-dasharray'] = dash.join(' ');

  const image = style['image-fill'];
  if ((style['fill-mode'] === 'image' || style['fill-mode'] === 'commons') && image.url) {
    props['fill-mode'] = style['fill-mode'];
    props['x-image-fill'] = {
      url: image.url.startsWith('blob:') || image.url.startsWith('data:') ? null : image.url,
      name: image.name || undefined,
      source: image.source,
      layout: image.layout,
      size: image.size,
      unit: image.unit,
      anchor: image.anchor,
      rotation: image.rotation || undefined,
      offsetX: image.offsetX || undefined,
      offsetY: image.offsetY || undefined,
      fit: image.layout === 'stretch' ? image.fit : undefined,
      width: image.layout === 'center' ? image.width : undefined,
      opacity: image.opacity,
      backdrop: image.backdropOn ? image.backdrop : undefined,
      noUpscale: image.noUpscale,
      attribution: image.attribution || undefined,
      page: image.page || undefined,
      license: image.license || undefined,
    };
    if (image.attribution) props.attribution = image.attribution;
  }

  if (style.label.show) {
    props['x-label'] = { show: true, size: style.label.size, color: style.label.color };
  }
  return props;
}

/** GeoJSON `properties` -> style object. */
export function styleFromProperties(props = {}) {
  const style = defaultStyle();
  if (!props || typeof props !== 'object') return style;

  if (typeof props.stroke === 'string') style.stroke = props.stroke;
  if (typeof props['stroke-color'] === 'string') style.stroke = props['stroke-color'];
  if (typeof props['stroke-opacity'] === 'number') style['stroke-opacity'] = props['stroke-opacity'];
  if (typeof props['stroke-width'] === 'number') style['stroke-width'] = props['stroke-width'];
  if (typeof props['stroke-dasharray'] === 'string') {
    style['stroke-dash'] = dashArrayToKey(props['stroke-dasharray'].split(/[\s,]+/).map(Number).filter((n) => isFinite(n)));
  } else if (Array.isArray(props['stroke-dasharray'])) {
    style['stroke-dash'] = dashArrayToKey(props['stroke-dasharray']);
  }
  if (typeof props.fill === 'string' && props.fill !== 'none') style.fill = props.fill;
  if (props.fill === 'none') style['fill-opacity'] = 0;
  if (typeof props['fill-opacity'] === 'number') style['fill-opacity'] = props['fill-opacity'];
  if (typeof props['marker-color'] === 'string' && !props.fill) style.fill = props['marker-color'];

  const image = props['x-image-fill'] || props.imageFill;
  if (image && typeof image === 'object' && (image.url || image.source)) {
    style['fill-mode'] = props['fill-mode'] === 'commons' ? 'commons' : 'image';
    style['image-fill'] = normalizeImageFill({
      ...image,
      url: image.url || null,
      backdropOn: typeof image.backdrop === 'string' && image.backdrop !== 'none',
      backdrop: typeof image.backdrop === 'string' && image.backdrop !== 'none' ? image.backdrop : '#ffffff',
    });
  } else if (props['fill-mode'] === 'image' || props['fill-mode'] === 'commons') {
    style['fill-mode'] = props['fill-mode'];
  }

  const label = props['x-label'];
  if (label && typeof label === 'object') {
    style.label = {
      show: label.show !== false,
      size: typeof label.size === 'number' ? label.size : 12,
      color: typeof label.color === 'string' ? label.color : '#131a24',
    };
  }
  return style;
}

/* --------------------------------------------------------------- features */

export function featureName(feature) {
  const p = feature.properties || {};
  return str(p.name, '') || str(p.title, '') || str(p.NAME, '') || str(p.label, '')
    || str(p.id, '') || `Feature ${String(feature.id || '').slice(-4)}`;
}

export function createFeature(geometry, extra = {}) {
  const properties = { name: '', ...(extra.properties || {}) };
  orientRings(geometry);
  return {
    type: 'Feature',
    id: extra.id || uid('f'),
    properties: {
      ...properties,
      ...styleToProperties(extra.style || defaultStyle(), true),
    },
    geometry,
    // Runtime only (never exported):
    style: normalizeStyle(extra.style),
  };
}

export function styleOf(feature) {
  if (feature.style) return feature.style;
  feature.style = styleFromProperties(feature.properties);
  return feature.style;
}

/* ------------------------------------------------------------ geometry io */

/** Round coordinates for compact, stable output. */
export function roundCoordinates(node, depth, precision = 7) {
  if (depth === 0) {
    if (Array.isArray(node)) return [round(node[0], precision), round(node[1], precision)];
    return node;
  }
  return Array.isArray(node) ? node.map((c) => roundCoordinates(c, depth - 1, precision)) : node;
}
const round = (v, p) => Math.round(v * 10 ** p) / 10 ** p;

const GEOM_DEPTH = {
  Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3,
};

export function cloneGeometry(geometry) {
  const depth = GEOM_DEPTH[geometry.type];
  if (depth === undefined) return { type: geometry.type, coordinates: JSON.parse(JSON.stringify(geometry.coordinates || [])) };
  return { type: geometry.type, coordinates: roundCoordinates(geometry.coordinates, depth) };
}

function toPosition(node) {
  if (!Array.isArray(node) || node.length < 2) return null;
  const lng = Number(node[0]);
  const lat = Number(node[1]);
  if (!isFinite(lng) || !isFinite(lat)) return null;
  return [Math.max(-180, Math.min(180, lng)), Math.max(-90, Math.min(90, lat))];
}

/** Clean up a raw geometry object: valid positions, closed polygon rings. */
export function normalizeGeometry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type;
  if (!GEOMETRY_TYPES.has(type)) return null;

  const ring = (arr) => {
    const out = [];
    if (!Array.isArray(arr)) return null;
    for (const pos of arr) {
      const p = toPosition(pos);
      if (p) out.push(p);
    }
    return out;
  };

  if (type === 'Point') {
    const p = toPosition(raw.coordinates);
    return p ? { type, coordinates: p } : null;
  }

  if (type === 'MultiPoint') {
    const pts = (Array.isArray(raw.coordinates) ? raw.coordinates : []).map(toPosition).filter(Boolean);
    return pts.length ? { type, coordinates: pts } : null;
  }

  if (type === 'LineString') {
    const line = ring(raw.coordinates);
    return line && line.length >= 2 ? { type, coordinates: line } : null;
  }

  if (type === 'MultiLineString') {
    const lines = (Array.isArray(raw.coordinates) ? raw.coordinates : [])
      .map(ring).filter((l) => l && l.length >= 2);
    return lines.length ? { type, coordinates: lines } : null;
  }

  if (type === 'Polygon') {
    const rings = (Array.isArray(raw.coordinates) ? raw.coordinates : [])
      .map(ring).filter((r) => r && r.length >= 3).map(closeRing);
    return rings.length ? { type, coordinates: rings } : null;
  }

  if (type === 'MultiPolygon') {
    const polys = (Array.isArray(raw.coordinates) ? raw.coordinates : [])
      .map((p) => (Array.isArray(p) ? p : [])
        .map(ring).filter((r) => r && r.length >= 3).map(closeRing))
      .filter((p) => p.length);
    return polys.length ? { type, coordinates: polys } : null;
  }

  return null;
}

function closeRing(r) {
  if (!r.length) return r;
  const first = r[0], last = r[r.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) r.push([first[0], first[1]]);
  return r;
}

/**
 * Parse anything GeoJSON-ish into a list of runtime features.
 * Returns { features, errors, skipped }.
 */
export function parseGeoJSON(text) {
  const errors = [];
  const features = [];
  let skipped = 0;

  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (err) {
    // Tolerate newline-delimited GeoJSON.
    const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      data = { type: 'FeatureCollection', features: [] };
      for (const line of lines) {
        try { data.features.push(JSON.parse(line)); } catch { errors.push('Skipped an unparsable line'); skipped++; }
      }
    } else {
      return { features, errors: [`Not valid JSON: ${err.message}`], skipped };
    }
  }

  const push = (rawFeature) => {
    if (!rawFeature || typeof rawFeature !== 'object') { skipped++; return; }

    let geometry = null;
    let properties = {};
    let id = null;

    if (rawFeature.type === 'Feature') {
      geometry = normalizeGeometry(rawFeature.geometry);
      properties = rawFeature.properties && typeof rawFeature.properties === 'object' ? rawFeature.properties : {};
      id = rawFeature.id !== undefined && rawFeature.id !== null ? String(rawFeature.id) : null;
    } else if (GEOMETRY_TYPES.has(rawFeature.type)) {
      geometry = normalizeGeometry(rawFeature);
    } else if (rawFeature.type === 'GeometryCollection' && Array.isArray(rawFeature.geometries)) {
      for (const g of rawFeature.geometries) push({ type: 'Feature', geometry: g, properties: {} });
      return;
    } else {
      skipped++;
      errors.push(`Ignored unsupported object${rawFeature.type ? ` of type "${rawFeature.type}"` : ''}`);
      return;
    }

    if (!geometry) { skipped++; return; }
    features.push(createFeature(geometry, { properties, style: styleFromProperties(properties), id }));
  };

  if (Array.isArray(data)) {
    for (const item of data) push(item);
  } else if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    for (const item of data.features) push(item);
  } else {
    push(data);
  }

  return { features, errors, skipped };
}

/** Serialize runtime features into a FeatureCollection (plain JSON-safe object). */
export function toFeatureCollection(features, { includeStyle = true, indent = true } = {}) {
  const out = features
    .filter((f) => f && f.geometry)
    .map((f) => {
      const props = { ...(f.properties || {}) };
      const style = styleOf(f);
      if (!includeStyle) {
        for (const key of STYLE_KEYS) delete props[key];
      }
      if (includeStyle) {
        // Rebuild the style-derived keys so the file always matches the UI.
        const cleaned = { ...props };
        for (const key of STYLE_KEYS) delete cleaned[key];
        const name = cleaned.name;
        delete cleaned.name;
        Object.assign(props, cleaned, { ...(name !== undefined ? { name } : {}), ...styleToProperties(style, true) });
      }
      // Strip runtime-only fields from the image fill (blob/data URLs can't be shared).
      const image = props['x-image-fill'];
      if (image && typeof image === 'object') {
        if (typeof image.url === 'string' && (image.url.startsWith('blob:') || image.url.startsWith('data:'))) {
          image.url = null;
          image.embedded = false;
        }
        for (const key of Object.keys(image)) if (image[key] === undefined) delete image[key];
      }
      return {
        type: 'Feature',
        ...(f.id ? { id: f.id } : {}),
        properties: props,
        geometry: cloneGeometry(f.geometry),
      };
    });

  return JSON.stringify({ type: 'FeatureCollection', features: out }, null, indent ? 2 : 0);
}

