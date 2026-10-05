// Split out of the original single-file engine (see legacy/index.html).
// Origin: GEOJSON STATS & EXPORT

import { turf } from '../heavyLibs.js';

// ================= GEOJSON STATS & EXPORT =================
export function onFeatureClick(layer) {
  const geo = layer.toGeoJSON();
  let areaStr = "";
  if (geo.geometry.type.includes('Polygon') && window.turf) {
    try {
      const sqKm = (turf.area(geo) / 1e6).toFixed(3);
      areaStr = `<br><span class="text-[11px] text-slate-400">Land Area: ${sqKm} km²</span>`;
    } catch (e) {}
  }
  layer.bindPopup(`
        <div class="p-1">
          <p class="font-bold text-xs text-slate-900">${layer.feature && layer.feature.properties && layer.feature.properties.name || "Region"}</p>
          <p class="text-[10px] text-slate-600">${geo.geometry.type}${areaStr}</p>
        </div>
      `).openPopup();
}

// ================= COALESCED STATS ENGINE =================
// updateStats() used to run toGeoJSON + JSON.stringify + one turf.area call
// per feature on EVERY edit — and even on every animation frame while
// dragging a curve handle. It is now split into a cheap part (counters,
// instant) and a heavy part (geometry walk, debounced to a quiet moment).
