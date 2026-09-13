/**
 * Styles tab.
 *
 * With nothing selected it edits the defaults used for the next shape you
 * draw; with a selection it edits those features. Fill can be a plain colour,
 * your own image, or a flag found through Wikimedia Commons search.
 */

import { $, $$, el, on, segmented, clamp } from '../core/util.js';
import { searchFiles, resolveFile, stripHtml, commonsTitleFromUrl } from './commons.js';

const SIZE_DEFAULT = { screen: 72, ground: 20000 };

export class StylesPanel {
  constructor({ store, view, images, toast }) {
    this.store = store;
    this.view = view;
    this.images = images;
    this.toast = toast;

    this.results = [];
    this.picked = null;
    this.searching = false;
    this._self = false;

    this.segFillMode = segmented($('#fill-mode-seg'), (v) => this.setFillMode(v));
    this.segLayout = segmented($('#img-layout-seg'), (v) => this.setImage({ layout: v }, 'layout'));
    this.segAnchor = segmented($('#img-anchor-seg'), (v) => this.setAnchor(v));
    this.segFit = segmented($('#img-fit-seg'), (v) => this.setImage({ fit: v }, 'fit'));

    this._bind();

    store.on('selection', () => this.refresh());
    store.on('change', (e) => {
      if (this._self) return;                       // our own edit is already in sync
      const reason = e && e.reason;
      if (['live', 'move', 'vertex', 'nudge', 'noop'].includes(reason)) return;
      this.refresh();
    });

    this.refresh();
  }

  /* --------------------------------------------------------------- helpers */

  get style() { return this.store.editStyle(); }
  get image() { return this.style['image-fill']; }

  /** Patch the style of whatever the panel is currently scoped to. */
  patch(patch, key = 'style') {
    this._self = true;
    try {
      this.store.setStyle(patch, null, key);
    } finally {
      this._self = false;
    }
  }

  /** Called by the app when an image finishes (or fails) loading. */
  onImageChange() { this.renderSourceCard(); }

  setImage(patch, key = 'style') {
    const merged = { ...this.style['image-fill'], ...patch };
    this.patch({ 'image-fill': merged }, key);
    this.syncImageOptions();
    this.renderSourceCard();
  }

  /* ---------------------------------------------------------------- wiring */

  _bind() {
    const store = this.store;

    on($('#btn-apply-all'), 'click', () => {
      if (!store.features.length) { this.toast('Nothing on the map to style yet.', { type: 'err' }); return; }
      store.setStyle(this.style, 'all', 'style-all');
      this.toast(`Styled ${store.features.length} feature${store.features.length > 1 ? 's' : ''}.`, {
        type: 'ok', actions: [{ label: 'Undo', onClick: () => store.undo() }],
      });
      this.refresh();
    });

    on($('#btn-reset-style'), 'click', () => {
      store.resetStyle(null);
      this.refresh();
      this.toast('Style reset.', { actions: [{ label: 'Undo', onClick: () => store.undo() }] });
    });

    /* ---- solid fill ---- */
    on($('#fill-color'), 'input', (e) => this.patch({ fill: e.target.value }, 'fill-color'));
    on($('#fill-opacity'), 'input', (e) => {
      $('#fill-opacity-out').textContent = `${e.target.value}%`;
      this.patch({ 'fill-opacity': Number(e.target.value) / 100 }, 'fill-opacity');
    });

    /* ---- image source ---- */
    on($('#btn-upload'), 'click', () => $('#img-file').click());
    on($('#img-file'), 'change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) await this.applyUpload(file);
    });
    on($('#btn-load-url'), 'click', () => this.applyUrl($('#img-url').value));
    on($('#img-url'), 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.applyUrl(e.target.value); } });
    on($('#btn-clear-img'), 'click', () => {
      this.setImage({ url: null, name: '', source: 'upload', attribution: '', page: '', license: '' }, 'image-clear');
      if (this.style['fill-mode'] === 'commons') this.setFillMode('image', { silentModel: true });
      this.refresh();
    });

    /* ---- image options ---- */
    on($('#img-size'), 'input', (e) => {
      const unit = this.image.anchor === 'ground' ? 'm' : 'px';
      $('#img-size-unit').textContent = unit;
      this.setImage({ size: clamp(Number(e.target.value) || 0, 1, 1e6) }, 'img-size');
    });
    on($('#img-rotation'), 'input', (e) => {
      $('#img-rotation-out').innerHTML = `${e.target.value}&deg;`;
      this.setImage({ rotation: Number(e.target.value) }, 'img-rotation');
    });
    on($('#img-rotation2'), 'input', (e) => {
      this.setImage({ rotation: Number(e.target.value) || 0 }, 'img-rotation');
    });
    on($('#img-ox'), 'input', (e) => this.setImage({ offsetX: Number(e.target.value) || 0 }, 'img-offset'));
    on($('#img-oy'), 'input', (e) => this.setImage({ offsetY: Number(e.target.value) || 0 }, 'img-offset'));
    on($('#img-no-upscale'), 'change', (e) => this.setImage({ noUpscale: e.target.checked }, 'img-upscale'));
    on($('#img-cwidth'), 'input', (e) => this.setImage({ width: clamp(Number(e.target.value) || 1, 4, 4000) }, 'img-width'));
    on($('#img-opacity'), 'input', (e) => {
      $('#img-opacity-out').textContent = `${e.target.value}%`;
      this.setImage({ opacity: Number(e.target.value) / 100 }, 'img-opacity');
    });
    on($('#img-backdrop-on'), 'change', (e) => this.setImage({ backdropOn: e.target.checked }, 'img-backdrop'));
    on($('#img-backdrop'), 'input', (e) => this.setImage({ backdrop: e.target.value, backdropOn: true }, 'img-backdrop'));

    /* ---- outline ---- */
    on($('#stroke-color'), 'input', (e) => this.patch({ stroke: e.target.value }, 'stroke-color'));
    on($('#stroke-width'), 'input', (e) => {
      $('#stroke-width-out').textContent = `${e.target.value} px`;
      this.patch({ 'stroke-width': Number(e.target.value) }, 'stroke-width');
    });
    on($('#stroke-opacity'), 'input', (e) => {
      $('#stroke-opacity-out').textContent = `${e.target.value}%`;
      this.patch({ 'stroke-opacity': Number(e.target.value) / 100 }, 'stroke-opacity');
    });
    on($('#stroke-dash'), 'change', (e) => this.patch({ 'stroke-dash': e.target.value }, 'stroke-dash'));

    /* ---- label ---- */
    on($('#label-show'), 'change', (e) => this.patch({ label: { show: e.target.checked } }, 'label'));
    on($('#label-size'), 'input', (e) => {
      $('#label-size-out').textContent = `${e.target.value} px`;
      this.patch({ label: { size: Number(e.target.value) } }, 'label-size');
    });
    on($('#label-color'), 'input', (e) => this.patch({ label: { color: e.target.value } }, 'label-color'));

    /* ---- commons search ---- */
    on($('#cc-search'), 'click', () => this.search());
    on($('#cc-q'), 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.search(); } });
    on($('#cc-sort'), 'change', () => { if (this.results.length || $('#cc-q').value.trim()) this.search(); });

    /* Drag & drop an image anywhere on the map or sidebar → image fill. */
    const dropTargets = [document.getElementById('mapwrap'), document.getElementById('sidebar')];
    for (const target of dropTargets) {
      on(target, 'dragover', (e) => {
        if (!this.hasImageFiles(e)) return;
        e.preventDefault();
        target.classList.add('dropping');
      });
      on(target, 'dragleave', () => target.classList.remove('dropping'));
      on(target, 'drop', async (e) => {
        if (!this.hasImageFiles(e)) return;
        e.preventDefault();
        target.classList.remove('dropping');
        const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
        if (file) await this.applyUpload(file);
      });
    }
  }

  hasImageFiles(e) {
    const types = (e.dataTransfer && e.dataTransfer.types) || [];
    return Array.from(types).includes('Files');
  }

  /* ------------------------------------------------------------ fill mode */

  setFillMode(mode, { silentModel = false } = {}) {
    if (!silentModel) {
      const patch = { 'fill-mode': mode };
      // A colour fill defaults to 25% so shapes stay see-through, but an image
      // at 25% just looks washed out — lift it to full and let the separate
      // "Image opacity" slider do the blending from there.
      if (mode !== 'solid' && this.style['fill-opacity'] < 1) patch['fill-opacity'] = 1;
      this.patch(patch, 'fill-mode');
    }
    this.segFillMode.set(mode);
    this.syncModeVisibility();
  }

  syncModeVisibility() {
    const mode = this.style['fill-mode'];
    for (const body of $$('.mode-body')) {
      body.hidden = body.dataset.mode !== mode;
    }
    this.segFillMode.set(mode);
    this.syncImageOptions();
  }

  syncImageOptions() {
    const style = this.style;
    const image = style['image-fill'];

    $('#img-options').hidden = !(style['fill-mode'] !== 'solid');
    $('#opt-tile').hidden = image.layout !== 'tile';
    $('#opt-stretch').hidden = image.layout !== 'stretch';
    $('#opt-center').hidden = image.layout !== 'center';

    this.segLayout.set(image.layout);
    this.segAnchor.set(image.anchor);
    this.segFit.set(image.fit);

    const unit = image.anchor === 'ground' ? 'm' : 'px';
    const sizeInput = $('#img-size');
    sizeInput.max = image.anchor === 'ground' ? '2000000' : '3000';
    sizeInput.min = image.anchor === 'ground' ? '1' : '4';
    $('#img-size-unit').textContent = unit;
    $('#anchor-badge').textContent = image.anchor === 'ground' ? 'Ground size' : 'Screen size';

    this.renderSourceCard();
  }

  setAnchor(anchor) {
    const size = SIZE_DEFAULT[anchor] ?? 72;
    this.setImage({ anchor, unit: anchor === 'ground' ? 'm' : 'px', size }, 'img-anchor');
  }

  /* ---------------------------------------------------------------- values */

  refresh() {
    const style = this.style;
    const scope = this.store.styleScope();

    $('#style-scope').textContent = scope === 'default'
      ? 'Defaults for new'
      : scope === 'single' ? '1 feature' : `${this.store.selectionSize()} features`;
    $('#style-scope').classList.toggle('accent', scope !== 'default');

    $('#fill-color').value = style.fill;
    $('#fill-opacity').value = String(Math.round(style['fill-opacity'] * 100));
    $('#fill-opacity-out').textContent = `${Math.round(style['fill-opacity'] * 100)}%`;

    $('#stroke-color').value = style.stroke;
    $('#stroke-width').value = String(style['stroke-width']);
    $('#stroke-width-out').textContent = `${style['stroke-width']} px`;
    $('#stroke-opacity').value = String(Math.round(style['stroke-opacity'] * 100));
    $('#stroke-opacity-out').textContent = `${Math.round(style['stroke-opacity'] * 100)}%`;
    $('#stroke-dash').value = style['stroke-dash'];

    $('#label-show').checked = !!style.label.show;
    $('#label-size').value = String(style.label.size);
    $('#label-size-out').textContent = `${style.label.size} px`;
    $('#label-color').value = style.label.color;

    const image = style['image-fill'];
    $('#img-size').value = String(image.size);
    $('#img-rotation').value = String(image.rotation);
    $('#img-rotation-out').innerHTML = `${image.rotation}&deg;`;
    $('#img-rotation2').value = String(image.rotation);
    $('#img-ox').value = String(image.offsetX);
    $('#img-oy').value = String(image.offsetY);
    $('#img-no-upscale').checked = !!image.noUpscale;
    $('#img-cwidth').value = String(image.width);
    $('#img-opacity').value = String(Math.round(image.opacity * 100));
    $('#img-opacity-out').textContent = `${Math.round(image.opacity * 100)}%`;
    $('#img-backdrop-on').checked = !!image.backdropOn;
    $('#img-backdrop').value = image.backdrop || '#ffffff';

    this.syncModeVisibility();
  }

  /* -------------------------------------------------------- image sources */

  renderSourceCard() {
    const host = $('#img-source-card');
    const style = this.style;
    const image = style['image-fill'];
    const mode = style['fill-mode'];

    if (mode === 'solid' || !image.url) {
      host.replaceChildren(el('div', { class: 'notice' }, [
        mode === 'commons'
          ? 'Search Wikimedia Commons below and pick a flag to fill the shape with.'
          : 'Upload a picture or paste an image URL, then choose how it covers the shape.',
      ]));
      return;
    }

    const entry = this.images.get(image.url);
    const state = entry ? entry.state : 'loading';
    const dims = entry && entry.width ? `${entry.width} × ${entry.height} px` : state === 'loading' ? 'loading…' : 'unavailable';
    const thumb = el('div', { class: 'thumb' });
    thumb.style.backgroundImage = `url("${encodeURI(image.url).replace(/"/g, '%22')}")`;

    const info = el('div', { class: 'info' }, [
      el('div', { class: 't', text: image.name || shortUrl(image.url) }),
      el('div', { class: 's', text: `${sourceLabel(image.source)} · ${dims}${image.anchor === 'ground' ? ' · ground size' : ''}` }),
      image.attribution ? el('div', { class: 'a' }, [
        image.page ? el('a', { href: image.page, target: '_blank', rel: 'noopener noreferrer', text: image.attribution })
          : document.createTextNode(image.attribution),
      ]) : null,
      state === 'error' ? el('div', { class: 'a', style: { color: 'var(--danger)' }, text: 'Could not load this image.' }) : null,
    ]);

    host.replaceChildren(el('div', { class: 'src-card' }, [thumb, info]));
  }

  async applyUpload(file) {
    if (!file.type.startsWith('image/')) {
      this.toast('That file is not an image.', { type: 'err' });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.toast('Images must be under 25 MB.', { type: 'err' });
      return;
    }
    const url = URL.createObjectURL(file);
    const entry = await this.images.load(url, { name: file.name, bytes: file.size });
    if (!entry || entry.state !== 'ready') {
      this.toast(`Could not read “${file.name}”.`, { type: 'err' });
      this.images.remove(url);
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      return;
    }
    this.setFillMode('image');
    this.setImage({
      url,
      name: file.name,
      source: 'upload',
      attribution: '',
      page: '',
      license: '',
    }, 'image-set');
    this.toast(`Image fill: ${file.name}`, { type: 'ok' });
  }

  async applyUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) { this.toast('Paste an image URL first.', { type: 'err' }); return; }
    if (!/^(https?:|data:)/i.test(url)) {
      this.toast('Use a full http(s) image URL.', { type: 'err' });
      return;
    }

    // Pasting a Wikimedia Commons *page* link: resolve it to the file itself.
    const commonsTitle = commonsTitleFromUrl(url);
    if (commonsTitle) {
      this.setFillMode('commons');
      this.setStatus('Resolving the Commons file…', true);
      try {
        const item = {
          pageid: 0, title: commonsTitle, width: 0, height: 0, mime: '',
          thumb: url, url, pageUrl: url, author: '', license: '',
        };
        await this.applyPicked(item, 'stretch');
        $('#cc-q').value = commonsTitle.replace(/^File:/i, '');
      } catch (err) {
        this.setStatus(err && err.message ? err.message : 'Could not resolve that Commons link.');
      }
      return;
    }

    this.setFillMode('image');
    this.setImage({ url, name: shortUrl(url), source: 'url', attribution: '', page: '', license: '' }, 'image-set');
    const entry = await this.images.load(url, { name: shortUrl(url) });
    if (!entry || entry.state !== 'ready') {
      this.toast('That image would not load. The host may block cross-origin use.', { type: 'err' });
      return;
    }
    this.renderSourceCard();
    this.toast('Image loaded.', { type: 'ok' });
  }

  /* ------------------------------------------------------- Commons search */

  async search() {
    const query = $('#cc-q').value.trim();
    if (!query) { this.setStatus('Type something to search for, e.g. “Nepal”.'); return; }
    if (this.searching) return;

    this.searching = true;
    this.setStatus('', true);
    $('#cc-results').replaceChildren();
    $('#cc-picked').replaceChildren();
    this.picked = null;

    try {
      const items = await searchFiles(query, {
        flagOnly: $('#cc-flagonly').checked,
        sort: $('#cc-sort').value,
        limit: 30,
      });
      this.results = items;
      if (!items.length) {
        this.setStatus('No usable images found. Try a broader search, or untick “flags only”.');
        return;
      }
      this.setStatus(`${items.length} result${items.length > 1 ? 's' : ''} from Wikimedia Commons — click one to preview it.`);
      this.renderResults();
    } catch (err) {
      this.results = [];
      this.setStatus(err && err.message ? err.message : 'Search failed.');
    } finally {
      this.searching = false;
    }
  }

  setStatus(text, busy = false) {
    const node = $('#cc-status');
    node.replaceChildren();
    if (busy) {
      node.appendChild(el('span', { class: 'spin' }));
      node.appendChild(document.createTextNode(' Searching Wikimedia Commons…'));
      node.classList.remove('err');
      return;
    }
    node.textContent = text;
    node.classList.toggle('err', /fail|cannot|could not|no usable/i.test(text));
  }

  renderResults() {
    const host = $('#cc-results');
    const nodes = this.results.map((item) => {
      const img = el('img', { src: item.thumb, alt: item.title, loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => img.replaceWith(el('span', { class: 'tag', text: 'no preview' })));
      const node = el('button', {
        class: 'result', type: 'button', title: `${item.title}\n${item.author || ''} ${item.license || ''}`.trim(),
        'data-id': String(item.pageid),
      }, [img, el('span', { class: 'tag', text: cleanTitle(item.title) })]);
      node.addEventListener('click', () => this.pick(item, node));
      node.addEventListener('dblclick', () => this.applyPicked(item));
      return node;
    });
    host.replaceChildren(...nodes);
  }

  pick(item, node) {
    this.picked = item;
    for (const n of $$('#cc-results .result')) n.classList.toggle('sel', n === node);

    const thumb = el('div', { class: 'thumb' });
    thumb.style.backgroundImage = `url("${encodeURI(item.thumb).replace(/"/g, '%22')}")`;

    $('#cc-picked').replaceChildren(el('div', { class: 'src-card', style: { marginTop: '9px' } }, [
      thumb,
      el('div', { class: 'info' }, [
        el('div', { class: 't', text: cleanTitle(item.title) }),
        el('div', { class: 's', text: `${item.width} × ${item.height} · ${item.mime.replace('image/', '')}` }),
        el('div', { class: 'a' }, [
          item.author ? document.createTextNode(`${stripHtml(item.author)}${item.license ? ` · ${item.license}` : ''}`) : null,
          item.pageUrl ? el('a', { href: item.pageUrl, target: '_blank', rel: 'noopener noreferrer', text: ' file page' }) : null,
        ]),
        el('div', { class: 'row tight', style: { marginTop: '6px' } }, [
          el('button', {
            class: 'btn small primary', type: 'button', text: 'Use as fill',
            onclick: () => this.applyPicked(item),
          }),
          el('button', {
            class: 'btn small', type: 'button', text: 'Tile instead',
            onclick: () => this.applyPicked(item, 'tile'),
          }),
        ]),
      ]),
    ]));
  }

  async applyPicked(item, layout = 'stretch') {
    if (!item) return;
    this.setStatus('Fetching a high-resolution render…', true);
    try {
      const file = await resolveFile(item.title, 1400);
      const entry = await this.images.load(file.thumb, { name: cleanTitle(item.title) });
      if (!entry || entry.state !== 'ready') throw new Error('The image would not load.');

      this.setFillMode('commons');
      this.setImage({
        url: file.thumb,
        name: cleanTitle(item.title),
        source: 'commons',
        layout,
        fit: layout === 'stretch' ? 'cover' : this.image.fit,
        size: layout === 'tile' ? (this.image.anchor === 'ground' ? 20000 : 72) : this.image.size,
        attribution: file.attribution,
        license: file.license,
        page: file.pageUrl,
      }, 'image-set');

      this.setStatus(`Applied “${cleanTitle(item.title)}”. ${file.attribution}`);
      this.toast('Flag fill applied.', { type: 'ok' });
      this.renderSourceCard();
    } catch (err) {
      this.setStatus(err && err.message ? err.message : 'Could not apply that file.');
      this.toast('Could not apply that Commons file.', { type: 'err' });
    }
  }
}

/* ------------------------------------------------------------- formatting */

function shortUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    const name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname);
    return name.length > 42 ? `${name.slice(0, 40)}…` : name;
  } catch {
    return String(url).slice(0, 42);
  }
}

function sourceLabel(source) {
  return { upload: 'your file', url: 'from URL', commons: 'Wikimedia Commons' }[source] || 'image';
}

function cleanTitle(title) {
  return String(title || '').replace(/^(File|Image):/i, '').replace(/\.[a-z0-9]+$/i, '');
}

export { cleanTitle, shortUrl };
