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

// ================= ALIGHT MOTION XML EXPORTER =================
export function downloadAlightMotionXML() {
  const layers = S.drawnItems.getLayers();
  if (layers.length === 0) {
    showToast("No shapes to export into Alight Motion!");
    return;
  }
  showToast("Generating Alight Motion XML Project...");

  // Canvas dimensions: 1080x1920 (9:16 vertical composition)
  const canvasWidth = 1080;
  const canvasHeight = 1920;
  const margin = 80;
  const maxDrawW = canvasWidth - margin * 2;
  const maxDrawH = canvasHeight - margin * 2;
  const bounds = S.drawnItems.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const dLng = Math.max((east - west) * cosLat, 0.0001);
  const dLat = Math.max(north - south, 0.0001);
  const scale = Math.min(maxDrawW / dLng, maxDrawH / dLat);
  let shapesXml = '';
  // Use large IDs like AutoTrace (2000000000+) to avoid collision with AM internal counter
  const baseId = 2000000000;
  let shapeCounter = 0;
  let counter = 0;
  S.drawnItems.eachLayer(layer => {
    counter++;
    const idx = counter;
    const opts = layer.options || {};
    const props = layer.feature && layer.feature.properties || {};
    const name = props.name || `Shape_${idx}`;
    const fillColor = opts.fillColor || props.fill || PREVIEW_COLOR;
    const strokeW = Number(opts.weight || props['stroke-width'] || 0) || 0;
    // Stroke color may differ from fill for polygons
    const strokeColorRaw = opts.color || props.stroke || null;
    const amFillHex = hexToAlightColor(fillColor, 1.0);
    const amStrokeHex = strokeColorRaw ? hexToAlightColor(strokeColorRaw, 1.0) : amFillHex;

    if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs();
      const { pathData, cx, cy } = buildAlightMotionPathData(latlngs, centerLng, centerLat, cosLat, scale, canvasWidth / 2, canvasHeight / 2);
      if (pathData) {
        shapeCounter++;
        const id = baseId + shapeCounter;
        // docs: imported shape has no s attribute; custom outline lives in <path d> (legacy) or <parameter><contour>
        // We follow verified AutoTrace sample which uses <path d> directly with mediaFillMode
        shapesXml += `  <shape id="${id}" label="${escapeXml(name)}" startTime="0" endTime="5000" fillType="color" mediaFillMode="fill">\n`;
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
      const { pathData, cx, cy } = buildAlightMotionLineData(latlngs, centerLng, centerLat, cosLat, scale, canvasWidth / 2, canvasHeight / 2);
      const lineW = strokeW > 0 ? strokeW : 3;
      const lineColor = hexToAlightColor(opts.color || props.stroke || fillColor, 1.0);
      if (pathData) {
        shapeCounter++;
        const id = baseId + shapeCounter;
        shapesXml += `  <shape id="${id}" label="${escapeXml(name)}" startTime="0" endTime="5000" fillType="none" mediaFillMode="fill">\n`;
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
        const x = canvasWidth / 2 + (latlng.lng - centerLng) * cosLat * scale;
        const y = canvasHeight / 2 - (latlng.lat - centerLat) * scale;
        // small 28px square centered at marker, relative path around 0,0 with location at absolute x,y
        const r = 14;
        // Use fmt for relative coords
        const pathData = `M ${fmt(-r)} ${fmt(-r)}L ${fmt(r)} ${fmt(-r)}L ${fmt(r)} ${fmt(r)}L ${fmt(-r)} ${fmt(r)}L ${fmt(-r)} ${fmt(-r)}`;
        shapeCounter++;
        const id = baseId + shapeCounter;
        shapesXml += `  <shape id="${id}" label="${escapeXml(name)}" startTime="0" endTime="5000" fillType="color" mediaFillMode="fill">\n`;
        shapesXml += `    <transform>\n`;
        shapesXml += `      <location value="${fix6(x)},${fix6(y)},0.000000" />\n`;
        shapesXml += `    </transform>\n`;
        shapesXml += `    <fillColor value="${amFillHex}" />\n`;
        shapesXml += `    <path d="${pathData}" />\n`;
        shapesXml += `  </shape>\n`;
      }
    }
  });
  // Verified header matches AutoTrace/real export: includes modifiedTime, amver/ffver, no retime extras missing
  let xml = `<?xml version='1.0' encoding='UTF-8' ?>\n`;
  xml += `<!-- Created by Alight Motion (http://alightmotion.com) -->\n`;
  xml += `<!-- Exported from GeoJSON Studio -->\n`;
  xml += `<scene title="Map Vector Project" width="${canvasWidth}" height="${canvasHeight}" exportWidth="${canvasWidth}" exportHeight="${canvasHeight}" precompose="dynamicResolution" bgcolor="#ff000000" totalTime="5000" fps="30" modifiedTime="${Date.now()}" amver="1028425" ffver="106" am="com.alightcreative.motion/5.0.273.1028425" amplatform="android" retime="freeze" retimeAdaptFPS="false">\n`;
  xml += shapesXml;
  xml += `</scene>`;
  const blob = new Blob([xml], {
    type: "application/xml;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const dlLink = document.createElement('a');
  dlLink.href = url;
  dlLink.download = `alightmotion_map_${Date.now()}.xml`;
  document.body.appendChild(dlLink);
  dlLink.click();
  dlLink.remove();
  URL.revokeObjectURL(url);
  showToast("Alight Motion Project .xml downloaded!");
}

export function buildAlightMotionPathData(latlngs, centerLng, centerLat, cosLat, scale, originX, originY) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return {
    pathData: '',
    cx: originX,
    cy: originY
  };
  const allPoints = [];
  const rings = [];
  function processRing(ring) {
    const pts = [];
    ring.forEach(ll => {
      const x = originX + (ll.lng - centerLng) * cosLat * scale;
      const y = originY - (ll.lat - centerLat) * scale;
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

export function buildAlightMotionLineData(latlngs, centerLng, centerLat, cosLat, scale, originX, originY) {
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
