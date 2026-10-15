// Split out of the original single-file engine (see legacy/index.html).
// Origin: (preamble)  ·  (bootstrap)

import L from 'leaflet';
import * as lucide from '../lib/icons.js';
import { S } from './state.js';
import { initAnimator, openAnimateDrawer, stopMorphPreview } from './animator.js';
import { highlightActiveBase } from './baseMaps.js';
import { randomizeBorderSeed } from './borderDetail.js';
import { nextUniqueColor, setupLayerProperties } from './colors.js';
import { LAND_SOURCES } from './constants.js';
import { onSelectOnMapClick, openCountrySearch, prefetchCountryIndex, removeShapeCompletely, toggleDeleteMode, toggleSelectOnMapMode, updateDeleteModeUI, updateSelectOnMapUI } from './countries.js';
import { cleanupDrawCurveGhost, curveLayerAllEdges, loadDrawCurvePrefs, setupDrawCurveGhost, updateDrawCurveGhost } from './curves.js';
import { deleteSelectedOrLast, pauseDoubleClickZoom, resumeDoubleClickZoom, setDrawMode } from './drawTools.js';
import { onFeatureClick } from './exporters/geojson.js';
import { redoHistory, undoHistory, updateHistoryButtons } from './history.js';
import { highlightCoastlineLevel, updateCoastlineStatus } from './landmass.js';
import {
  clearMergeSelection,
  cutSeaFromPolygon,
  loadGlobalLandmass,
  toggleMergeCandidate,
  toggleMergeMode,
  triggerCutSeaNow,
  updateCutSeaNoIslandsUI,
  updateMergeModeUI,
} from './merge.js';
import {
  applySnappingOptionsToMap,
  clearDrawingPointLabels,
  hideSnapIndicator,
  initGuiSettings,
  initMapSnappingEvents,
  renderLatLngGrid,
  toggleLatLngGrid,
  updateDrawingPointLabels,
  updateSnappingUI,
} from './misc.js';
import { loadNudgeConfig, nudgeImage } from './overlayImage.js';
import { duplicateSelectedShape, fitAllShapes, toggleShortcutSheet, updateStats, zoomToSelection } from './quickTools.js';
import { cancelSeaPick } from './seaDetect.js';
import { executeSplitWithLine, executeSplitWithPolygon, setSplitStatus } from './split.js';
import { openStyleDrawerForActive, populateStyleDrawer } from './styleInspector.js';
import {
  endTutorial,
  positionTourElements,
  renderTutorialStep,
  startTutorial,
  tutorialIsOpen,
  tutorialNext,
  tutorialPrev,
} from './tutorial.js';
import { closeDrawers, endDrawSession, initMobileAppShell, showToast, toggleDrawer } from './uiHelpers.js';

export function currentLoadMode() {
  return (document.getElementById('countries-load-mode') || {}).value || 'country';
}

// Reference Image State (projection-locked overlay — never stretches)

// Boots the engine. Called by main.jsx once React has committed the UI.
export function startEngine() {
  initMap();
  lucide.createIcons();
  highlightActiveBase();
  highlightCoastlineLevel();
  randomizeBorderSeed();
  loadNudgeConfig();
  loadDrawCurvePrefs();
  updateSelectOnMapUI();
  updateDeleteModeUI();
  updateMergeModeUI();
  updateSnappingUI();
  updateCutSeaNoIslandsUI();
  initAnimator();
  initMobileAppShell();
  updateHistoryButtons();
  initGuiSettings();

  // Warm the country index once the app is idle, so "Load country" answers
  // instantly instead of downloading on the first keystroke (skipped in tests).
  if (!(import.meta.env && import.meta.env.MODE === 'test')) {
    const warm = () => { prefetchCountryIndex().catch(() => {}); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 2500);
  }

  // Accessible names for the map surface and dynamic panels
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.setAttribute('role', 'application');
    mapEl.setAttribute('aria-label', 'Interactive vector map canvas');
    mapEl.setAttribute('tabindex', '0');
  }
  document.querySelectorAll('.sheet-drawer').forEach(d => {
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'false');
    const h = d.querySelector('h3');
    if (h) {
      if (!h.id) h.id = `${d.id}-title`;
      d.setAttribute('aria-labelledby', h.id);
    }
  });

  // Keyboard: tutorial navigation + arrow-key overlays nudging
  // (capture phase so it wins over map panning)
  window.addEventListener('keydown', e => {
    if (tutorialIsOpen()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        endTutorial(true);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        tutorialNext();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        tutorialPrev();
        return;
      }
    }
    if (S.mergeMode && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      S.mergeMode = false;
      clearMergeSelection(false);
      updateMergeModeUI();
      showToast('Merge mode off');
      return;
    }
    if (S.deleteMode && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      S.deleteMode = false;
      updateDeleteModeUI();
      showToast('Delete-on-map disabled');
      return;
    }
    if (S.selectOnMapMode && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      S.selectOnMapMode = false;
      updateSelectOnMapUI();
      showToast('Select-on-map disabled');
      return;
    }
    if (S.splitModeActive && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      S.splitModeActive = false;
      S.splitDeleteMode = false;
      S.splitTool = 'line';
      S._splitLockedLayer = null;
      endDrawSession();
      if (S.map) S.map.getContainer().style.cursor = '';
      setSplitStatus('idle');
      showToast('Split cancelled');
      return;
    }
    if (S.morphPreviewRaf && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stopMorphPreview();
      showToast('Morph preview stopped');
      return;
    }
    // Esc abandons the shape being drawn (double-click zoom comes back with it)
    if (e.key === 'Escape' && endDrawSession()) {
      e.preventDefault();
      e.stopPropagation();
      showToast('Drawing cancelled');
      return;
    }
    if (S.seaPickMode && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelSeaPick();
      showToast('Sea-colour picking cancelled');
      return;
    }
    // ---- Global shortcuts (ignored while typing) ----
    const tgt = e.target;
    const typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable);
    if (!typing) {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoHistory();
        return;
      }
      if (mod && k === 'y' || mod && e.shiftKey && k === 'z') {
        e.preventDefault();
        redoHistory();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        duplicateSelectedShape();
        return;
      }
      if (!mod) {
        if (e.key === '?' || e.shiftKey && k === '/') {
          e.preventDefault();
          toggleShortcutSheet();
          return;
        }
        if (e.key === 'Escape' && document.getElementById('shortcut-sheet').classList.contains('open')) {
          e.preventDefault();
          toggleShortcutSheet(false);
          return;
        }
        if (k === 'd') {
          e.preventDefault();
          setDrawMode('Polygon');
          return;
        }
        if (k === 's') {
          e.preventDefault();
          openStyleDrawerForActive();
          return;
        }
        if (k === 'e') {
          e.preventDefault();
          toggleDrawer('export-drawer');
          return;
        }
        if (k === 'a') {
          e.preventDefault();
          openAnimateDrawer();
          return;
        }
        if (k === 'b') {
          e.preventDefault();
          toggleDrawer('layers-drawer');
          return;
        }
        if (k === 'l') {
          e.preventDefault();
          openCountrySearch();
          return;
        }
        if (k === 'o') {
          e.preventDefault();
          toggleDrawer('image-drawer');
          return;
        }
        if (k === 'p') {
          e.preventDefault();
          toggleSelectOnMapMode();
          return;
        }
        if (k === 'm') {
          e.preventDefault();
          toggleMergeMode();
          return;
        }
        if (k === 'x') {
          e.preventDefault();
          toggleDeleteMode();
          return;
        }
        if (k === 'g') {
          e.preventDefault();
          toggleLatLngGrid();
          return;
        }
        if (k === 'c') {
          e.preventDefault();
          triggerCutSeaNow();
          return;
        }
        if (k === 'f') {
          e.preventDefault();
          e.shiftKey ? fitAllShapes() : zoomToSelection();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (S.activeSelectedLayer) {
            e.preventDefault();
            deleteSelectedOrLast();
            return;
          }
        }
      }
    }
    if (!S.nudgeKeysEnabled || !S.imageCenter) return;
    const t = e.target;
    if (typing) return;
    const dirs = {
      ArrowUp: [1, 0],
      ArrowDown: [-1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const mult = e.shiftKey ? 5 : e.altKey ? 0.2 : 1;
    nudgeImage(d[0], d[1], mult);
  }, true);

  // Keep the guide card + spotlight aligned when the viewport changes size
  let tourResizeTimer = null;
  window.addEventListener('resize', () => {
    if (!tutorialIsOpen()) return;
    clearTimeout(tourResizeTimer);
    tourResizeTimer = setTimeout(() => {
      renderTutorialStep();
    }, 150);
  });

  // Also follow scrolling inside drawers / panels (capture catches them all)
  document.addEventListener('scroll', () => {
    if (tutorialIsOpen()) positionTourElements();
  }, true);

  // First visit? Offer the guided tour automatically
  setTimeout(() => {
    let seen = false;
    try {
      seen = localStorage.getItem('gjs_tutorial_seen') === '1';
    } catch (e) {}
    if (!seen) startTutorial();
  }, 900);

  // Lazy-load heavy geospatial libs (Turf + TopoJSON) after first paint
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 500));
  idle(() => {
    updateCoastlineStatus('loading');
    loadGlobalLandmass();
  });
}

export function initMap() {
  S.map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
    // canvas handles hundreds of country polygons far better than SVG
    // Large padding + tight hit tolerance: fewer redraws, cheaper click tests
    renderer: L.canvas({
      padding: 0.4,
      tolerance: 0.35
    })
  }).setView([20.0, 106.0], 6);
  L.control.zoom({
    position: 'topright'
  }).addTo(S.map);

  // ================= BASE MAP LAYERS =================
  const CARTO = 'https://{s}.basemaps.cartocdn.com';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

  // OSM streets
  S.baseTileLayers.standard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  });

  // Clean, unwatermarked basemaps
  S.baseTileLayers.voyager = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  });
  S.baseTileLayers.light = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19
  });
  S.baseTileLayers.dark = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19
  });

  // Satellite (Esri World Imagery)
  S.baseTileLayers.satellite = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19
  });

  // Satellite + labels hybrid: imagery under a transparent label layer
  S.baseTileLayers.hybrid = L.layerGroup([L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19
  }), L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    opacity: 0.95
  })]);

  // Terrain
  S.baseTileLayers.terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    maxNativeZoom: 17,
    // upscale past z17 instead of showing blank tiles
    subdomains: 'abc'
  });

  // Humanitarian (OpenStreetMap HOT)
  S.baseTileLayers.humanitarian = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc'
  });
  S.baseTileLayers.dark.addTo(S.map);

  // Boundary Overlays (unwatermarked Esri Reference layers)
  S.borderOverlays.countries = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    opacity: 0.9,
    zIndex: 500
  }).addTo(S.map);
  S.borderOverlays.states = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    opacity: 0.75,
    zIndex: 510
  });
  S.borderOverlays.labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    opacity: 0.9,
    zIndex: 520
  });
  S.drawnItems = new L.FeatureGroup();
  S.map.addLayer(S.drawnItems);
  S.latLngGridLayerGroup = new L.LayerGroup().addTo(S.map);
  S.drawingPointMarkersGroup = new L.LayerGroup().addTo(S.map);
  S.map.on('moveend zoomend', () => {
    if (S.latLngGridEnabled) renderLatLngGrid();
  });

  // Geoman Drawing Options — 0px border, 100% fill, magnetic snapping
  applySnappingOptionsToMap();
  initMapSnappingEvents();
  S.map.on('pm:create', e => {
    hideSnapIndicator();
    clearDrawingPointLabels();
    S.activeDrawingWorkingLayer = null;
    const layer = e.layer;

    // Split mode: the drawn line is a blade, not a shape
    if (S.splitModeActive && layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
      S.drawnItems.removeLayer(layer);
      const wasDelete = !!S.splitDeleteMode;
      // keep flags for executeSplitWithLine to read, then clear cursor/active after
      S.splitModeActive = false;
      // S.splitDeleteMode is cleared inside executeSplitWithLine after reading wasDelete
      setSplitStatus('splitting…', 'busy');
      executeSplitWithLine(layer.getLatLngs(), wasDelete);
      return;
    }
    // Polygon-blade split mode: the drawn ring is the cut region, not a shape
    if (S.splitModeActive && S.splitTool === 'polygon' && layer instanceof L.Polygon) {
      S.drawnItems.removeLayer(layer);
      const wasDelete = !!S.splitDeleteMode;
      S.splitModeActive = false;
      // S.splitDeleteMode / S.splitTool are reset inside executeSplitWithPolygon
      setSplitStatus('splitting…', 'busy');
      executeSplitWithPolygon(layer.getLatLngs(), wasDelete);
      return;
    }
    cleanupDrawCurveGhost();
    const c = nextUniqueColor();
    if (layer instanceof L.Polygon) {
      // Lock: 0px border, 100% opaque fill, unique color
      layer.setStyle({
        fillColor: c,
        color: c,
        fillOpacity: 1,
        weight: 0,
        opacity: 0,
        dashArray: null
      });
    } else if (layer instanceof L.Polyline) {
      layer.setStyle({
        color: c,
        weight: 3,
        opacity: 1,
        fillOpacity: 0
      });
    }
    setupLayerProperties(layer);
    S.activeSelectedLayer = layer;

    // Curve-while-drawing: finished polygons/rectangles arrive curved
    if (S.drawCurveEnabled && layer instanceof L.Polygon) {
      curveLayerAllEdges(layer, S.drawCurveAmount);
    }
    layer.on('click', () => {
      if (S.splitModeActive) return;
      S.activeSelectedLayer = layer;
      populateStyleDrawer(layer);
      onFeatureClick(layer);
    });
    updateStats();
    if (S.autoCutSeaEnabled && layer instanceof L.Polygon) {
      cutSeaFromPolygon(layer);
    } else {
      showToast("Shape created with unique color!");
    }
  });
  S.map.on('pm:remove', () => {
    S.activeSelectedLayer = null;
    updateStats();
  });

  // ---- Curve-while-drawing & Drawing Point Labels preview ----
  S.map.on('pm:drawstart', e => {
    pauseDoubleClickZoom(); // fast clicks place points, they must not zoom
    S.drawGhostWorking = e.workingLayer || null;
    S.activeDrawingWorkingLayer = e.workingLayer || null;
    if (S.drawCurveEnabled && S.drawGhostWorking && S.drawGhostWorking instanceof L.Polyline && !(S.drawGhostWorking instanceof L.Marker)) {
      setupDrawCurveGhost();
    }
    if (S.showDrawingPointLabels && S.activeDrawingWorkingLayer) {
      updateDrawingPointLabels(S.activeDrawingWorkingLayer);
    }
  });
  S.map.on('pm:vertexadded', e => {
    if (S.drawGhostLayer) updateDrawCurveGhost();
    if (S.showDrawingPointLabels) {
      const wl = e && e.workingLayer || S.activeDrawingWorkingLayer;
      if (wl) updateDrawingPointLabels(wl);
    }
  });
  S.map.on('pm:snap', () => {
    if (S.showDrawingPointLabels && S.activeDrawingWorkingLayer) {
      updateDrawingPointLabels(S.activeDrawingWorkingLayer);
    }
  });

  // A draw session ended (finished or cancelled): drop the ghost, clear labels, and
  // reset split mode if the blade line was abandoned.
  S.map.on('pm:drawend', () => {
    resumeDoubleClickZoom();
    cleanupDrawCurveGhost();
    S.activeDrawingWorkingLayer = null;
    clearDrawingPointLabels();
    if (S.splitModeActive) {
      S.splitModeActive = false;
      S.splitDeleteMode = false;
      S.splitTool = 'line';
      S._splitLockedLayer = null;
      if (S.map) S.map.getContainer().style.cursor = '';
      setSplitStatus('idle');
      showToast('Split cancelled');
    }
  });

  // Select-on-map: click any country / province to load it
  S.map.on('click', onSelectOnMapClick);

  // Delete-on-map / Merge-pick: click a drawn shape
  S.drawnItems.on('click', ev => {
    if (!S.deleteMode && !S.mergeMode) return;
    if (S.seaPickMode || S.splitModeActive || S.curveMode) return;
    if (S.map.pm && S.map.pm.globalDrawModeEnabled && S.map.pm.globalDrawModeEnabled()) return;
    const layer = ev.propagatedFrom || ev.layer;
    if (!layer || layer instanceof L.Marker) return;
    if (S.mergeMode) {
      if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      toggleMergeCandidate(layer);
      return;
    }
    removeShapeCompletely(layer);
    closeDrawers();
    showToast('Shape deleted');
  });
}

// ================= UNIQUE COLOR ENGINE =================

try {
  S.currentLandLevel = localStorage.getItem('coastline_level') || 'medium';
} catch (e) {}

if (!LAND_SOURCES[S.currentLandLevel]) S.currentLandLevel = 'medium';

try {
  if (localStorage.getItem('gjs_snapping_enabled') === '0') S.snappingEnabled = false;
  const sd = parseInt(localStorage.getItem('gjs_snap_distance'), 10);
  if (sd >= 10 && sd <= 60) S.snappingDistance = sd;
  if (localStorage.getItem('gjs_snap_edges') === '0') S.snapToEdges = false;
  if (localStorage.getItem('gjs_snap_vertices') === '0') S.snapToVertices = false;
  if (localStorage.getItem('gjs_snap_midpoints') === '0') S.snapToMidpoints = false;
} catch (e) {}
