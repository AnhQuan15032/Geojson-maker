// Split out of the original single-file engine (see legacy/index.html).
// Origin: MAKE POLYGON PART OF THE MAP (tile baker)

import L from 'leaflet';
import { S } from './state.js';
import { hexToRgba } from '../lib/util.js';
import { PREVIEW_COLOR } from './constants.js';
import { showToast } from './uiHelpers.js';

// ================= MAKE POLYGON PART OF THE MAP (tile baker) =================
// Renders the working shapes straight into a Leaflet GridLayer: every tile is
// painted at native resolution from the live GeoJSON, so the shapes behave
// exactly like base-map tiles (crisp at any zoom, panning/zooming free) and
// sit beneath country borders + place labels.
export function bakePolygonsIntoMap() {
  const shapeCount = S.drawnItems.getLayers().length;
  if (shapeCount === 0) {
    showToast("Draw some shapes first");
    return;
  }
  if (shapeCount > 120) {
    const ok = confirm(`You have ${shapeCount} shapes (e.g. a full country load).\n\nBaking them all into tiles can be slow while panning. Continue?`);
    if (!ok) return;
  }
  if (S.bakedLayer) {
    S.map.removeLayer(S.bakedLayer);
    S.bakedLayer = null;
  }
  S.bakedLayer = L.gridLayer({
    tileSize: 256,
    zIndex: 450,
    updateWhenZooming: false,
    keepBuffer: 2
  });
  S.bakedLayer.createTile = function (coords) {
    const size = 256;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const tile = document.createElement('canvas');
    tile.width = size * dpr;
    tile.height = size * dpr;
    const ctx = tile.getContext('2d');
    ctx.scale(dpr, dpr);
    const origin = L.point(coords.x * size, coords.y * size);

    // Geographic bounds of this tile — used to skip off-tile shapes
    const n2 = Math.pow(2, coords.z);
    const tileBox = [coords.x / n2 * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * (coords.y + 1) / n2))) * 180 / Math.PI, (coords.x + 1) / n2 * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * coords.y / n2))) * 180 / Math.PI];
    S.drawnItems.eachLayer(l => drawLayerOnBakedTile(ctx, l, coords.z, origin, tileBox));
    return tile;
  };
  S.bakedLayer.addTo(S.map);
  S.bakedActive = true;
  hideDrawnShapesForBake();
  updateBakeUI();
  showToast("Shapes baked into the map — pan and zoom freely");
}

export function drawLayerOnBakedTile(ctx, layer, z, origin, tileBox) {
  if (layer instanceof L.Marker) return;

  // Tile cull: cache each shape's geographic bbox once and skip anything
  // this tile cannot possibly contain. Turns O(tiles × shapes) into
  // O(tiles × visible shapes) when baking many provinces.
  if (tileBox) {
    let bb = layer._gjsBakedBBox;
    if (!bb) {
      try {
        const gb = layer.getBounds();
        bb = layer._gjsBakedBBox = [gb.getWest(), gb.getSouth(), gb.getEast(), gb.getNorth()];
      } catch (e) {
        bb = null;
      }
    }
    if (bb && (tileBox[0] > bb[2] || tileBox[2] < bb[0] || tileBox[1] > bb[3] || tileBox[3] < bb[1])) return;
  }
  const opts = layer.options || {};
  const props = layer.feature && layer.feature.properties || {};
  const fillColor = opts.fillColor || props.fill || PREVIEW_COLOR;
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (layer instanceof L.Polygon) {
    ctx.beginPath();
    const addRing = ring => {
      for (let i = 0; i < ring.length; i++) {
        const p = S.map.project(ring[i], z).subtract(origin);
        if (i === 0) ctx.moveTo(p.x, p.y);else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    const rings = layer.getLatLngs();
    rings.forEach(ring => {
      if (Array.isArray(ring) && ring.length > 0 && Array.isArray(ring[0])) {
        ring.forEach(sub => addRing(sub));
      } else {
        addRing(ring);
      }
    });
    ctx.fillStyle = hexToRgba(fillColor, 1);
    ctx.fill('evenodd');
  } else if (layer instanceof L.Polyline) {
    const flat = layer.getLatLngs();
    const coords = Array.isArray(flat[0]) && Array.isArray(flat[0][0]) ? flat.flat(3) : flat;
    ctx.beginPath();
    for (let i = 0; i < coords.length; i++) {
      const p = S.map.project(coords[i], z).subtract(origin);
      if (i === 0) ctx.moveTo(p.x, p.y);else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = opts.color || props.stroke || fillColor;
    ctx.lineWidth = (opts.weight || 0) > 0 ? opts.weight : 3;
    ctx.stroke();
  }
}

export function hideDrawnShapesForBake() {
  S.savedShapeStyles = [];
  S.drawnItems.eachLayer(l => {
    if (typeof l.setStyle === 'function') {
      S.savedShapeStyles.push({
        layer: l,
        opts: {
          opacity: l.options.opacity,
          fillOpacity: l.options.fillOpacity
        }
      });
      l.setStyle({
        opacity: 0,
        fillOpacity: 0
      });
    }
  });
}

export function restoreDrawnShapeStyles() {
  if (!S.savedShapeStyles) return;
  S.savedShapeStyles.forEach(e => {
    if (S.drawnItems.hasLayer(e.layer) && typeof e.layer.setStyle === 'function') e.layer.setStyle(e.opts);
  });
  S.savedShapeStyles = null;
}

// Cheap "we changed something while dragging" hint — no work during the drag
export function invalidateBakeSoon() {
  if (!S.bakedActive) return;
  if (S.bakeSoonTimer) return;
  S.bakeSoonTimer = setTimeout(() => {
    S.bakeSoonTimer = null;
    refreshBake();
  }, 400);
}

export function refreshBake() {
  if (!S.bakedActive) return;
  if (S.drawnItems.getLayers().length > 150) {
    // Too many shapes (e.g. all countries) — repainting every tile would lock the UI
    const el = document.getElementById('bake-status');
    if (el) {
      el.textContent = 'Paused (too many shapes)';
      el.className = 'text-[10px] font-mono text-amber-300';
    }
    return;
  }
  if (S.bakeRefreshQueued) return; // one refresh per frame, max
  S.bakeRefreshQueued = true;
  requestAnimationFrame(() => {
    S.bakeRefreshQueued = false;
    if (!S.bakedActive || !S.bakedLayer) return;
    S.bakedLayer.redraw();
    hideDrawnShapesForBake();
  });
}

export function unbakePolygons(silent) {
  if (S.bakedLayer) {
    S.map.removeLayer(S.bakedLayer);
    S.bakedLayer = null;
  }
  restoreDrawnShapeStyles();
  S.bakedActive = false;
  updateBakeUI();
  if (!silent) showToast("Shapes removed from the map background");
}

export function updateBakeUI() {
  const el = document.getElementById('bake-status');
  if (el) {
    el.textContent = S.bakedActive ? 'Baked ✓' : 'Not baked';
    el.className = S.bakedActive ? 'text-[10px] font-mono text-emerald-400' : 'text-[10px] font-mono text-slate-400';
  }
}

// ================= SPLIT SHAPE WITH A LINE =================
// The drawn line is extended into a half-plane "blade" polygon, then the
// target shape is severed with turf boolean ops: difference() keeps one
// side, intersect() keeps the other. Both halves inherit the original's
// properties and get their own unique color.
