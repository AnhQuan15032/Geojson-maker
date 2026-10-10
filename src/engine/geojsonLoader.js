// Split out of the original single-file engine (see legacy/index.html).
// Origin: GEOJSON LOADER

import L from 'leaflet';
import { S } from './state.js';
import { nextUniqueColor, setupLayerProperties } from './colors.js';
import { onFeatureClick } from './exporters/geojson.js';
import { updateStats } from './quickTools.js';
import { populateStyleDrawer } from './styleInspector.js';
import { showToast } from './uiHelpers.js';

// ================= GEOJSON LOADER =================
export function importGeoJSONFile(eOrFile) {
  // storage deleted — allow both event (input change) and direct File
  let file = null;
  if (eOrFile && eOrFile.target && eOrFile.target.files) file = eOrFile.target.files[0];
  else if (eOrFile instanceof File) file = eOrFile;
  else if (Array.isArray(eOrFile) && eOrFile[0] instanceof File) file = eOrFile[0];
  else if (eOrFile && eOrFile.files) file = eOrFile.files[0];
  // also support being called with no args -> open picker
  if (!file) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson,.json,application/geo+json,application/json';
    input.onchange = ev => importGeoJSONFile(ev);
    input.click();
    return;
  }
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const parsed = JSON.parse(event.target.result);
      loadGeoDataObject(parsed);
      showToast("GeoJSON loaded successfully!");
    } catch (err) {
      showToast("Invalid GeoJSON file format.");
    }
  };
  reader.readAsText(file);
}

export function loadGeoDataObject(geoObj) {
  S.drawnItems.clearLayers();
  const geoLayer = L.geoJSON(geoObj, {
    style: feature => {
      const p = feature && feature.properties || {};
      const c = p.fill || nextUniqueColor();
      const isLine = feature && feature.geometry && feature.geometry.type.includes('Line');
      if (isLine) {
        return {
          color: p.stroke || c,
          weight: 3,
          opacity: 1,
          fillOpacity: 0
        };
      }
      // Force: unique color, 100% opacity, 0px border
      return {
        color: c,
        fillColor: c,
        fillOpacity: 1,
        weight: 0,
        dashArray: null
      };
    },
    onEachFeature: (feature, layer) => {
      setupLayerProperties(layer);
      layer.on('click', () => {
        S.activeSelectedLayer = layer;
        populateStyleDrawer(layer);
        onFeatureClick(layer);
      });
    }
  });
  geoLayer.eachLayer(l => S.drawnItems.addLayer(l));
  if (S.drawnItems.getLayers().length > 0) {
    S.map.fitBounds(S.drawnItems.getBounds(), {
      padding: [40, 40]
    });
  }
  updateStats();
}

// ================= CLIENT-SIDE LAND ENGINE & SEA CUTTER =================

// ================= COASTLINE DETAIL LEVELS =================
