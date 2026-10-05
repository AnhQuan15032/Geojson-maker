// Split out of the original single-file engine (see legacy/index.html).
// Origin: XML / KML GEOSPATIAL EXPORTER

import { S } from '../state.js';
import { escapeXml } from '../../lib/util.js';
import { PREVIEW_COLOR } from '../constants.js';
import { showToast } from '../uiHelpers.js';

// ================= XML / KML GEOSPATIAL EXPORTER =================
export function downloadXML() {
  const data = S.drawnItems.toGeoJSON();
  if (!data.features || data.features.length === 0) {
    showToast("No shapes to export as XML!");
    return;
  }
  showToast("Generating Geospatial XML (KML)...");
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<kml xmlns="http://www.opengis.net/kml/2.2">\n`;
  xml += `  <Document>\n`;
  xml += `    <name>GeoJSON Studio XML Export</name>\n`;
  xml += `    <description>Exported geometries with unique colors, opaque fills, no borders</description>\n\n`;
  data.features.forEach((f, idx) => {
    const p = f.properties || {};
    const name = p.name || `Feature_${idx + 1}`;
    const fillHex = p.fill || PREVIEW_COLOR;
    const kmlFill = hexToKmlColor(fillHex, 1.0);
    xml += `    <Style id="style_${idx}">\n`;
    xml += `      <LineStyle>\n`;
    xml += `        <color>ffffffff</color>\n`;
    xml += `        <width>0</width>\n`;
    xml += `      </LineStyle>\n`;
    xml += `      <PolyStyle>\n`;
    xml += `        <color>${kmlFill}</color>\n`;
    xml += `        <fill>1</fill>\n`;
    xml += `        <outline>0</outline>\n`;
    xml += `      </PolyStyle>\n`;
    xml += `    </Style>\n`;
    xml += `    <Placemark>\n`;
    xml += `      <name>${escapeXml(name)}</name>\n`;
    xml += `      <styleUrl>#style_${idx}</styleUrl>\n`;
    xml += `      <ExtendedData>\n`;
    xml += `        <Data name="fill"><value>${escapeXml(fillHex)}</value></Data>\n`;
    xml += `        <Data name="fill-opacity"><value>1</value></Data>\n`;
    xml += `        <Data name="stroke-width"><value>0</value></Data>\n`;
    xml += `      </ExtendedData>\n`;
    if (f.geometry.type === 'Polygon') {
      xml += `      <Polygon>\n`;
      xml += `        <outerBoundaryIs>\n`;
      xml += `          <LinearRing>\n`;
      xml += `            <coordinates>\n              ${f.geometry.coordinates[0].map(c => `${c[0]},${c[1]},0`).join('\n              ')}\n            </coordinates>\n`;
      xml += `          </LinearRing>\n`;
      xml += `        </outerBoundaryIs>\n`;
      xml += `      </Polygon>\n`;
    } else if (f.geometry.type === 'MultiPolygon') {
      xml += `      <MultiGeometry>\n`;
      f.geometry.coordinates.forEach(polyCoords => {
        xml += `        <Polygon>\n`;
        xml += `          <outerBoundaryIs>\n`;
        xml += `            <LinearRing>\n`;
        xml += `              <coordinates>\n                ${polyCoords[0].map(c => `${c[0]},${c[1]},0`).join('\n                ')}\n              </coordinates>\n`;
        xml += `            </LinearRing>\n`;
        xml += `          </outerBoundaryIs>\n`;
        xml += `        </Polygon>\n`;
      });
      xml += `      </MultiGeometry>\n`;
    } else if (f.geometry.type === 'LineString') {
      xml += `      <LineString>\n`;
      xml += `        <coordinates>\n          ${f.geometry.coordinates.map(c => `${c[0]},${c[1]},0`).join('\n          ')}\n        </coordinates>\n`;
      xml += `      </LineString>\n`;
    } else if (f.geometry.type === 'Point') {
      xml += `      <Point>\n`;
      xml += `        <coordinates>${f.geometry.coordinates[0]},${f.geometry.coordinates[1]},0</coordinates>\n`;
      xml += `      </Point>\n`;
    }
    xml += `    </Placemark>\n\n`;
  });
  xml += `  </Document>\n`;
  xml += `</kml>`;
  const blob = new Blob([xml], {
    type: "application/xml;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const dlLink = document.createElement('a');
  dlLink.href = url;
  dlLink.download = `map_data_${Date.now()}.xml`;
  document.body.appendChild(dlLink);
  dlLink.click();
  dlLink.remove();
  URL.revokeObjectURL(url);
  showToast("XML geospatial file downloaded!");
}

export function hexToKmlColor(hex, alpha = 1.0) {
  let c = String(hex).replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return 'ff10b981';
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  const r = c.substring(0, 2);
  const g = c.substring(2, 4);
  const b = c.substring(4, 6);
  return `${a}${b}${g}${r}`;
}
