/**
 * Application entry point.
 *
 * Boots an empty map (no sample shape, no presets, no assisted/AI features),
 * wires the tools, the renderer and the three sidebar tabs, and keeps a local
 * snapshot of your own work.
 */

import { $, $$, on, fmtLatLng, clamp } from './core/util.js';
import { Store } from './core/store.js';
import { styleOf } from './core/geojson.js';
import { MapView, PROVIDERS } from './map/mapview.js';
import { ImageLibrary } from './render/pyramid.js';
import { Renderer } from './render/renderer.js';
import { ToolManager } from './tools.js';
import { FeaturesPanel } from './ui/features.js';
import { StylesPanel } from './ui/styles.js';
import { DataPanel } from './ui/data.js';
import { initToasts, toast } from './ui/toast.js';
import { saveWorkspace, loadWorkspace, clearWorkspace } from './state/persist.js';

const AUTOSAVE_DELAY = 900;

/* --------------------------------------------------------------- bootstrap */

initToasts($('#toasts'));

const store = new Store();
const view = new MapView($('#map'), {
  center: { lng: 12, lat: 24 },
  zoom: 2.3,
  provider: 'osm',
});

const images = new ImageLibrary();
const renderer = new Renderer({ store, images });
view.renderer = renderer;
renderer.onImageNeeded = (image) => { images.load(image.url, { name: image.name }); };

let autosave = true;
let saveTimer = 0;
let hintTimer = 0;

const featuresPanel = new FeaturesPanel({ store, view, toast });
const stylesPanel = new StylesPanel({ store, view, images, toast });
const dataPanel = new DataPanel({
  store,
  view,
  toast,
  onSaveToggle: (enabled) => { autosave = enabled; },
});

images.onChange = () => {
  view.requestRender();
  stylesPanel.onImageChange();
};

const tools = new ToolManager({
  view,
  store,
  renderer,
  onHint: showHint,
  onTool: syncToolButtons,
  onCreate: (feature) => {
    toast(`Added ${labelFor(feature)}.`, {
      actions: [{ label: 'Undo', onClick: () => store.undo() }],
    });
    switchTab('features');
  },
});

/* --------------------------------------------------------------- tabs */

function switchTab(name) {
  for (const button of $$('#tabs button')) {
    const active = button.dataset.tab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  for (const panel of $$('.panel')) panel.classList.toggle('active', panel.dataset.panel === name);
  if (name === 'styles') stylesPanel.refresh();
  if (name === 'data') dataPanel.refresh();
  if (name === 'features') featuresPanel.refresh();
}

for (const button of $$('#tabs button')) {
  on(button, 'click', () => switchTab(button.dataset.tab));
}

/* --------------------------------------------------------------- tools */

for (const button of $$('#tools .tool')) {
  on(button, 'click', () => tools.set(button.dataset.tool));
}

function syncToolButtons(name) {
  for (const button of $$('#tools .tool')) {
    const active = button.dataset.tool === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  const drawing = name !== 'select';
  view.canvas.classList.toggle('crosshair', drawing);
}

function showHint(text) {
  const node = $('#hint');
  if (!text) {
    node.classList.remove('show');
    return;
  }
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(hintTimer);
  // Drawing hints stay up while you build a shape; the select hint fades.
  const active = view.tool && view.tool.name;
  if (active === 'select') hintTimer = setTimeout(() => node.classList.remove('show'), 6000);
}

/* ------------------------------------------------------- history buttons */

function syncHistory() {
  $('#btn-undo').disabled = !store.canUndo;
  $('#btn-redo').disabled = !store.canRedo;
}

on($('#btn-undo'), 'click', () => store.undo());
on($('#btn-redo'), 'click', () => store.redo());
store.on('history', syncHistory);
store.on('change', syncHistory);
syncHistory();

/* ---------------------------------------------------------- map controls */

on($('#btn-zoom-in'), 'click', () => view.zoomIn());
on($('#btn-zoom-out'), 'click', () => view.zoomOut());

const basemapSelect = $('#basemap');
basemapSelect.value = view.basemap;
on(basemapSelect, 'change', () => {
  view.setBasemap(basemapSelect.value);
  syncAttribution();
});

function syncAttribution() {
  const text = PROVIDERS[view.basemap].attribution;
  $('#attribution').textContent = text || 'No basemap · vector data only';
}
syncAttribution();

/* ------------------------------------------------------------ status bar */

view.on('hover', (payload) => {
  const node = $('#st-coords');
  if (!payload) { node.textContent = '—'; return; }
  node.textContent = fmtLatLng(payload.lngLat.lat, payload.lngLat.lng);
});

view.on('move', () => {
  $('#st-zoom').textContent = view.camera.zoom.toFixed(1);
  queueSave();
});

store.on('change', () => {
  $('#st-count').textContent = String(store.count);
  queueSave();
});
$('#st-count').textContent = String(store.count);

/* ------------------------------------------------------------- keyboard */

window.addEventListener('keydown', (e) => {
  const target = e.target;
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  if (typing) {
    if (e.key === 'Escape') target.blur();
    return;
  }

  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo(); else store.undo();
    return;
  }
  if (mod && key === 'y') { e.preventDefault(); store.redo(); return; }
  if (mod && key === 'e') { e.preventDefault(); dataPanel.download(); return; }
  if (mod && key === 's') {
    e.preventDefault();
    const result = saveWorkspace(store, view);
    toast(result.ok ? 'Snapshot saved.' : 'Could not save locally.', { type: result.ok ? 'ok' : 'err' });
    return;
  }

  if (tools.onKeyDown(e)) { e.preventDefault(); return; }
  if (view.onKeyDown(e)) e.preventDefault();
});

/* ---------------------------------------------------------------- paste */

window.addEventListener('paste', async (e) => {
  const target = document.activeElement;
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (typing || !e.clipboardData) return;

  const files = Array.from(e.clipboardData.files || []);
  const imageFile = files.find((f) => f.type.startsWith('image/'));
  if (imageFile) {
    e.preventDefault();
    switchTab('styles');
    await stylesPanel.applyUpload(imageFile);
    return;
  }

  const text = (e.clipboardData.getData('text') || '').trim();
  if (text && (text.startsWith('{') || text.startsWith('['))) {
    e.preventDefault();
    dataPanel.importText(text, { label: 'the clipboard' });
  }
});

/* ------------------------------------------------------------- autosave */

function queueSave() {
  if (!autosave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const result = saveWorkspace(store, view);
    if (!result.ok && result.reason === 'quota') {
      autosave = false;
      toast('Local storage is full — autosave paused. Export a file to keep your work.', { type: 'err', timeout: 8000 });
    }
  }, AUTOSAVE_DELAY);
}

window.addEventListener('beforeunload', () => {
  if (autosave) saveWorkspace(store, view);
});

/* ------------------------------------------------------------------ boot */

function labelFor(feature) {
  const type = (feature.geometry && feature.geometry.type) || 'feature';
  return type.toLowerCase();
}

function preloadImages() {
  const seen = new Set();
  for (const feature of store.features) {
    const image = styleOf(feature)['image-fill'];
    if (image && image.url && !seen.has(image.url)) {
      seen.add(image.url);
      images.load(image.url, { name: image.name });
    }
  }
}

(function boot() {
  const saved = loadWorkspace();
  let restored = 0;

  if (saved && Array.isArray(saved.features) && saved.features.length) {
    store.hydrate(saved);
    if (saved.camera && saved.camera.center) {
      view.setView(saved.camera.center, clamp(saved.camera.zoom ?? 2.3, 0, 22), { animate: false });
    }
    restored = saved.features.length;
    preloadImages();
  }

  store.markSaved();
  syncHistory();
  featuresPanel.refresh();
  stylesPanel.refresh();
  dataPanel.refresh();
  view.requestRender();

  if (restored) {
    toast(`Restored ${restored} feature${restored === 1 ? '' : 's'} from your last session in this browser.`, {
      timeout: 11000,
      actions: [{
        label: 'Start empty',
        onClick: () => {
          store.clearAll();
          clearWorkspace();
          toast('Map cleared.', { type: 'ok' });
        },
      }],
    });
  } else {
    // First run: nothing on the map, exactly as intended.
    tools.updateHint();
  }
})();

/* Handy for poking at the app from the console. */
window.geojsonMaker = { store, view, renderer, images, tools, panels: { featuresPanel, stylesPanel, dataPanel } };
