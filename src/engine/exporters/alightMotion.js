// Split out of the original single-file engine (see legacy/index.html).
// Origin: ALIGHT MOTION XML EXPORTER — verified against AM 5.0.273 sample + AutoTrace
// Facts: position absolute = <location> + path coords; XML order bottom→top;
//        path uses M/L/C only; closed path ends with L to start, not Z; color #aarrggbb.

import L from 'leaflet';
import { S } from '../state.js';
import { escapeXml } from '../../lib/util.js';
import { PREVIEW_COLOR } from '../constants.js';
import { showToast } from '../uiHelpers.js';

// helpers matching AutoTrace verified format
const fmt = n => {
  const s = String(Math.round(n * 1e6) / 1e6);
  return s.includes('.') ? s : s + '.0';
};
const fix6 = n => {
  const [a, b = ''] = String(Math.round(n * 1e6) / 1e6).split('.');
  return a + '.' + (b + '000000').slice(0, 6);
};
// Shared with the keyframed (morph) exporter so both write numbers the same way
export const amFix6 = fix6;
export const amFmt = fmt;

// Use large IDs like AutoTrace (2000000000+) to avoid collision with AM internal counter
export const AM_BASE_ID = 2000000000;

// Common Alight Motion canvases. The animation drawer picks one of these so
// both its geometry fit and the exported scene header use the same dimensions.
export const ALIGHT_VIEWPORTS = Object.freeze({
  '9:16': Object.freeze({ width: 1080, height: 1920, label: '9:16 · Portrait' }),
  '4:5': Object.freeze({ width: 1080, height: 1350, label: '4:5 · Portrait' }),
  '1:1': Object.freeze({ width: 1080, height: 1080, label: '1:1 · Square' }),
  '4:3': Object.freeze({ width: 1440, height: 1080, label: '4:3 · Landscape' }),
  '3:2': Object.freeze({ width: 1620, height: 1080, label: '3:2 · Landscape' }),
  '16:9': Object.freeze({ width: 1920, height: 1080, label: '16:9 · Widescreen' }),
});

// Web Mercator (the projection the map on screen uses) in radians.
const MAX_MERC_LAT = 85.05112878;
const mercX = (lng) => lng * Math.PI / 180;
const mercY = (lat) => {
  const phi = Math.max(-MAX_MERC_LAT, Math.min(MAX_MERC_LAT, lat)) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + phi / 2));
};
const mercLng = (x) => x * 180 / Math.PI;
const mercLat = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

/**
 * Fit a lat/lng bounds box onto the Alight Motion canvas (1080x1920, 9:16
 * vertical composition by default). Returns the projection parameters plus
 * project()/unproject() helpers.
 *
 * `projection` is 'mercator' (default — shapes come out exactly as they look
 * on the map, so they line up with a Web Mercator background in Alight
 * Motion) or 'equirectangular' (the pre-1.4 behaviour: plain degrees scaled by
 * cos(centre latitude)). `scale` is canvas px per degree of longitude at the
 * centre of the fit, `cosLat` the cosine of the centre latitude.
 */
export function makeAlightProjection(bounds, { canvasWidth = 1080, canvasHeight = 1920, margin = 80, projection = 'mercator' } = {}) {
  const maxDrawW = canvasWidth - margin * 2;
  const maxDrawH = canvasHeight - margin * 2;
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const originX = canvasWidth / 2;
  const originY = canvasHeight / 2;

  if (projection === 'equirectangular') {
    const dLng = Math.max((east - west) * cosLat, 0.0001);
    const dLat = Math.max(north - south, 0.0001);
    const scale = Math.min(maxDrawW / dLng, maxDrawH / dLat);
    return {
      projection,
      canvasWidth,
      canvasHeight,
      margin,
      centerLng,
      centerLat,
      cosLat,
      scale,
      originX,
      originY,
      project(lat, lng) {
        return {
          x: originX + (lng - centerLng) * cosLat * scale,
          y: originY - (lat - centerLat) * scale
        };
      },
      unproject(x, y) {
        return {
          lat: centerLat - (y - originY) / scale,
          lng: centerLng + (x - originX) / (cosLat * scale)
        };
      }
    };
  }

  // Mercator: fit the projected box, centre it, keep the aspect ratio.
  const mx0 = mercX(west);
  const mx1 = mercX(east);
  const my0 = mercY(south);
  const my1 = mercY(north);
  const dX = Math.max(mx1 - mx0, 1e-9);
  const dY = Math.max(my1 - my0, 1e-9);
  const k = Math.min(maxDrawW / dX, maxDrawH / dY); // px per radian
  const cX = (mx0 + mx1) / 2;
  const cY = (my0 + my1) / 2;
  return {
    projection: 'mercator',
    canvasWidth,
    canvasHeight,
    margin,
    centerLng,
    centerLat: mercLat(cY),
    cosLat,
    scale: k * Math.PI / 180,
    originX,
    originY,
    project(lat, lng) {
      return {
        x: originX + (mercX(lng) - cX) * k,
        y: originY - (mercY(lat) - cY) * k
      };
    },
    unproject(x, y) {
      return {
        lat: mercLat(cY - (y - originY) / k),
        lng: mercLng(cX + (x - originX) / k)
      };
    }
  };
}

/** Scene wrapper — verified header matches AutoTrace/real export (modifiedTime, amver/ffver, retime attrs). */
export function alightSceneXml(shapesXml, { canvasWidth = 1080, canvasHeight = 1920, totalTime = 5000, title = 'Map Vector Project', mediaXml = '' } = {}) {
  let xml = `<?xml version='1.0' encoding='UTF-8' ?>\n`;
  xml += `<!-- Created by Alight Motion (http://alightmotion.com) -->\n`;
  xml += `<!-- Exported from GeoJSON Studio -->\n`;
  xml += `<scene title="${escapeXml(title)}" width="${canvasWidth}" height="${canvasHeight}" exportWidth="${canvasWidth}" exportHeight="${canvasHeight}" precompose="dynamicResolution" bgcolor="#ff000000" totalTime="${Math.round(totalTime)}" fps="30" modifiedTime="${Date.now()}" amver="1028425" ffver="106" am="com.alightcreative.motion/5.0.273.1028425" amplatform="android" retime="freeze" retimeAdaptFPS="false">\n`;
  xml += mediaXml;
  xml += shapesXml;
  xml += `</scene>`;
  return xml;
}

/** Trigger a browser download for any Blob-backed file. */
export function saveBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const dlLink = document.createElement('a');
  dlLink.href = url;
  dlLink.download = filename;
  document.body.appendChild(dlLink);
  dlLink.click();
  dlLink.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of an XML document. */
export function saveXmlFile(xml, filename) {
  saveBlobFile(new Blob([xml], { type: 'application/xml;charset=utf-8' }), filename);
}

/**
 * One static (non-animated) Alight Motion shape layer for a Leaflet layer.
 * Returns '' when the layer has nothing exportable.
 */
export function buildAlightShapeXml(layer, proj, { id, name, endTime = 5000 }) {
  const { centerLng, centerLat, cosLat, scale, canvasWidth, canvasHeight } = proj;
  const opts = layer.options || {};
  const props = layer.feature && layer.feature.properties || {};
  const label = name || props.name || 'Shape';
  const fillColor = opts.fillColor || props.fill || PREVIEW_COLOR;
  const strokeW = Number(opts.weight || props['stroke-width'] || 0) || 0;
  // Stroke color may differ from fill for polygons
  const strokeColorRaw = opts.color || props.stroke || null;
  const amFillHex = hexToAlightColor(fillColor, 1.0);
  const amStrokeHex = strokeColorRaw ? hexToAlightColor(strokeColorRaw, 1.0) : amFillHex;
  const end = Math.round(endTime);
  let shapesXml = '';

  const project = typeof proj.project === 'function' ? proj.project : null;

  if (layer instanceof L.Polygon) {
    const latlngs = layer.getLatLngs();
    const { pathData, cx, cy } = buildAlightMotionPathData(latlngs, centerLng, centerLat, cosLat, scale, canvasWidth / 2, canvasHeight / 2, project);
    if (pathData) {
      // docs: imported shape has no s attribute; custom outline lives in <path d> (legacy) or <parameter><contour>
      // We follow verified AutoTrace sample which uses <path d> directly with mediaFillMode
      shapesXml += `  <shape id="${id}" label="${escapeXml(label)}" startTime="0" endTime="${end}" fillType="color" mediaFillMode="fill">\n`;
      shapesXml += `    <transform>\n`;
      shapesXml += `      <location value="${fix6(cx)},${fix6(cy)},0.000000" />\n`;
      shapesXml += `    </transform>\n`;
      shapesXml += `    <fillColor value="${amFillHex}" />\n`;
      if (strokeW > 0) {
        // verified edge decoration: attributes directly, not nested <color>/<size>
        shapesXml += `    <path-stroke direction="centered" color="${amStrokeHex}" size="${fix6(strokeW)}" />\n`;
      }
      shapesXml += `    <path d="${pathData}" />\n`;
      shapesXml += `  </shape>\n`;
    }
  } else if (layer instanceof L.Polyline) {
    // Leaflet Polygon is also Polyline, but we handled Polygon first — this is line-only
    const latlngs = layer.getLatLngs();
    const { pathData, cx, cy } = buildAlightMotionLineData(latlngs, centerLng, centerLat, cosLat, scale, canvasWidth / 2, canvasHeight / 2, project);
    const lineW = strokeW > 0 ? strokeW : 3;
    const lineColor = hexToAlightColor(opts.color || props.stroke || fillColor, 1.0);
    if (pathData) {
      shapesXml += `  <shape id="${id}" label="${escapeXml(label)}" startTime="0" endTime="${end}" fillType="none" mediaFillMode="fill">\n`;
      shapesXml += `    <transform>\n`;
      shapesXml += `      <location value="${fix6(cx)},${fix6(cy)},0.000000" />\n`;
      shapesXml += `    </transform>\n`;
      // For lines, stroke is the visible element; no fillColor needed when fillType none but we emit stroke
      shapesXml += `    <path-stroke direction="centered" color="${lineColor}" size="${fix6(lineW)}" />\n`;
      shapesXml += `    <path d="${pathData}" />\n`;
      shapesXml += `  </shape>\n`;
    }
  } else if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
    // Export point as small diamond/circle shape centered at point location
    let latlng = null;
    if (typeof layer.getLatLng === 'function') latlng = layer.getLatLng();
    if (latlng) {
      const pt = project
        ? project(latlng.lat, latlng.lng)
        : { x: canvasWidth / 2 + (latlng.lng - centerLng) * cosLat * scale, y: canvasHeight / 2 - (latlng.lat - centerLat) * scale };
      const x = pt.x;
      const y = pt.y;
      // small 28px square centered at marker, relative path around 0,0 with location at absolute x,y
      const r = 14;
      // Use fmt for relative coords
      const pathData = `M ${fmt(-r)} ${fmt(-r)}L ${fmt(r)} ${fmt(-r)}L ${fmt(r)} ${fmt(r)}L ${fmt(-r)} ${fmt(r)}L ${fmt(-r)} ${fmt(-r)}`;
      shapesXml += `  <shape id="${id}" label="${escapeXml(label)}" startTime="0" endTime="${end}" fillType="color" mediaFillMode="fill">\n`;
      shapesXml += `    <transform>\n`;
      shapesXml += `      <location value="${fix6(x)},${fix6(y)},0.000000" />\n`;
      shapesXml += `    </transform>\n`;
      shapesXml += `    <fillColor value="${amFillHex}" />\n`;
      shapesXml += `    <path d="${pathData}" />\n`;
      shapesXml += `  </shape>\n`;
    }
  }
  return shapesXml;
}

// ================= ALIGHT MOTION XML EXPORTER =================
export function downloadAlightMotionXML() {
  const layers = S.drawnItems.getLayers();
  if (layers.length === 0) {
    showToast("No shapes to export into Alight Motion!");
    return;
  }
  showToast("Generating Alight Motion XML Project...");

  // Canvas dimensions: 1080x1920 (9:16 vertical composition)
  const proj = makeAlightProjection(S.drawnItems.getBounds());
  let shapesXml = '';
  let shapeCounter = 0;
  let counter = 0;
  S.drawnItems.eachLayer(layer => {
    counter++;
    const props = layer.feature && layer.feature.properties || {};
    const name = props.name || `Shape_${counter}`;
    // ids are only consumed by layers that actually produce output, like before
    const xml = buildAlightShapeXml(layer, proj, { id: AM_BASE_ID + shapeCounter + 1, name, endTime: 5000 });
    if (xml) {
      shapeCounter++;
      shapesXml += xml;
    }
  });
  const xml = alightSceneXml(shapesXml, { canvasWidth: proj.canvasWidth, canvasHeight: proj.canvasHeight, totalTime: 5000 });
  saveXmlFile(xml, `alightmotion_map_${Date.now()}.xml`);
  showToast("Alight Motion Project .xml downloaded!");
}

// `project(lat, lng) → {x, y}` overrides the legacy equirectangular formula
// (the 7-argument form is kept byte-for-byte for the parity tests).
export function buildAlightMotionPathData(latlngs, centerLng, centerLat, cosLat, scale, originX, originY, project = null) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return {
    pathData: '',
    cx: originX,
    cy: originY
  };
  const allPoints = [];
  const rings = [];
  const toXY = project
    ? (ll) => project(ll.lat, ll.lng)
    : (ll) => ({ x: originX + (ll.lng - centerLng) * cosLat * scale, y: originY - (ll.lat - centerLat) * scale });
  function processRing(ring) {
    const pts = [];
    ring.forEach(ll => {
      const { x, y } = toXY(ll);
      pts.push({ x, y });
      allPoints.push({ x, y });
    });
    if (pts.length > 0) rings.push(pts);
  }
  if (Array.isArray(latlngs[0])) {
    latlngs.forEach(ring => {
      if (Array.isArray(ring) && ring.length > 0 && Array.isArray(ring[0])) {
        ring.forEach(subring => processRing(subring));
      } else {
        processRing(ring);
      }
    });
  } else {
    processRing(latlngs);
  }
  if (allPoints.length === 0) return {
    pathData: '',
    cx: originX,
    cy: originY
  };
  let sumX = 0,
    sumY = 0;
  allPoints.forEach(p => {
    sumX += p.x;
    sumY += p.y;
  });
  const cx = sumX / allPoints.length;
  const cy = sumY / allPoints.length;
  // Build path: M x y L x y ... L x0 y0 for each closed ring (no Z, per verified format)
  let d = '';
  rings.forEach(ring => {
    let r = ring;
    if (r.length > 1 && Math.abs(r[0].x - r[r.length - 1].x) < 1e-9 && Math.abs(r[0].y - r[r.length - 1].y) < 1e-9) r = r.slice(0, -1);
    let startRx = null, startRy = null;
    r.forEach((p, i) => {
      const rx = fmt(p.x - cx);
      const ry = fmt(p.y - cy);
      if (i === 0) {
        d += `M ${rx} ${ry}`;
        startRx = rx;
        startRy = ry;
      } else {
        d += `L ${rx} ${ry}`;
      }
    });
    if (startRx !== null) d += `L ${startRx} ${startRy}`;
  });
  return {
    pathData: d.trim(),
    cx,
    cy
  };
}

export function buildAlightMotionLineData(latlngs, centerLng, centerLat, cosLat, scale, originX, originY, project = null) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return {
    pathData: '',
    cx: originX,
    cy: originY
  };
  // Support both LineString and MultiLineString: normalize to array of segments
  let segments = [];
  if (latlngs.length > 0 && Array.isArray(latlngs[0])) {
    // Check if latlngs[0][0] is LatLng (multi) or number? leaflet uses LatLng objects
    const first = latlngs[0];
    const isMulti = first.length > 0 && typeof first[0] === 'object' && first[0] !== null && 'lat' in first[0];
    if (isMulti) segments = latlngs;
    else {
      // Single ring but wrapped once (e.g. from polygon-like call) — treat as one segment with possible nesting
      const flat = latlngs.flat(2);
      segments = [flat.filter(p => p && typeof p === 'object' && 'lat' in p)];
    }
  } else {
    segments = [latlngs];
  }
  const transformedSegments = segments.map(seg => seg.map(ll => {
    if (project) {
      const p = project(ll.lat, ll.lng);
      return { x: p.x, y: p.y };
    }
    const x = originX + (ll.lng - centerLng) * cosLat * scale;
    const y = originY - (ll.lat - centerLat) * scale;
    return { x, y };
  }));
  const allPoints = transformedSegments.flat();
  if (allPoints.length === 0) return {
    pathData: '',
    cx: originX,
    cy: originY
  };
  let sumX = 0,
    sumY = 0;
  allPoints.forEach(p => {
    sumX += p.x;
    sumY += p.y;
  });
  const cx = sumX / allPoints.length;
  const cy = sumY / allPoints.length;
  let d = '';
  transformedSegments.forEach(seg => {
    seg.forEach((p, i) => {
      const rx = fmt(p.x - cx);
      const ry = fmt(p.y - cy);
      if (i === 0) d += `M ${rx} ${ry}`;
      else d += `L ${rx} ${ry}`;
    });
  });
  return {
    pathData: d.trim(),
    cx,
    cy
  };
}

export function hexToAlightColor(hex, opacity = 1.0) {
  let c = String(hex).replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) c = '10b981';
  const a = Math.round(Math.min(Math.max(opacity, 0), 1) * 255).toString(16).padStart(2, '0');
  return `#${a}${c}`.toLowerCase();
}

// ================= SVG VECTOR EXPORTER =================
