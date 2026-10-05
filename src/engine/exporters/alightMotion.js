// Split out of the original single-file engine (see legacy/index.html).
// Origin: ALIGHT MOTION XML EXPORTER

import L from 'leaflet';
import { S } from '../state.js';
import { escapeXml } from '../../lib/util.js';
import { PREVIEW_COLOR } from '../constants.js';
import { showToast } from '../uiHelpers.js';

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
  let shapeIndex = 1000;
  let counter = 0;
  S.drawnItems.eachLayer(layer => {
    counter++;
    const idx = counter;
    const opts = layer.options || {};
    const props = layer.feature && layer.feature.properties || {};
    const name = props.name || `Shape_${idx}`;
    const fillColor = opts.fillColor || props.fill || PREVIEW_COLOR;
    const strokeW = Number(opts.weight || props['stroke-width'] || 0) || 0;
    const amFillHex = hexToAlightColor(fillColor, 1.0);
    if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs();
      const {
        pathData,
        cx,
        cy
      } = buildAlightMotionPathData(latlngs, centerLng, centerLat, cosLat, scale, canvasWidth / 2, canvasHeight / 2);
      if (pathData) {
        shapeIndex++;
        shapesXml += `  <shape id="${shapeIndex}" label="${escapeXml(name)}" startTime="0" endTime="5000" fillType="color" s=".path">\n`;
        shapesXml += `    <transform>\n`;
        shapesXml += `      <location value="${cx.toFixed(6)},${cy.toFixed(6)},0.000000" />\n`;
        shapesXml += `      <scale value="1.000000,1.000000" />\n`;
        shapesXml += `    </transform>\n`;
        shapesXml += `    <fillColor value="${amFillHex}" />\n`;
        if (strokeW > 0) {
          shapesXml += `    <path-stroke direction="centered" end-size="1.500000">\n`;
          shapesXml += `      <color value="${amFillHex}" />\n`;
          shapesXml += `      <size value="${strokeW.toFixed(6)}" />\n`;
          shapesXml += `    </path-stroke>\n`;
        }
        shapesXml += `    <path d="${pathData}" />\n`;
        shapesXml += `  </shape>\n`;
      }
    } else if (layer instanceof L.Polyline) {
      const latlngs = layer.getLatLngs();
      const {
        pathData,
        cx,
        cy
      } = buildAlightMotionLineData(latlngs, centerLng, centerLat, cosLat, scale, canvasWidth / 2, canvasHeight / 2);
      const lineW = strokeW > 0 ? strokeW : 3;
      const lineColor = hexToAlightColor(opts.color || props.stroke || fillColor, 1.0);
      if (pathData) {
        shapeIndex++;
        shapesXml += `  <shape id="${shapeIndex}" label="${escapeXml(name)}" startTime="0" endTime="5000" fillType="none" s=".path">\n`;
        shapesXml += `    <transform>\n`;
        shapesXml += `      <location value="${cx.toFixed(6)},${cy.toFixed(6)},0.000000" />\n`;
        shapesXml += `      <scale value="1.000000,1.000000" />\n`;
        shapesXml += `    </transform>\n`;
        shapesXml += `    <path-stroke direction="centered" end-size="1.500000">\n`;
        shapesXml += `      <color value="${lineColor}" />\n`;
        shapesXml += `      <size value="${lineW.toFixed(6)}" />\n`;
        shapesXml += `    </path-stroke>\n`;
        shapesXml += `    <path d="${pathData}" />\n`;
        shapesXml += `  </shape>\n`;
      }
    }
  });
  let xml = `<?xml version='1.0' encoding='UTF-8' ?>\n`;
  xml += `<!-- Created by Alight Motion (http://alightmotion.com) -->\n`;
  xml += `<!-- Exported from GeoJSON Studio -->\n`;
  xml += `<scene title="Map Vector Project" width="${canvasWidth}" height="${canvasHeight}" exportWidth="${canvasWidth}" exportHeight="${canvasHeight}" precompose="dynamicResolution" bgcolor="#ff000000" totalTime="5000" fps="30" amver="1002592" ffver="106" am="com.alightcreative.motion/5.0.0" amplatform="android" retime="freeze" retimeAdaptFPS="false">\n`;
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
      pts.push({
        x,
        y
      });
      allPoints.push({
        x,
        y
      });
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
  let d = '';
  rings.forEach(ring => {
    ring.forEach((p, i) => {
      const rx = (p.x - cx).toFixed(2);
      const ry = (p.y - cy).toFixed(2);
      if (i === 0) d += `M ${rx} ${ry} `;else d += `L ${rx} ${ry} `;
    });
    d += 'Z ';
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
  const flat = Array.isArray(latlngs[0]) ? latlngs.flat(3) : latlngs;
  const allPoints = [];
  flat.forEach(ll => {
    const x = originX + (ll.lng - centerLng) * cosLat * scale;
    const y = originY - (ll.lat - centerLat) * scale;
    allPoints.push({
      x,
      y
    });
  });
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
  allPoints.forEach((p, i) => {
    const rx = (p.x - cx).toFixed(2);
    const ry = (p.y - cy).toFixed(2);
    if (i === 0) d += `M ${rx} ${ry} `;else d += `L ${rx} ${ry} `;
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
