// Split out of the original single-file engine (see legacy/index.html).
// Origin: SVG VECTOR EXPORTER

import L from 'leaflet';
import { S } from '../state.js';
import { escapeXml } from '../../lib/util.js';
import { PREVIEW_COLOR } from '../constants.js';
import { showToast } from '../uiHelpers.js';

// ================= SVG VECTOR EXPORTER =================
export function downloadSVG() {
  const layers = S.drawnItems.getLayers();
  if (layers.length === 0) {
    showToast("Please draw at least one shape to export as SVG!");
    return;
  }
  showToast("Generating Scalable Vector (SVG)...");
  const bounds = S.drawnItems.getBounds();
  const nw = S.map.latLngToContainerPoint(bounds.getNorthWest());
  const se = S.map.latLngToContainerPoint(bounds.getSouthEast());
  const pad = 24;
  const minX = Math.min(nw.x, se.x) - pad;
  const minY = Math.min(nw.y, se.y) - pad;
  const maxX = Math.max(nw.x, se.x) + pad;
  const maxY = Math.max(nw.y, se.y) + pad;
  const width = Math.max(maxX - minX, 10);
  const height = Math.max(maxY - minY, 10);
  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svgContent += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
  svgContent += `  <defs/>\n`;
  let counter = 0;
  S.drawnItems.eachLayer(layer => {
    counter++;
    const idx = counter;
    const opts = layer.options || {};
    const props = layer.feature && layer.feature.properties || {};
    const fillColor = opts.fillColor || props.fill || PREVIEW_COLOR;
    const strokeColor = opts.color || props.stroke || fillColor;
    const strokeWidth = Number(opts.weight || props['stroke-width'] || 0) || 0;
    const name = props.name || `Shape_${idx}`;
    const strokeAttr = strokeWidth > 0 ? `stroke="${strokeColor}" stroke-width="${strokeWidth}"` : `stroke="none"`;
    if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs();
      const pathData = buildSvgPathData(latlngs, minX, minY);
      svgContent += `  <path id="${escapeXml(name)}" d="${pathData}" fill="${fillColor}" fill-opacity="1" ${strokeAttr} fill-rule="evenodd" stroke-linejoin="round" stroke-linecap="round"/>\n`;
    } else if (layer instanceof L.Polyline) {
      const latlngs = layer.getLatLngs();
      const pathData = buildSvgLineData(latlngs, minX, minY);
      svgContent += `  <path id="${escapeXml(name)}" d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth > 0 ? strokeWidth : 3}" stroke-linejoin="round" stroke-linecap="round"/>\n`;
    } else if (layer instanceof L.Marker) {
      const pt = S.map.latLngToContainerPoint(layer.getLatLng());
      const x = (pt.x - minX).toFixed(2);
      const y = (pt.y - minY).toFixed(2);
      svgContent += `  <circle id="${escapeXml(name)}" cx="${x}" cy="${y}" r="6" fill="${fillColor}"/>\n`;
    }
  });
  svgContent += `</svg>`;
  const blob = new Blob([svgContent], {
    type: "image/svg+xml;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const dlLink = document.createElement('a');
  dlLink.href = url;
  dlLink.download = `map_vector_${Date.now()}.svg`;
  document.body.appendChild(dlLink);
  dlLink.click();
  dlLink.remove();
  URL.revokeObjectURL(url);
  showToast("SVG vector file downloaded!");
}

export function buildSvgPathData(latlngs, offsetX, offsetY) {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return '';
  let d = '';
  if (Array.isArray(latlngs[0])) {
    latlngs.forEach(ring => {
      if (Array.isArray(ring) && ring.length > 0 && Array.isArray(ring[0])) {
        ring.forEach(subring => {
          d += buildRingSvg(subring, offsetX, offsetY);
        });
      } else {
        d += buildRingSvg(ring, offsetX, offsetY);
      }
    });
  } else {
    d += buildRingSvg(latlngs, offsetX, offsetY);
  }
  return d.trim();
}

export function buildRingSvg(ring, offsetX, offsetY) {
  let d = '';
  ring.forEach((ll, i) => {
    const pt = S.map.latLngToContainerPoint(ll);
    const x = (pt.x - offsetX).toFixed(2);
    const y = (pt.y - offsetY).toFixed(2);
    if (i === 0) d += `M ${x} ${y} `;else d += `L ${x} ${y} `;
  });
  d += 'Z ';
  return d;
}

export function buildSvgLineData(latlngs, offsetX, offsetY) {
  let d = '';
  const flat = Array.isArray(latlngs[0]) ? latlngs.flat(3) : latlngs;
  flat.forEach((ll, i) => {
    const pt = S.map.latLngToContainerPoint(ll);
    const x = (pt.x - offsetX).toFixed(2);
    const y = (pt.y - offsetY).toFixed(2);
    if (i === 0) d += `M ${x} ${y} `;else d += `L ${x} ${y} `;
  });
  return d.trim();
}

// ================= XML / KML GEOSPATIAL EXPORTER =================
