/**
 * Web-Mercator projection + geometry helpers.
 *
 * Deliberately free of any DOM/Canvas references so the maths can be
 * exercised directly in Node (see tests/logic.test.mjs).
 *
 * Coordinates are GeoJSON style: [longitude, latitude].
 */

export const MAX_LAT = 85.0511287798066;
export const EARTH_RADIUS = 6378137;                 // metres (WGS84 semi-major)
export const EARTH_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS;
export const TILE_SIZE = 256;

export const clampLat = (lat) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
export const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

/* ------------------------------------------------------------ projection */

/** Fractional world X (0..1) for a longitude. */
export function lngToUnitX(lng) { return (lng + 180) / 360; }

/** Fractional world Y (0..1) for a latitude. */
export function latToUnitY(lat) {
  const s = Math.sin(clampLat(lat) * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export function unitXToLng(x) { return x * 360 - 180; }

export function unitYToLat(y) {
  const n = Math.PI - 2 * Math.PI * Math.max(1e-9, Math.min(1 - 1e-9, y));
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Ground resolution in metres per CSS pixel at a given zoom/latitude. */
export function metersPerPixel(zoom, lat = 0) {
  return EARTH_CIRCUMFERENCE * Math.cos(lat * Math.PI / 180) / (TILE_SIZE * 2 ** zoom);
}

/**
 * A camera: { center: {lng,lat}, zoom } plus a viewport size in CSS pixels.
 * `matrix()` returns the pieces the renderer needs to go lng/lat -> screen px.
 */
export function cameraMatrix(camera, width, height) {
  const scale = TILE_SIZE * 2 ** camera.zoom;      // world size in CSS px
  const ox = width / 2 - lngToUnitX(camera.center.lng) * scale;
  const oy = height / 2 - latToUnitY(camera.center.lat) * scale;
  return { scale, ox, oy, width, height };
}

export function projectPoint(m, lng, lat) {
  return { x: lngToUnitX(lng) * m.scale + m.ox, y: latToUnitY(lat) * m.scale + m.oy };
}

export function unprojectPoint(m, x, y) {
  return {
    lng: unitXToLng((x - m.ox) / m.scale),
    lat: unitYToLat((y - m.oy) / m.scale),
  };
}

/**
 * Same as projectPoint but snaps the point to the world copy nearest the
 * camera centre, so shapes near the antimeridian still land on screen.
 */
export function projectWrapped(m, lng, lat, centerLng) {
  const world = m.scale;
  let x = lngToUnitX(lng) * world;
  const cx = lngToUnitX(centerLng) * world;
  x += Math.round((cx - x) / world) * world;
  return { x: x + m.ox, y: latToUnitY(lat) * world + m.oy };
}

/* ------------------------------------------------------------- geometry */

/** Walk every [lng,lat] position of any GeoJSON geometry. */
export function eachPosition(geometry, fn) {
  if (!geometry || !geometry.coordinates) return;
  const walk = (node, depth) => {
    if (!Array.isArray(node)) return;
    if (depth === 0) {
      if (typeof node[0] === 'number' && typeof node[1] === 'number') fn(node[0], node[1]);
      return;
    }
    for (const child of node) walk(child, depth - 1);
  };
  const depth = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 }[geometry.type];
  if (depth === undefined) return;
  walk(geometry.coordinates, depth);
}

export function bboxOfGeometry(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  eachPosition(geometry, (lng, lat) => {
    if (lng < minX) minX = lng;
    if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  });
  if (!isFinite(minX)) return null;
  return { minLng: minX, minLat: minY, maxLng: maxX, maxLat: maxY };
}

export function bboxOfFeatures(features) {
  let out = null;
  for (const f of features) {
    const b = bboxOfGeometry(f.geometry);
    if (!b) continue;
    out = out ? {
      minLng: Math.min(out.minLng, b.minLng),
      minLat: Math.min(out.minLat, b.minLat),
      maxLng: Math.max(out.maxLng, b.maxLng),
      maxLat: Math.max(out.maxLat, b.maxLat),
    } : b;
  }
  return out;
}

export function centerOfBBox(b) {
  return { lng: (b.minLng + b.maxLng) / 2, lat: (b.minLat + b.maxLat) / 2 };
}

/** Great-circle distance in metres. */
export function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const la1 = a[1] * toRad;
  const la2 = b[1] * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(positions) {
  let total = 0;
  for (let i = 1; i < positions.length; i++) total += haversine(positions[i - 1], positions[i]);
  return total;
}

/** Spherical polygon area in m² (rings may be clockwise or counter-clockwise). */
export function ringArea(ring) {
  if (!ring || ring.length < 3) return 0;
  const toRad = Math.PI / 180;
  let total = 0;
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const [lng1, lat1] = ring[j];
    const [lng2, lat2] = ring[i];
    total += (lng2 - lng1) * toRad * (2 + Math.sin(lat1 * toRad) + Math.sin(lat2 * toRad));
  }
  return Math.abs(total * EARTH_RADIUS * EARTH_RADIUS / 2);
}

export function polygonArea(rings) {
  if (!rings || !rings.length) return 0;
  let area = ringArea(rings[0]);
  for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);
  return Math.abs(area);
}

export function geometryLength(geometry) {
  if (!geometry) return 0;
  const { type, coordinates } = geometry;
  if (type === 'LineString') return lineLength(coordinates);
  if (type === 'MultiLineString') return coordinates.reduce((s, r) => s + lineLength(r), 0);
  if (type === 'Polygon') return coordinates.reduce((s, r) => s + lineLength(r), 0);
  if (type === 'MultiPolygon') return coordinates.reduce((s, p) => s + geometryLength({ type: 'Polygon', coordinates: p }), 0);
  return 0;
}

export function geometryArea(geometry) {
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((s, p) => s + polygonArea(p), 0);
  }
  return 0;
}

/** Screen-space centroid used for labels / pattern anchoring. */
export function polygonCentroid(points) {
  if (!points.length) return null;
  if (points.length < 3) {
    return { x: points[0].x, y: points[0].y };
  }
  let area = 0, cx = 0, cy = 0;
  for (let i = 0, len = points.length, j = len - 1; i < len; j = i++) {
    const cross = points[j].x * points[i].y - points[i].x * points[j].y;
    area += cross;
    cx += (points[j].x + points[i].x) * cross;
    cy += (points[j].y + points[i].y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-9) {
    // Degenerate: fall back to the vertex average.
    const sx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const sy = points.reduce((s, p) => s + p.y, 0) / points.length;
    return { x: sx, y: sy };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Point in a screen-space ring (even/odd rule). */
export function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y;
    const xj = ring[j].x, yj = ring[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point in a polygon given [outerRing, ...holes] in screen space. */
export function pointInPolygonRings(pt, rings) {
  if (!rings.length || !pointInRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(pt, rings[i])) return false;
  return true;
}

export function distToSegmentSq(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2;
}

export function distToPolylineSq(p, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distToSegmentSq(p, points[i - 1], points[i]));
  }
  return best;
}

/**
 * Signed shoelace area of a lng/lat ring: positive when counter-clockwise.
 * Used to orient polygon rings, which is what makes holes render as holes
 * (canvas fills use the non-zero winding rule) and keeps exports aligned with
 * RFC 7946 §3.5.
 */
export function ringSignedArea(ring) {
  let sum = 0;
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

export const isCounterClockwise = (ring) => ringSignedArea(ring) > 0;

/**
 * Orient a polygon geometry in place: exterior rings counter-clockwise,
 * interior rings (holes) clockwise.
 */
export function orientRings(geometry) {
  if (!geometry) return geometry;
  const fixPolygon = (rings) => {
    if (!Array.isArray(rings)) return;
    rings.forEach((ring, index) => {
      if (!Array.isArray(ring) || ring.length < 4) return;
      const ccw = ringSignedArea(ring) > 0;
      if (ccw !== (index === 0)) ring.reverse();
    });
  };
  if (geometry.type === 'Polygon') fixPolygon(geometry.coordinates);
  else if (geometry.type === 'MultiPolygon') (geometry.coordinates || []).forEach(fixPolygon);
  return geometry;
}

export function rectPositions(a, b) {
  const minLng = Math.min(a.lng, b.lng), maxLng = Math.max(a.lng, b.lng);
  const minLat = Math.min(a.lat, b.lat), maxLat = Math.max(a.lat, b.lat);
  return [
    [
      [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
    ],
  ];
}
