/**
 * Features tab: the layer list, the property editor for the current selection
 * and the per-feature actions.
 */

import {
  $, el, on, withAlpha, fmtArea, fmtLength, clamp,
} from '../core/util.js';
import { featureName, styleOf, STYLE_KEYS } from '../core/geojson.js';
import {
  eachPosition, bboxOfGeometry, geometryArea, geometryLength, bboxOfFeatures,
} from '../core/geo.js';

const ICON = {
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 8.5v5M8.5 11h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 00-2 2v9"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
};

const TYPE_LABEL = {
  Point: 'point', MultiPoint: 'multi-point', LineString: 'line', MultiLineString: 'multi-line',
  Polygon: 'polygon', MultiPolygon: 'multi-polygon',
};

function countVertices(geometry) {
  let n = 0;
  eachPosition(geometry, () => { n++; });
  return n;
}

export class FeaturesPanel {
  constructor({ store, view, toast }) {
    this.store = store;
    this.view = view;
    this.toast = toast;

    this.listEl = $('#feat-list');
    this.emptyEl = $('#feat-empty');
    this.editorEl = $('#feat-editor');
    this.countEl = $('#feat-count');
    this.nameEl = $('#prop-name');
    this.descEl = $('#prop-desc');
    this.propListEl = $('#prop-list');
    this.statsEl = $('#feat-stats');

    this._frame = 0;
    this._bind();

    store.on('change', (e) => this.schedule(e && e.reason));
    store.on('selection', () => this.schedule());
    this.refresh();
  }

  /* --------------------------------------------------------------- wiring */

  _bind() {
    on($('#btn-zoom-all'), 'click', () => {
      const bounds = bboxOfFeatures(this.store.features);
      if (!bounds) { this.toast('Nothing on the map yet.', { type: 'err' }); return; }
      this.view.fitBounds(bounds, { animate: true });
    });

    on($('#btn-clear-all'), 'click', () => {
      if (!this.store.features.length) return;
      const n = this.store.features.length;
      this.toast(`Deleted ${n} feature${n > 1 ? 's' : ''}.`, {
        type: 'ok',
        actions: [{ label: 'Undo', onClick: () => this.store.undo() }],
      });
      this.store.clearAll();
    });

    on(this.nameEl, 'input', () => {
      const feature = this.primary();
      if (!feature) return;
      this.store.setProperty(feature.id, 'name', this.nameEl.value, `name:${feature.id}`);
      this.renderList();
    });

    on(this.descEl, 'input', () => {
      const feature = this.primary();
      if (!feature) return;
      this.store.setProperty(feature.id, 'description', this.descEl.value, `desc:${feature.id}`);
    });

    on($('#btn-add-prop'), 'click', () => {
      const feature = this.primary();
      if (!feature) return;
      let key = 'key';
      let i = 1;
      const props = feature.properties || {};
      while (Object.prototype.hasOwnProperty.call(props, key)) key = `key${i++}`;
      this.store.addProperty(feature.id, key);
      this.renderEditor();
      const inputs = this.propListEl.querySelectorAll('input.prop-key');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    on($('#btn-zoom-feat'), 'click', () => this.zoomToSelection());
    on($('#btn-dup-feat'), 'click', () => {
      const copies = this.store.duplicateSelected();
      if (copies.length) this.toast(`Duplicated ${copies.length} feature${copies.length > 1 ? 's' : ''}.`);
    });
    on($('#btn-del-feat'), 'click', () => {
      const n = this.store.removeSelected();
      if (n) this.toast(`Deleted ${n} feature${n > 1 ? 's' : ''}.`, {
        type: 'ok', actions: [{ label: 'Undo', onClick: () => this.store.undo() }],
      });
    });
    on($('#btn-up-feat'), 'click', () => {
      const feature = this.primary();
      if (feature) this.store.reorder(feature.id, 1);
    });
    on($('#btn-down-feat'), 'click', () => {
      const feature = this.primary();
      if (feature) this.store.reorder(feature.id, -1);
    });
  }

  schedule(reason) {
    if (reason === 'live' || reason === 'move' || reason === 'vertex' || reason === 'nudge') {
      this.scheduleStats();
      return;
    }
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this.refresh();
    });
  }

  scheduleStats() {
    if (this._statsFrame) return;
    this._statsFrame = requestAnimationFrame(() => {
      this._statsFrame = 0;
      this.renderStats();
      this.renderListMeta();
    });
  }

  primary() {
    const selected = this.store.selectedFeatures();
    return selected.length ? selected[0] : null;
  }

  /* ------------------------------------------------------------- rendering */

  refresh() {
    this.renderList();
    this.renderEditor();
  }

  renderList() {
    const features = this.store.features;
    this.countEl.textContent = String(features.length);
    this.emptyEl.hidden = features.length > 0;
    this.listEl.hidden = features.length === 0;

    const rows = [];
    // Topmost drawn feature first, like a layers panel.
    for (let i = features.length - 1; i >= 0; i--) rows.push(this.row(features[i]));
    this.listEl.replaceChildren(...rows);
  }

  /** Update only the small text under each name (cheap, used while dragging). */
  renderListMeta() {
    for (const node of this.listEl.children) {
      const feature = this.store.byId(node.dataset.id);
      const sub = node.querySelector('.sub');
      if (feature && sub) sub.textContent = this.subtitle(feature);
    }
  }

  subtitle(feature) {
    const type = TYPE_LABEL[feature.geometry.type] || feature.geometry.type;
    const bits = [type, `${countVertices(feature.geometry)} pts`];
    const area = geometryArea(feature.geometry);
    const length = geometryLength(feature.geometry);
    if (area > 0) bits.push(fmtArea(area));
    else if (length > 0) bits.push(fmtLength(length));
    return bits.join(' · ');
  }

  row(feature) {
    const style = styleOf(feature);
    const selected = this.store.selection.has(feature.id);

    const swatch = el('div', { class: 'swatch' });
    this.paintSwatch(swatch, style);

    const node = el('div', {
      class: `feat${selected ? ' sel' : ''}`,
      'data-id': feature.id,
      title: 'Click to select · double-click to zoom to it',
    }, [
      swatch,
      el('div', { class: 'meta' }, [
        el('div', { class: 'name', text: featureName(feature) }),
        el('div', { class: 'sub', text: this.subtitle(feature) }),
      ]),
      el('div', { class: 'acts' }, [
        el('button', {
          class: 'icon-btn', title: 'Zoom to feature', html: ICON.zoom,
          onclick: (e) => { e.stopPropagation(); this.store.select(feature.id); this.zoomTo(feature); },
        }),
        el('button', {
          class: 'icon-btn', title: 'Duplicate', html: ICON.copy,
          onclick: (e) => { e.stopPropagation(); this.store.select(feature.id); this.store.duplicateSelected(); },
        }),
        el('button', {
          class: 'icon-btn danger', title: 'Delete', html: ICON.trash,
          onclick: (e) => {
            e.stopPropagation();
            this.store.select(feature.id);
            this.store.removeSelected();
            this.toast('Feature deleted.', { type: 'ok', actions: [{ label: 'Undo', onClick: () => this.store.undo() }] });
          },
        }),
      ]),
    ]);

    node.addEventListener('click', (e) => this.store.select(feature.id, { additive: e.shiftKey }));
    node.addEventListener('dblclick', () => this.zoomTo(feature));
    return node;
  }

  paintSwatch(node, style) {
    const image = style['image-fill'];
    const useImage = style['fill-mode'] !== 'solid' && image && image.url;
    node.style.backgroundColor = '#ffffff';
    if (useImage) {
      node.style.backgroundImage = `url("${encodeURI(image.url).replace(/"/g, '%22')}")`;
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center';
    } else {
      node.style.backgroundImage = `linear-gradient(${withAlpha(style.fill, clamp(style['fill-opacity'], 0, 1))}, ${withAlpha(style.fill, clamp(style['fill-opacity'], 0, 1))})`;
    }
    node.style.boxShadow = `inset 0 0 0 2px ${style.stroke}`;
  }

  zoomTo(feature) {
    const bbox = bboxOfGeometry(feature.geometry);
    if (!bbox) return;
    this.view.fitBounds(bbox, { padding: 70, animate: true });
  }

  zoomToSelection() {
    const selected = this.store.selectedFeatures();
    if (!selected.length) return;
    const bbox = bboxOfFeatures(selected);
    if (bbox) this.view.fitBounds(bbox, { padding: 70, animate: true });
  }

  renderEditor() {
    const selected = this.store.selectedFeatures();
    this.editorEl.hidden = selected.length === 0;
    if (!selected.length) return;

    const feature = selected[0];
    const props = feature.properties || {};
    const active = document.activeElement;

    if (active !== this.nameEl) this.nameEl.value = props.name || '';
    if (active !== this.descEl) this.descEl.value = props.description || '';
    this.nameEl.placeholder = selected.length > 1 ? `${selected.length} features selected` : 'Untitled feature';

    // Generic properties (style keys are edited in the Styles tab).
    const rows = [];
    for (const [key, value] of Object.entries(props)) {
      if (STYLE_KEYS.includes(key) || key === 'name' || key === 'description') continue;
      if (value !== null && typeof value === 'object') continue;
      rows.push(this.propRow(feature.id, key, value));
    }
    this.propListEl.replaceChildren(...rows);

    this.renderStats();

    const multi = selected.length > 1;
    $('#btn-dup-feat').textContent = multi ? `Duplicate ${selected.length}` : 'Duplicate';
    $('#btn-del-feat').textContent = multi ? `Delete ${selected.length}` : 'Delete';
  }

  propRow(id, key, value) {
    const keyInput = el('input', { class: 'prop-key', type: 'text', value: key, 'aria-label': 'Property name' });
    const valInput = el('input', { class: 'prop-val', type: 'text', value: value === null || value === undefined ? '' : String(value), 'aria-label': 'Property value' });
    const remove = el('button', {
      class: 'icon-btn danger', title: 'Remove property', html: ICON.trash,
      onclick: () => {
        this.store.mutate('props', () => {
          const feature = this.store.byId(id);
          if (feature && feature.properties) delete feature.properties[key];
        });
      },
    });

    keyInput.addEventListener('change', () => {
      const next = keyInput.value.trim();
      if (!next || next === key) { keyInput.value = key; return; }
      this.store.mutate('props', () => {
        const feature = this.store.byId(id);
        if (!feature) return;
        const props = { ...(feature.properties || {}) };
        const val = props[key];
        delete props[key];
        props[next] = val;
        feature.properties = props;
      });
    });
    valInput.addEventListener('input', () => {
      this.store.setProperty(id, key, valInput.value, `props:${id}:${key}`);
    });

    return el('div', { class: 'prop-row' }, [keyInput, valInput, remove]);
  }

  renderStats() {
    const selected = this.store.selectedFeatures();
    if (!selected.length) return;
    const feature = selected[0];
    const geometry = feature.geometry;
    const area = geometryArea(geometry);
    const length = geometryLength(geometry);
    const bbox = bboxOfGeometry(geometry);

    const rows = [
      ['Type', TYPE_LABEL[geometry.type] || geometry.type],
      ['Vertices', String(countVertices(geometry))],
    ];
    if (area > 0) rows.push(['Area', fmtArea(area)]);
    if (length > 0) rows.push([area > 0 ? 'Perimeter' : 'Length', fmtLength(length)]);
    if (bbox) {
      rows.push(['Centre', `${bbox.minLat.toFixed(3)}, ${bbox.minLng.toFixed(3)} →`]);
    }
    if (selected.length > 1) rows.push(['Selected', `${selected.length} features`]);

    this.statsEl.replaceChildren(...rows.flatMap(([k, v]) => [
      el('span', { text: k }),
      el('span', { text: v, style: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink)' } }),
    ]));
  }
}
