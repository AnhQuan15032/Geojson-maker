// Split out of the original single-file engine (see legacy/index.html).
// Origin: COALESCED STATS ENGINE

import { S } from './state.js';
import { nowMs } from '../lib/util.js';
import { statsElCache } from './constants.js';
import { turf } from './heavyLibs.js';
import { captureHistory } from './history.js';
import { refreshBake } from './tileBake.js';

export function statsEl(id) {
  if (!statsElCache[id]) statsElCache[id] = document.getElementById(id);
  return statsElCache[id];
}

export function invalidateHeavyStats(delay) {
  if (S.statsCoalesceTimer) return; // already scheduled — coalesce
  S.statsCoalesceTimer = setTimeout(() => {
    S.statsCoalesceTimer = null;
    runHeavyStats();
  }, delay || 280);
}

export function runHeavyStats() {
  if (!S.map || !S.drawnItems) return;
  const t0 = nowMs();
  const count = S.drawnItems.getLayers().length;
  const data = S.drawnItems.toGeoJSON();
  const bulk = count > 400; // e.g. a full province load

  const ta = statsEl('geojson-textarea');
  const areaEl = statsEl('stat-total-area');
  if (bulk) {
    if (ta) ta.value = `// Live JSON preview disabled for ${count} features (keeps the UI fast).\n// Stats are paused too — "Save .geojson" still exports everything.`;
    if (areaEl) areaEl.textContent = '— (bulk load)';
  } else {
    if (ta) ta.value = JSON.stringify(data, null, 2);
    let totalArea = 0;
    if (window.turf) {
      data.features.forEach(f => {
        if (f.geometry && f.geometry.type.includes('Polygon')) {
          try {
            totalArea += turf.area(f);
          } catch (e) {}
        }
      });
    }
    if (areaEl) areaEl.textContent = `${(totalArea / 1e6).toFixed(2)} km²`;
  }

  // Keep baked map tiles in sync with the live vectors (rAF-coalesced)
  if (S.bakedActive) refreshBake();

  // Free undo/redo: the GeoJSON is already built here
  captureHistory(data);
  S.lastHeavyStatsMs = Math.round(nowMs() - t0);
  S.heavyStatsCount = count;
  updatePerfChip(count);
}

export function updatePerfChip(count) {
  const el = document.getElementById('perf-chip');
  if (!el) return;
  const n = count === undefined ? S.drawnItems.getLayers().length : count;
  el.textContent = `${n} shapes · stats ${S.lastHeavyStatsMs} ms`;
}

// ================= UNDO / REDO HISTORY =================
// Snapshots piggyback on the debounced stats pass, which already builds the
// GeoJSON — so history costs no extra serialization. Capped and skipped on
// very large sets to protect memory.
