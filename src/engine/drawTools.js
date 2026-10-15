// Split out of the original single-file engine (see legacy/index.html).
// Origin: DRAW TOOLS

import { S } from './state.js';
import { PREVIEW_COLOR } from './constants.js';
import { removeShapeCompletely } from './countries.js';
import { exitCurveEdgeMode } from './curves.js';
import { applySnappingOptionsToMap } from './misc.js';
import { setSplitStatus } from './split.js';
import { closeDrawers, showToast } from './uiHelpers.js';

// ================= DRAW TOOLS =================
export function setDrawMode(shape) {
  closeDrawers();
  S.splitModeActive = false;
  setSplitStatus('idle');
  exitCurveEdgeMode();
  S.map.pm.disableGlobalEditMode();
  applySnappingOptionsToMap();
  const drawOpts = {
    snappable: S.snappingEnabled,
    snapDistance: S.snappingDistance,
    snapSegment: S.snappingEnabled && S.snapToEdges,
    snapVertex: S.snappingEnabled && S.snapToVertices,
    snapMiddle: S.snappingEnabled && S.snapToMidpoints,
    allowSelfIntersection: false,
    // no "Click first marker to finish" box trailing the cursor
    tooltips: false,
    templineStyle: {
      color: PREVIEW_COLOR,
      weight: 2.5,
      dashArray: '4,4'
    },
    hintlineStyle: {
      color: PREVIEW_COLOR,
      dashArray: '2,4',
      weight: 1.5
    },
    pathOptions: {
      color: PREVIEW_COLOR,
      fillColor: PREVIEW_COLOR,
      fillOpacity: 1,
      weight: 0,
      opacity: 0
    }
  };
  if (shape === 'Polygon') S.map.pm.enableDraw('Polygon', drawOpts);else if (shape === 'Line') S.map.pm.enableDraw('Line', drawOpts);else if (shape === 'Rectangle') S.map.pm.enableDraw('Rectangle', drawOpts);else if (shape === 'Marker') S.map.pm.enableDraw('Marker', drawOpts);
  showToast(`Draw ${shape}: ${S.snappingEnabled ? '🧲 Edge & vertex snapping active' : 'tap on map'}`);
}

// ---- Fast clicks while drawing must place points, never zoom ----
//
// Leaflet turns two clicks within its double-click window into a `dblclick`
// (on touch screens even when the taps land in different places) and the
// DoubleClickZoom handler zooms in — so tracing a coast quickly kept jumping
// the view. The handler is paused for the length of a draw session only:
// wheel, pinch, the +/- buttons and the keyboard still zoom while drawing,
// and double-click zoom is back shortly after the session ends. The resume is
// delayed past Leaflet's 200 ms double-tap window so the tap that finishes a
// shape cannot zoom either.
const DBLCLICK_ZOOM_RESUME_MS = 300;

export function pauseDoubleClickZoom() {
  const map = S.map;
  if (!map || !map.doubleClickZoom) return;
  clearTimeout(S.drawDblClickZoomTimer);
  S.drawDblClickZoomTimer = null;
  if (map.doubleClickZoom.enabled()) {
    map.doubleClickZoom.disable();
    S.drawDblClickZoomPaused = true;
  }
}

export function resumeDoubleClickZoom() {
  const map = S.map;
  if (!map || !S.drawDblClickZoomPaused) return;
  clearTimeout(S.drawDblClickZoomTimer);
  S.drawDblClickZoomTimer = setTimeout(() => {
    S.drawDblClickZoomTimer = null;
    if (!S.drawDblClickZoomPaused) return;
    // a new session started meanwhile — stay paused until that one ends
    if (map.pm && map.pm.globalDrawModeEnabled && map.pm.globalDrawModeEnabled()) return;
    S.drawDblClickZoomPaused = false;
    if (map.doubleClickZoom) map.doubleClickZoom.enable();
  }, DBLCLICK_ZOOM_RESUME_MS);
}

export function toggleEditMode() {
  const btn = document.getElementById('btn-edit-mode');
  if (S.map.pm.globalEditModeEnabled()) {
    S.map.pm.disableGlobalEditMode();
    btn.classList.remove('bg-amber-600');
    showToast("Edit mode disabled");
  } else {
    applySnappingOptionsToMap();
    S.map.pm.enableGlobalEditMode({
      snappable: S.snappingEnabled,
      snapDistance: S.snappingDistance,
      snapSegment: S.snappingEnabled && S.snapToEdges,
      snapVertex: S.snappingEnabled && S.snapToVertices,
      snapMiddle: S.snappingEnabled && S.snapToMidpoints
    });
    btn.classList.add('bg-amber-600');
    closeDrawers();
    showToast(`Drag nodes: ${S.snappingEnabled ? '🧲 Snapping to edges ON' : 'free edit'}`);
  }
}

export function deleteSelectedOrLast() {
  if (S.activeSelectedLayer) {
    removeShapeCompletely(S.activeSelectedLayer);
    showToast("Shape deleted");
  } else {
    const layers = S.drawnItems.getLayers();
    if (layers.length > 0) {
      removeShapeCompletely(layers[layers.length - 1]);
      showToast("Last shape deleted");
    }
  }
}

// ================= BASE MAPS & BORDERS =================

// ---- MapLibre GL vector styles (bridge keeps Leaflet in charge) ----
