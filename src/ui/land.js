/**
 * "Cut sea": trim drawn geometry back to the real shoreline.
 *
 * The controls live in two places because they are two different jobs — the
 * Data tab decides *which* coastline you cut against and how finely, the
 * Features tab does the cutting. Both are driven from here so they can never
 * disagree about what is loaded.
 */

import { $, on, el, fmtArea, fmtBytes } from '../core/util.js';
import { featureName } from '../core/geojson.js';
import { LandService, LAND_SOURCES, DEFAULT_SOURCE } from '../land/landmask.js';

const PREFS_KEY = 'geojson-maker.land.prefs.v1';

/** Hand the tab back to the browser so a status line can actually paint. */
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/** How many features to cut before yielding again. */
const YIELD_EVERY = 6;

function readPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const prefs = JSON.parse(raw);
    return prefs && typeof prefs === 'object' ? prefs : null;
  } catch { return null; }
}

export class CoastlinePanel {
  constructor({ store, toast, switchTab }) {
    this.store = store;
    this.toast = toast;
    this.switchTab = switchTab || (() => {});
    this.service = new LandService();
    this.busy = false;
    this.lastRun = null;
    this.lakesNote = '';

    this.sourceEl = $('#land-source');
    this.precisionEl = $('#land-precision');
    this.lakesEl = $('#land-lakes');
    this.statusEl = $('#land-status');
    this.infoEl = $('#coast-info');
    this.cutBtn = $('#btn-cut-sea');
    this.cutAllBtn = $('#btn-cut-sea-all');
    this.loadBtn = $('#btn-land-load');
    this.clearBtn = $('#btn-land-clear');
    this.fileEl = $('#land-file');

    this.prefs = this._readPrefs();
    this._applyPrefs();
    this._bind();

    this.service.on('state', () => this.refresh());
    this.store.on('change', (e) => {
      // Undo/redo (from the toolbar, the keyboard or a toast) swaps the
      // geometries under us, so the "last cut" summary no longer describes
      // the map and is dropped rather than left lying.
      if (e && e.reason === 'history') this.lastRun = null;
      this.refresh();
    });
    this.store.on('selection', () => this.refresh());

    // A coastline cached in this browser comes back without touching the network.
    this.service.restoreCached(this.prefs.source);
    this.refresh();
  }

  /* ----------------------------------------------------------------- prefs */

  _readPrefs() {
    const saved = readPrefs() || {};
    const source = LAND_SOURCES[saved.source] ? saved.source : DEFAULT_SOURCE;
    const precision = ['fast', 'balanced', 'high'].includes(saved.precision) ? saved.precision : 'balanced';
    return { source, precision, cutLakes: !!saved.cutLakes };
  }

  _applyPrefs() {
    if (this.sourceEl) this.sourceEl.value = this.prefs.source;
    if (this.precisionEl) this.precisionEl.value = this.prefs.precision;
    if (this.lakesEl) this.lakesEl.checked = this.prefs.cutLakes;
  }

  _savePrefs() {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
  }

  /* ----------------------------------------------------------------- wiring */

  _bind() {
    on(this.cutBtn, 'click', () => this.cut('selected'));
    on(this.cutAllBtn, 'click', () => this.cut('all'));

    on(this.loadBtn, 'click', () => {
      const source = this.sourceEl.value;
      // Pressing Load again on the source you already have means "fetch it fresh".
      this.load(source, { force: this.service.state.source === source && this.service.isReady });
    });

    on(this.clearBtn, 'click', () => {
      if (!this.service.isReady && this.service.state.status !== 'error') {
        this.toast('No coastline is loaded.', { type: 'err' });
        return;
      }
      this.service.clear();
      this.lastRun = null;
      this.lakesNote = '';
      this.toast('Coastline data forgotten.', { type: 'ok' });
      this.refresh();
    });

    on(this.fileEl, 'change', async () => {
      const file = this.fileEl.files && this.fileEl.files[0];
      if (!file) return;
      this.busy = true;
      this.refresh();
      try {
        const ok = await this.service.loadFromFile(file);
        this.toast(ok
          ? `Using ${file.name} as the coastline.`
          : `Could not use ${file.name}: ${this.service.state.error || 'no polygons found'}`,
        { type: ok ? 'ok' : 'err', timeout: ok ? 3600 : 9000 });
        if (ok) this.lakesNote = '';
      } catch (err) {
        this.toast(`Could not read ${file.name}: ${err.message || err}`, { type: 'err', timeout: 9000 });
      } finally {
        this.busy = false;
        this.fileEl.value = '';
        this.refresh();
      }
    });

    on(this.sourceEl, 'change', () => {
      this.prefs.source = this.sourceEl.value;
      this._savePrefs();
      this.refresh();
    });

    on(this.precisionEl, 'change', () => {
      this.prefs.precision = this.precisionEl.value;
      this._savePrefs();
      this.refresh();
    });

    on(this.lakesEl, 'change', () => {
      this.prefs.cutLakes = this.lakesEl.checked;
      this._savePrefs();
      this.lakesNote = '';
      this.refresh();
    });
  }

  /* ------------------------------------------------------------ land data */

  async load(source = this.prefs.source, { force = false, quiet = false } = {}) {
    if (this.busy) return this.service.isReady;
    const known = LAND_SOURCES[source];
    if (!known) return false;

    this.busy = true;
    this.statusEl.textContent = `Downloading ${known.label} …`;
    this.refresh();
    try {
      const ok = await this.service.load(source, { force });
      if (ok) {
        this.toast(`Coastline ready: ${known.label}.`, { type: 'ok' });
      } else if (!quiet) {
        this.toast(`Could not download the coastline: ${this.service.state.error || 'unknown error'}`, {
          type: 'err',
          timeout: 10000,
          actions: [{ label: 'Use my own file', onClick: () => this.switchTab('data') }],
        });
      }
      return ok;
    } finally {
      this.busy = false;
      this.refresh();
    }
  }

  /** Lakes are a separate download, fetched only if you actually asked for them. */
  async ensureLakes() {
    if (!this.prefs.cutLakes || !this.service.isReady || this.service.land.hasLakes) return;
    this.statusEl.textContent = 'Downloading lakes …';
    const ok = await this.service.loadLakes();
    if (!ok) this.lakesNote = 'Lakes layer unavailable — inland water was kept as land.';
    else this.lakesNote = '';
  }

  /* ------------------------------------------------------------------ cut */

  /**
   * @param {'selected'|'all'} scope
   */
  async cut(scope = 'selected') {
    if (this.busy) return null;

    const targets = scope === 'all' ? this.store.features.slice() : this.store.selectedFeatures();
    if (!targets.length) {
      this.toast(scope === 'all'
        ? 'Nothing on the map to cut yet.'
        : 'Select one or more features first — or use “All features”.', { type: 'err' });
      return null;
    }

    if (!this.service.isReady) {
      this.switchTab('data');
      const ok = await this.load(this.prefs.source, { quiet: true });
      if (!ok) {
        this.toast(`Coastline download failed (${this.service.state.error || 'network'}). `
          + 'You can still cut against your own land GeoJSON from the Data tab.',
        { type: 'err', timeout: 12000 });
        return null;
      }
    }
    await this.ensureLakes();

    const options = {
      precision: this.prefs.precision,
      cutLakes: this.prefs.cutLakes && !!this.service.land.hasLakes,
    };

    this.busy = true;
    this.statusEl.textContent = `Cutting ${targets.length} feature${targets.length === 1 ? '' : 's'} …`;
    this.refresh();
    await tick();      // otherwise the message above never reaches the screen

    const started = Date.now();
    const results = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        if (i > 0 && i % YIELD_EVERY === 0) {
          this.statusEl.textContent = `Cutting ${i + 1} of ${targets.length} …`;
          await tick();
        }
        const feature = targets[i];
        const outcome = this.service.clip(feature.geometry, options);
        results.push({ feature, ...outcome });
      }
    } finally {
      this.busy = false;
    }
    const ms = Date.now() - started;

    const changed = results.filter((r) => !r.error && !r.empty && r.geometry);
    const atSea = results.filter((r) => !r.error && r.empty);
    const unsupported = results.filter((r) => r.error && r.error !== 'no-land-data');

    if (!changed.length) {
      const why = atSea.length === targets.length
        ? `${targets.length === 1 ? 'That feature is' : 'Those features are'} entirely over water — nothing to keep.`
        : 'Nothing could be cut against this coastline.';
      this.toast(why + (unsupported.length ? ` ${unsupported.length} unsupported geometr${unsupported.length === 1 ? 'y' : 'ies'}.` : ''),
        { type: 'err', timeout: 9000 });
      this.refresh();
      return null;
    }

    const stats = {
      features: changed.length,
      atSea: atSea.length,
      unsupported: unsupported.length,
      ms,
      options,
      areaBefore: changed.reduce((sum, r) => sum + (r.stats.areaBefore || 0), 0),
      areaAfter: changed.reduce((sum, r) => sum + (r.stats.areaAfter || 0), 0),
      removed: changed.reduce((sum, r) => sum + Math.max(0, (r.stats.areaBefore || 0) - (r.stats.areaAfter || 0)), 0),
      rings: changed.reduce((sum, r) => sum + (r.stats.rings || 0), 0),
      holes: changed.reduce((sum, r) => sum + (r.stats.holes || 0), 0),
      positions: changed.reduce((sum, r) => sum + (r.stats.positions || 0), 0),
      cellMeters: changed.reduce((max, r) => Math.max(max, r.stats.cellMeters || 0), 0),
      names: changed.slice(0, 3).map((r) => featureName(r.feature)),
    };

    // Discrete: cutting twice in a row must undo one cut at a time.
    this.store.mutate('cut-sea', () => {
      for (const result of changed) result.feature.geometry = result.geometry;
    }, { discrete: true });

    this.lastRun = stats;
    this.refresh();

    const pct = stats.areaBefore > 0 ? Math.round((stats.removed / stats.areaBefore) * 100) : 0;
    let message = stats.features === 1
      ? `Cut ${stats.names[0] || 'the feature'} to the shoreline`
      : `Cut ${stats.features} features to the shoreline`;
    if (stats.areaBefore > 0) message += ` — removed ${pct}% (${fmtArea(stats.removed)}) of sea`;
    message += '.';
    if (stats.atSea) {
      message += ` ${stats.atSea} left alone: entirely over water.`;
    }

    this.toast(message, {
      type: stats.atSea ? '' : 'ok',
      timeout: 9000,
      actions: [{
        label: 'Undo',
        onClick: () => {
          this.store.undo();
          this.lastRun = null;
          this.refresh();
        },
      }],
    });

    return stats;
  }

  /* --------------------------------------------------------------- render */

  refresh() {
    const state = this.service.state;
    const selected = this.store.selectionSize();
    const total = this.store.features.length;

    if (this.cutBtn) {
      this.cutBtn.disabled = this.busy || !total;
      this.cutBtn.textContent = this.busy ? 'Cutting …' : selected ? `Cut sea (${selected})` : 'Cut sea';
    }
    if (this.cutAllBtn) this.cutAllBtn.disabled = this.busy || !total;
    if (this.loadBtn) {
      this.loadBtn.disabled = this.busy;
      this.loadBtn.textContent = this.busy && state.status === 'loading' ? 'Loading …'
        : (this.service.isReady && state.source === this.sourceEl.value ? 'Reload coastline' : 'Load coastline');
    }
    if (this.clearBtn) this.clearBtn.disabled = this.busy || state.status === 'empty';
    if (this.sourceEl) this.sourceEl.disabled = this.busy;
    if (this.fileEl) this.fileEl.disabled = this.busy;

    this._renderStatus();
    this._renderInfo();
  }

  _renderStatus() {
    const state = this.service.state;
    const parts = [];

    if (this.busy && state.status !== 'loading') {
      parts.push('Working …');
    } else if (state.status === 'loading') {
      parts.push(`Downloading ${state.label || 'coastline'} …`);
    } else if (state.status === 'ready') {
      const loaded = state.source === this.sourceEl.value;
      parts.push(`${state.label}: ${state.features} land polygon${state.features === 1 ? '' : 's'}`
        + `${state.bytes ? `, ${fmtBytes(state.bytes)}` : ''}`
        + `${state.cached ? ', cached in this browser' : ''}.`);
      if (state.lakes) parts.push(`${state.lakes} lakes loaded.`);
      else if (this.prefs.cutLakes) {
        parts.push(state.source === 'custom'
          ? 'Lakes need a Natural Earth shoreline — with your own file, inland water stays land.'
          : 'Lakes will be fetched on the first cut.');
      }
      if (!loaded) parts.push(`Select “Load coastline” to switch to ${LAND_SOURCES[this.sourceEl.value].label}.`);
    } else if (state.status === 'error') {
      parts.push(`Could not load: ${state.error || 'unknown error'}`);
      parts.push('Check the connection, try another resolution, or use your own land GeoJSON below.');
    } else {
      parts.push('No coastline loaded yet.');
      parts.push(`Pick a resolution and press Load — ${LAND_SOURCES[this.sourceEl.value].detail}.`);
    }
    if (this.lakesNote) parts.push(this.lakesNote);

    this.statusEl.textContent = parts.join(' ');
  }

  _renderInfo() {
    const rows = [];
    const state = this.service.state;

    rows.push(['Shoreline', state.status === 'ready' ? state.label : 'not loaded']);
    rows.push(['Cut detail', this.precisionEl.value === 'fast' ? 'fast'
      : this.precisionEl.value === 'high' ? 'high' : 'balanced']);
    if (this.prefs.cutLakes) rows.push(['Lakes', state.lakes ? `${state.lakes} loaded` : 'on demand']);

    const run = this.lastRun;
    if (run) {
      if (run.cellMeters) rows.push(['Grid cell', `${Math.round(run.cellMeters)} m`]);
      if (run.areaBefore > 0) {
        rows.push(['Sea removed', `${fmtArea(run.removed)} (${Math.round((run.removed / run.areaBefore) * 100)}%)`]);
        rows.push(['Land kept', fmtArea(run.areaAfter)]);
      }
      rows.push(['Vertices', String(run.positions)]);
      if (run.holes) rows.push(['Holes', String(run.holes)]);
      rows.push(['Took', `${run.ms} ms`]);
    }

    this.infoEl.replaceChildren(...rows.flatMap(([key, value]) => [
      el('span', { text: key }),
      el('span', { text: value, style: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink)' } }),
    ]));
  }

  /** Handy for tests and the console: the whole coastline pipeline in one call. */
  get state() { return this.service.state; }
  get land() { return this.service.land; }
}

export { PREFS_KEY };
