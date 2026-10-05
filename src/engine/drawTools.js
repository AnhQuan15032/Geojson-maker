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
