/**
 * Data tab: import (file, drop, paste), export (download / copy / preview)
 * and the local workspace snapshot controls.
 */

import { $, el, on, fmtBytes } from '../core/util.js';
import { parseGeoJSON, toFeatureCollection } from '../core/geojson.js';
import { bboxOfFeatures } from '../core/geo.js';
import { saveWorkspace, clearWorkspace, canPersist } from '../state/persist.js';

const PREVIEW_LIMIT = 400 * 1024;

export class DataPanel {
  constructor({ store, view, toast, onSaveToggle = () => {} }) {
    this.store = store;
    this.view = view;
    this.toast = toast;
    this.onSaveToggle = onSaveToggle;

    this.jsonBox = $('#json-box');
    this._frame = 0;

    this._bind();
    store.on('change', () => this.schedule());
    store.on('selection', () => this.schedule());
    this.refresh();
    this.refreshSaveNote();
  }

  _bind() {
    const dropzone = $('#dropzone');
    const fileInput = $('#file-input');

    on(dropzone, 'click', () => fileInput.click());
    on(dropzone, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    on(fileInput, 'change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) await this.importFile(file);
    });

    ['dragover', 'dragenter'].forEach((type) => {
      on(dropzone, type, (e) => { e.preventDefault(); dropzone.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach((type) => {
      on(dropzone, type, () => dropzone.classList.remove('over'));
    });
    on(dropzone, 'drop', async (e) => {
      e.preventDefault();
      const file = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find(isGeoJSONFile);
      if (file) await this.importFile(file);
    });

    // Dropping a .geojson file straight on the map works too.
    const mapwrap = $('#mapwrap');
    on(mapwrap, 'dragover', (e) => { e.preventDefault(); });
    on(mapwrap, 'drop', async (e) => {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      const file = files.find(isGeoJSONFile);
      if (!file) return;                 // images are handled by the Styles tab
      e.preventDefault();
      await this.importFile(file);
    });

    on($('#btn-download'), 'click', () => this.download());
    on($('#btn-export-top'), 'click', () => this.download());
    on($('#btn-copy'), 'click', () => this.copy());
    for (const id of ['#exp-indent', '#exp-style', '#exp-selected']) {
      on($(id), 'change', () => this.refresh());
    }

    on($('#btn-save-now'), 'click', () => {
      const result = saveWorkspace(this.store, this.view);
      if (result.ok) this.toast(`Snapshot saved (${fmtBytes(result.bytes)}).`, { type: 'ok' });
      else this.toast('This browser blocked local storage, so nothing was saved.', { type: 'err' });
      this.refreshSaveNote();
    });

    on($('#btn-wipe'), 'click', () => {
      clearWorkspace();
      this.onSaveToggle(false);
      this.refreshSaveNote();
      this.toast('Saved snapshot erased and autosave turned off for this session.', { type: 'ok' });
    });
  }

  schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => { this._frame = 0; this.refresh(); });
  }

  /* --------------------------------------------------------------- export */

  options() {
    return {
      indent: $('#exp-indent').checked,
      includeStyle: $('#exp-style').checked,
      selectedOnly: $('#exp-selected').checked && this.store.selection.size > 0,
    };
  }

  source() {
    const { selectedOnly } = this.options();
    return selectedOnly ? this.store.selectedFeatures() : this.store.features;
  }

  json() {
    const { indent, includeStyle } = this.options();
    return toFeatureCollection(this.source(), { indent, includeStyle });
  }

  get visible() {
    const panel = $('.panel[data-panel="data"]');
    return !!panel && panel.classList.contains('active');
  }

  refresh() {
    const features = this.source();
    $('#data-count').textContent = `${features.length} feature${features.length === 1 ? '' : 's'}`;
    // Serialising is only worth it while the tab is actually on screen; main.js
    // calls refresh() again when the tab is opened.
    if (!this.visible) return;

    const json = this.json();
    if (json.length > PREVIEW_LIMIT) {
      this.jsonBox.value = `${json.slice(0, PREVIEW_LIMIT)}\n\n… preview truncated (${fmtBytes(json.length)} total) — use Download or Copy for the full file.`;
    } else {
      this.jsonBox.value = json;
    }
    const disabled = features.length === 0;
    $('#btn-download').disabled = disabled;
    $('#btn-copy').disabled = disabled;
  }

  filename() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `geojson-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.geojson`;
  }

  download() {
    const features = this.source();
    if (!features.length) { this.toast('Draw or import something first.', { type: 'err' }); return; }
    const json = this.json();
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: this.filename() });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.toast(`Exported ${features.length} feature${features.length === 1 ? '' : 's'} (${fmtBytes(json.length)}).`, { type: 'ok' });
  }

  async copy() {
    const json = this.json();
    if (!json) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(json);
      } else {
        this.jsonBox.focus();
        this.jsonBox.select();
        const ok = document.execCommand && document.execCommand('copy');
        if (!ok) throw new Error('copy blocked');
      }
      this.toast('GeoJSON copied to the clipboard.', { type: 'ok' });
    } catch {
      this.toast('Copy was blocked — select the text in the box and copy manually.', { type: 'err' });
    }
  }

  /* --------------------------------------------------------------- import */

  async importFile(file) {
    let text;
    try {
      text = await file.text();
    } catch {
      this.toast(`Could not read “${file.name}”.`, { type: 'err' });
      return;
    }
    this.importText(text, { label: file.name });
  }

  importText(text, { label = 'pasted GeoJSON' } = {}) {
    const merge = $('#import-merge').checked;
    const { features, errors, skipped } = parseGeoJSON(text);

    if (!features.length) {
      this.toast(`No usable features in ${label}. ${errors[0] || ''}`.trim(), { type: 'err' });
      return false;
    }

    this.store.load(features, { replace: !merge, select: false });
    const bbox = bboxOfFeatures(features);
    if (bbox) this.view.fitBounds(bbox, { padding: 60, animate: true });

    const notes = [];
    if (!merge) notes.push('replaced the map');
    if (skipped) notes.push(`${skipped} skipped`);
    if (errors.length) notes.push(errors[0]);
    this.toast(`Imported ${features.length} feature${features.length === 1 ? '' : 's'} from ${label}${notes.length ? ` (${notes.join(', ')})` : ''}.`, {
      type: 'ok',
      actions: [{ label: 'Undo', onClick: () => this.store.undo() }],
    });
    this.refresh();
    return true;
  }

  refreshSaveNote() {
    const node = $('#save-note');
    node.textContent = canPersist()
      ? 'Autosaved in this browser after every change. Nothing is uploaded anywhere.'
      : 'This browser blocks local storage, so autosave is unavailable — export a file to keep your work.';
  }
}

function isGeoJSONFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  if (file.type.startsWith('image/')) return false;
  return name.endsWith('.geojson') || name.endsWith('.json') || file.type === 'application/json'
    || file.type === 'application/geo+json' || (!file.type && (name.endsWith('.txt') || name.endsWith('.ndjson')));
}
