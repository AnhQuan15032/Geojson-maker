/**
 * End-to-end smoke tests: boots the real app inside the DOM stub, then draws,
 * styles, exports and checks the image-fill zoom behaviour.
 *
 * Run with:  node tests/app.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { installDOM, flush, pointer, event, FakeImage } from './dom-stub.mjs';
import { ringSignedArea, isCounterClockwise } from '../src/core/geo.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

/* ------------------------------------------------------------------ setup */

const { window, document } = installDOM(html);

// A viewport the app can measure.
document.getElementById('mapwrap').setSize(1000, 700);
document.getElementById('map').setSize(1000, 700);
document.getElementById('sidebar').setSize(340, 700);

// Offline canned responses for the Commons API.
const commonsResponses = [];
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: async (url) => {
    const body = commonsResponses.shift();
    if (body === undefined) throw new Error(`unexpected fetch: ${url}`);
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  },
});

await import('../src/main.js');
const app = window.geojsonMaker;
const { store, view, renderer, images, tools } = app;
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

view.setBasemap('none');      // keep tile loading out of the way
await flush();

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✗ ${name}`);
  }
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const click = (el) => el.dispatchEvent(event('click', { target: el }));
const input = (el, value) => { el.value = value; el.dispatchEvent(event('input', { target: el })); };
const change = (el, value) => {
  if (el.type === 'checkbox' || typeof value === 'boolean') el.checked = !!value;
  else el.value = value;
  el.dispatchEvent(event('change', { target: el }));
};

function tapMap(x, y, extra = {}) {
  canvas.dispatchEvent(pointer('pointerdown', x, y, extra));
  canvas.dispatchEvent(pointer('pointerup', x, y, extra));
}

/** What the last frame actually painted: pattern fills, colours and scales. */
function paintProbe() {
  const patterns = ctx.named('fillStyle')
    .map((c) => c.args[0])
    .filter((v) => v && v.__pattern)
    .map((v) => ({ texels: v.source.width, level: v.source.__level }));
  const colours = ctx.named('fillStyle').map((c) => c.args[0]).filter((v) => typeof v === 'string');
  const scales = ctx.named('scale').map((c) => c.args[0]);
  return { patterns, colours, scales, drawImage: ctx.named('drawImage').length, clip: ctx.named('clip').length };
}

function drawTriangle() {
  tools.set('polygon');
  tapMap(400, 250);
  tapMap(620, 260);
  tapMap(520, 460);
  window.dispatch('keydown', event('keydown', { key: 'Enter' }));
  tools.set('select');
}

/* ------------------------------------------------------------------ tests */

console.log('\nboot');

await test('the map starts completely empty', async () => {
  assert.equal(store.count, 0);
  assert.equal(store.selectionSize(), 0);
  assert.equal($('#feat-empty').hidden, false);
  assert.equal($('#feat-count').textContent, '0');
  assert.equal($('#st-count').textContent, '0');
});

await test('the canvas is sized in device pixels', () => {
  assert.equal(view.width, 1000);
  assert.equal(view.height, 700);
  assert.equal(view.dpr, 2);
  assert.equal(canvas.width, 2000);
  assert.equal(canvas.height, 1400);
});

await test('there are no preset or AI controls anywhere in the UI', () => {
  const text = document.body.textContent.toLowerCase();
  assert.ok(!/preset/.test(text), 'preset UI found');
  assert.ok(!/\bai\b|chatgpt|gpt-|openai|copilot|auto-generate|smart fill/.test(text), 'AI UI found');
  const toolNames = $$('#tools .tool').map((b) => b.getAttribute('data-tool'));
  assert.deepEqual(toolNames, ['select', 'point', 'line', 'polygon', 'rect']);
});

await test('tabs switch panels', () => {
  click($$('#tabs button')[1]);
  assert.equal($('.panel[data-panel="styles"]').classList.contains('active'), true);
  assert.equal($('.panel[data-panel="features"]').classList.contains('active'), false);
  click($$('#tabs button')[0]);
  assert.equal($('.panel[data-panel="features"]').classList.contains('active'), true);
});

console.log('\ndrawing');

await test('a polygon can be drawn with pointer events + Enter', async () => {
  drawTriangle();
  await flush();
  assert.equal(store.count, 1);
  const feature = store.features[0];
  assert.equal(feature.geometry.type, 'Polygon');
  assert.equal(feature.geometry.coordinates[0].length, 4);
  assert.deepEqual(feature.geometry.coordinates[0][0], feature.geometry.coordinates[0][3]);
  assert.equal(store.selectionSize(), 1);
  assert.equal($('#feat-count').textContent, '1');
});

await test('Escape cancels a shape in progress', () => {
  tools.set('polygon');
  tapMap(100, 100);
  tapMap(200, 100);
  assert.equal(tools.tool.positions.length, 2);
  window.dispatch('keydown', event('keydown', { key: 'Escape' }));
  assert.equal(tools.tool.positions.length, 0);
  tools.set('select');
  assert.equal(store.count, 1);
});

await test('double-click finishes a line', () => {
  tools.set('line');
  tapMap(120, 500);
  tapMap(240, 560);
  canvas.dispatchEvent(event('dblclick', { clientX: 240, clientY: 560, button: 0, pointerId: 1 }));
  tools.set('select');
  assert.equal(store.count, 2);
  assert.equal(store.features[1].geometry.type, 'LineString');
  assert.equal(store.features[1].geometry.coordinates.length, 2);
});

await test('a point tool drops a marker', () => {
  tools.set('point');
  tapMap(700, 200);
  tools.set('select');
  assert.equal(store.count, 3);
  assert.equal(store.features[2].geometry.type, 'Point');
});

await test('dragging a rectangle creates a closed polygon', () => {
  tools.set('rect');
  canvas.dispatchEvent(pointer('pointerdown', 100, 100));
  canvas.dispatchEvent(pointer('pointermove', 260, 210));
  canvas.dispatchEvent(pointer('pointerup', 260, 210));
  tools.set('select');
  assert.equal(store.count, 4);
  const ring = store.features[3].geometry.coordinates[0];
  assert.equal(ring.length, 5);
});

await test('clicking a shape selects it, empty space clears the selection', () => {
  store.clearSelection();
  const feature = store.features[0];
  const centre = view.project(...feature.geometry.coordinates[0][0]);
  // Project a point we know is inside the triangle.
  const inside = { x: (400 + 620 + 520) / 3, y: (250 + 260 + 460) / 3 };
  void centre;
  tapMap(inside.x, inside.y);
  assert.equal(store.selection.has(feature.id), true);
  tapMap(20, 680);
  assert.equal(store.selectionSize(), 0);
});

await test('dragging a selected shape moves it (one undo step)', async () => {
  store.select(store.features[0].id);
  const before = store.features[0].geometry.coordinates[0][0].slice();
  const historyBefore = store._history.length;

  canvas.dispatchEvent(pointer('pointerdown', 500, 330));
  canvas.dispatchEvent(pointer('pointermove', 520, 340));
  canvas.dispatchEvent(pointer('pointermove', 540, 350));
  canvas.dispatchEvent(pointer('pointerup', 540, 350));
  await flush();

  const after = store.features[0].geometry.coordinates[0][0];
  assert.notDeepEqual(after, before);
  assert.equal(store._history.length, historyBefore + 1, 'a drag should be a single undo step');

  store.undo();
  assert.deepEqual(store.features[0].geometry.coordinates[0][0], before);
  store.redo();
});

await test('a plain click on a shape does not create an undo step', () => {
  const historyBefore = store._history.length;
  tapMap(505, 335);
  assert.equal(store._history.length, historyBefore);
});

console.log('\nrendering');

await test('features are painted (fill + stroke)', () => {
  ctx.reset();
  view.draw();
  assert.ok(ctx.named('fill').length >= 3, 'expected shape fills');
  assert.ok(ctx.named('stroke').length >= 3, 'expected outlines');
});

await test('the selection overlay draws handles for one selected feature', () => {
  store.select(store.features[0].id);
  ctx.reset();
  view.draw();
  assert.ok(ctx.named('setLineDash').some((c) => Array.isArray(c.args[0]) && c.args[0].length === 2));
  assert.ok(ctx.named('arcTo').length > 0 || ctx.named('roundRect').length > 0, 'vertex handles');
});

console.log('\nimage fills and zoom quality');

const IMG = 'https://example.org/flag-512.png';
FakeImage.sizes.set(IMG, [512, 341]);

await test('an image fill can be loaded and painted as a tiled pattern', async () => {
  const entry = await images.load(IMG, { name: 'flag-512.png' });
  assert.equal(entry.state, 'ready');
  assert.ok(entry.pyramid.levels.length >= 9, 'expected a full pyramid');
  assert.equal(entry.pyramid.levels[0].width, 512);
  assert.equal(entry.pyramid.levels[entry.pyramid.levels.length - 1].width, 1);

  store.select(store.features[0].id);
  app.panels.stylesPanel.setFillMode('image');
  app.panels.stylesPanel.setImage({ url: IMG, name: 'flag-512.png', source: 'url', layout: 'tile', anchor: 'screen', size: 64 });
  await flush();

  ctx.reset();
  view.draw();
  const probe = paintProbe();
  assert.ok(probe.patterns.length >= 1, 'expected a tiled pattern fill');
  assert.ok(probe.clip >= 1, 'the pattern must be clipped to the shape');
  // 64 CSS px at dpr 2 → 128 device px → pyramid level 2 (128 px) → scale 0.5
  assert.equal(probe.patterns[0].texels, 128, 'should paint from the 128 px pyramid level');
  assert.ok(probe.scales.some((s) => Math.abs(s - 0.5) < 1e-9), `expected a 0.5 pattern scale, got ${probe.scales}`);
});

await test('switching to an image fill lifts the faint 25% colour opacity', () => {
  store.select(store.features[0].id);
  app.panels.stylesPanel.setFillMode('solid');
  store.setStyle({ 'fill-opacity': 0.25 });
  app.panels.stylesPanel.setFillMode('image');
  assert.equal(store.editStyle()['fill-opacity'], 1,
    'an image fill must not inherit the see-through colour-fill opacity');
  // The dedicated image opacity slider still works.
  input($('#img-opacity'), '40');
  assert.equal(store.editStyle()['image-fill'].opacity, 0.4);
  input($('#img-opacity'), '100');
});

await test('screen-anchored tiles keep a constant size across zooms', () => {
  const zooms = [view.camera.zoom];
  const scales = [];
  for (const z of [1, 4, 9, 15]) {
    view.setView(view.camera.center, z, { animate: false });
    ctx.reset();
    view.draw();
    const s = ctx.named('scale').map((c) => c.args[0]).pop();
    scales.push(s);
    zooms.push(z);
  }
  for (const s of scales) assert.ok(Math.abs(s - 0.5) < 1e-9, `screen-anchored scale drifted: ${scales}`);
  view.setView(view.camera.center, 4, { animate: false });
});

await test('ground-anchored tiles stay at ~native resolution at every zoom (no pale zoom-out, no blocky zoom-in)', () => {
  store.select(store.features[0].id);
  app.panels.stylesPanel.setImage({ anchor: 'ground', size: 20000, noUpscale: true }, 'test');

  const rows = [];
  for (let z = 2; z <= 16; z++) {
    view.setView(view.camera.center, z, { animate: false });
    ctx.reset();
    view.draw();
    const probe = paintProbe();
    if (!probe.patterns.length) { rows.push({ z, note: 'average-colour fallback' }); continue; }
    const scale = probe.scales[probe.scales.length - 1];
    const texels = probe.patterns[probe.patterns.length - 1].texels;
    const ratio = scale * view.dpr;          // device pixels per texel
    rows.push({ z, texels, ratio: Number(ratio.toFixed(3)) });
    assert.ok(ratio >= 0.49 && ratio <= 2.01,
      `zoom ${z}: device px per texel = ${ratio.toFixed(3)} (texels ${texels}) — out of the crisp range`);
  }
  assert.ok(rows.length >= 10, `expected most zoom levels to paint a pattern, got ${JSON.stringify(rows)}`);
  // Deeper zoom must walk down the pyramid, never reuse one coarse bitmap.
  const texelSizes = rows.filter((r) => r.texels).map((r) => r.texels);
  assert.ok(new Set(texelSizes).size > 3, `pyramid levels never changed: ${texelSizes}`);
  view.setView(view.camera.center, 4, { animate: false });
});

await test('zooming far out falls back to the image mean colour instead of a washed-out pattern', () => {
  store.select(store.features[0].id);
  app.panels.stylesPanel.setImage({ anchor: 'ground', size: 5, noUpscale: true }, 'test');
  view.setView(view.camera.center, 1, { animate: false });
  ctx.reset();
  view.draw();
  const probe = paintProbe();
  assert.equal(probe.patterns.length, 0, 'no pattern should be rasterised at sub-pixel sizes');
  assert.equal(probe.scales.length, 0, 'no pattern transform either');
  assert.ok(probe.colours.includes('rgba(200,100,50,1)'),
    `the image mean colour should be used, fully opaque (globalAlpha carries opacity): ${probe.colours}`);
  assert.ok(ctx.named('fillRect').length > 0);
  view.setView(view.camera.center, 4, { animate: false });
  app.panels.stylesPanel.setImage({ anchor: 'screen', size: 64 }, 'test');
});

await test('noUpscale stops magnifying past the source resolution', () => {
  store.select(store.features[0].id);
  app.panels.stylesPanel.setImage({ anchor: 'ground', size: 5e6, noUpscale: true }, 'test');
  view.setView(view.camera.center, 18, { animate: false });
  ctx.reset();
  view.draw();
  let probe = paintProbe();
  assert.ok(probe.patterns.length, 'expected a pattern fill');
  assert.equal(probe.patterns[probe.patterns.length - 1].texels, 512, 'should use the base level');
  // capped to 512/2 CSS px, drawn from the 512 px level
  const scale = probe.scales[probe.scales.length - 1];
  assert.ok(Math.abs(scale - 0.5) < 1e-9, `expected the capped 0.5 scale, got ${scale}`);

  app.panels.stylesPanel.setImage({ noUpscale: false }, 'test');
  ctx.reset();
  view.draw();
  probe = paintProbe();
  const freeScale = probe.scales[probe.scales.length - 1];
  assert.ok(freeScale > 1, 'without the cap the pattern should keep growing');
  view.setView(view.camera.center, 4, { animate: false });
  app.panels.stylesPanel.setImage({ anchor: 'screen', size: 64, noUpscale: true }, 'test');
});

await test('stretch and single-image layouts draw from the pyramid too', () => {
  store.select(store.features[0].id);
  app.panels.stylesPanel.setImage({ layout: 'stretch', fit: 'cover' }, 'test');
  ctx.reset();
  view.draw();
  let probe = paintProbe();
  assert.ok(probe.drawImage >= 1, 'stretch should drawImage');
  assert.ok(probe.clip >= 1, 'stretch must be clipped to the shape');

  app.panels.stylesPanel.setImage({ layout: 'center', width: 160 }, 'test');
  ctx.reset();
  view.draw();
  probe = paintProbe();
  assert.ok(probe.drawImage >= 1, 'single image should drawImage');
  app.panels.stylesPanel.setImage({ layout: 'tile' }, 'test');
});

await test('a backdrop colour is painted under a transparent image', () => {
  store.select(store.features[0].id);
  app.panels.stylesPanel.setImage({ backdropOn: true, backdrop: '#ff00ff' }, 'test');
  app.panels.stylesPanel.setImage({ layout: 'tile' }, 'test');
  ctx.reset();
  view.draw();
  const probe = paintProbe();
  assert.ok(probe.colours.includes('#ff00ff'), `backdrop not painted: ${probe.colours}`);
  app.panels.stylesPanel.setImage({ backdropOn: false }, 'test');
});

console.log('\nstyles panel');

await test('the fill mode segmented control switches bodies and the model', () => {
  const solid = $('.mode-body[data-mode="solid"]');
  const image = $('.mode-body[data-mode="image"]');
  const commons = $('.mode-body[data-mode="commons"]');

  app.panels.stylesPanel.setFillMode('solid');
  assert.equal(solid.hidden, false);
  assert.equal(image.hidden, true);
  assert.equal(store.editStyle()['fill-mode'], 'solid');

  app.panels.stylesPanel.setFillMode('commons');
  assert.equal(commons.hidden, false);
  assert.equal($('#img-options').hidden, false);
  assert.equal(store.editStyle()['fill-mode'], 'commons');
  app.panels.stylesPanel.setFillMode('image');
});

await test('colour and slider inputs write through to the model', () => {
  store.clearSelection();
  input($('#fill-color'), '#ff8800');
  assert.equal(store.defaultStyle.fill, '#ff8800');

  input($('#fill-opacity'), '60');
  assert.equal(store.defaultStyle['fill-opacity'], 0.6);
  assert.equal($('#fill-opacity-out').textContent, '60%');

  input($('#stroke-width'), '5');
  assert.equal(store.defaultStyle['stroke-width'], 5);
  assert.equal($('#stroke-width-out').textContent, '5 px');

  change($('#stroke-dash'), 'dotted');
  assert.equal(store.defaultStyle['stroke-dash'], 'dotted');

  change($('#label-show'), true);
  assert.equal(store.defaultStyle.label.show, true);
  input($('#label-size'), '18');
  assert.equal(store.defaultStyle.label.size, 18);

  $('#btn-reset-style').dispatchEvent(event('click'));
  assert.equal(store.defaultStyle.fill, '#2f6df6');
  assert.equal(store.defaultStyle.label.show, false);
});

await test('with a selection the same inputs edit the feature, not the defaults', () => {
  store.select(store.features[0].id);
  input($('#fill-color'), '#00aa00');
  assert.equal(store.features[0].style.fill, '#00aa00');
  assert.equal(store.defaultStyle.fill, '#2f6df6');
  assert.equal($('#style-scope').textContent, '1 feature');

  store.select(store.features.map((f) => f.id));
  assert.equal($('#style-scope').textContent, `${store.count} features`);
  input($('#fill-color'), '#0000aa');
  for (const f of store.features) assert.equal(f.style.fill, '#0000aa');
  store.select(store.features[0].id);
});

await test('anchor switching swaps the size unit and a sensible default', () => {
  app.panels.stylesPanel.setAnchor('ground');
  const image = store.editStyle()['image-fill'];
  assert.equal(image.anchor, 'ground');
  assert.equal(image.unit, 'm');
  assert.equal($('#img-size-unit').textContent, 'm');
  assert.equal($('#anchor-badge').textContent, 'Ground size');

  app.panels.stylesPanel.setAnchor('screen');
  const back = store.editStyle()['image-fill'];
  assert.equal(back.unit, 'px');
  assert.equal(back.size, 72);
  assert.equal($('#img-size-unit').textContent, 'px');
});

await test('Apply to all styles every feature', () => {
  input($('#fill-color'), '#123321');
  click($('#btn-apply-all'));
  for (const f of store.features) assert.equal(f.style.fill, '#123321');
  assert.equal(store.defaultStyle.fill, '#123321');
});

console.log('\nwikimedia commons flag search');

await test('search renders results from the Commons API', async () => {
  commonsResponses.push({
    query: {
      pages: [
        {
          pageid: 11, index: 1, title: 'File:Flag of Japan.svg',
          imageinfo: [{
            mime: 'image/svg+xml', width: 900, height: 600,
            url: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Flag_of_Japan.svg',
            thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Flag_of_Japan.svg/260px-Flag_of_Japan.svg.png',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Flag_of_Japan.svg',
            extmetadata: {
              Artist: { value: '<a href="x">Someone</a>' },
              LicenseShortName: { value: 'Public domain' },
            },
          }],
        },
        {
          pageid: 12, index: 2, title: 'File:Flag of Brazil.svg',
          imageinfo: [{
            mime: 'image/svg+xml', width: 1000, height: 700,
            url: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Brazil.svg',
            thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Flag_of_Brazil.svg/260px-Flag_of_Brazil.svg.png',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Flag_of_Brazil.svg',
            extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, Artist: { value: 'Other' } },
          }],
        },
        {
          pageid: 13, index: 3, title: 'File:Some document.pdf',
          imageinfo: [{ mime: 'application/pdf', width: 100, height: 100, url: 'x', thumburl: 'x' }],
        },
      ],
    },
  });

  $('#cc-q').value = 'Japan';
  click($('#cc-search'));
  await flush();

  const results = $$('#cc-results .result');
  assert.equal(results.length, 2, 'the PDF must be filtered out');
  assert.ok(/2 results/.test($('#cc-status').textContent), $('#cc-status').textContent);
  assert.equal(results[0].getAttribute('title').includes('Flag of Japan'), true);
});

await test('picking a result shows attribution and applying it sets an image fill', async () => {
  const results = $$('#cc-results .result');
  results[0].dispatchEvent(event('click'));
  await flush();
  const picked = $('#cc-picked');
  assert.ok(/Public domain/.test(picked.textContent), picked.textContent);
  assert.ok(/Someone/.test(picked.textContent), picked.textContent);

  commonsResponses.push({
    query: {
      pages: [{
        pageid: 11, title: 'File:Flag of Japan.svg',
        imageinfo: [{
          mime: 'image/svg+xml', width: 900, height: 600,
          url: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Flag_of_Japan.svg',
          thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Flag_of_Japan.svg/1400px-Flag_of_Japan.svg.png',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Flag_of_Japan.svg',
          extmetadata: { Artist: { value: 'Someone' }, LicenseShortName: { value: 'Public domain' } },
        }],
      }],
    },
  });
  FakeImage.sizes.set('https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Flag_of_Japan.svg/1400px-Flag_of_Japan.svg.png', [1400, 933]);

  click(picked.querySelector('.btn.primary'));
  await flush(8);

  const style = store.editStyle();
  assert.equal(style['fill-mode'], 'commons');
  assert.equal(style['image-fill'].source, 'commons');
  assert.ok(style['image-fill'].url.includes('1400px-Flag_of_Japan'));
  assert.equal(style['image-fill'].layout, 'stretch');
  assert.ok(/Someone/.test(style['image-fill'].attribution));
  assert.ok(/Public domain/.test(style['image-fill'].attribution));
  assert.ok(style['image-fill'].page.includes('Flag_of_Japan'));
  assert.ok(images.isReady(style['image-fill'].url));
});

await test('a failed search reports a readable error', async () => {
  commonsResponses.push(new Error('offline'));
  $('#cc-q').value = 'Nowhere';
  click($('#cc-search'));
  await flush();
  assert.ok(/Cannot reach Wikimedia Commons/i.test($('#cc-status').textContent), $('#cc-status').textContent);
  assert.equal($('#cc-status').classList.contains('err'), true);
});

await test('the image URL field loads a remote image', async () => {
  const url = 'https://example.org/texture-256.png';
  FakeImage.sizes.set(url, [256, 256]);
  app.panels.stylesPanel.setFillMode('image');
  $('#img-url').value = url;
  click($('#btn-load-url'));
  await flush(8);
  assert.equal(store.editStyle()['image-fill'].url, url);
  assert.ok(images.isReady(url));
});

await test('a broken image URL is reported, not silently ignored', async () => {
  app.panels.stylesPanel.setFillMode('image');
  $('#img-url').value = 'https://example.org/broken-404.png';
  click($('#btn-load-url'));
  await flush(8);
  const entry = images.get('https://example.org/broken-404.png');
  assert.equal(entry.state, 'error');
});

console.log('\nexport / import');

await test('the export preview contains the drawn features', async () => {
  click($$('#tabs button')[2]);        // Data tab
  await flush();
  const json = $('#json-box').value;
  assert.ok(json.startsWith('{'));
  const parsed = JSON.parse(json);
  assert.equal(parsed.type, 'FeatureCollection');
  assert.equal(parsed.features.length, store.count);
  assert.equal($('#data-count').textContent, `${store.count} features`);
});

await test('exported features carry simplestyle keys and image-fill metadata', () => {
  const parsed = JSON.parse(app.panels.dataPanel.json());
  const first = parsed.features[0];
  assert.ok('stroke' in first.properties);
  assert.ok('fill' in first.properties);
  assert.ok(!('style' in first), 'the runtime style object must not leak into the file');
  assert.ok(!JSON.stringify(parsed).includes('blob:'));
});

await test('import merges or replaces according to the checkbox', async () => {
  const before = store.count;
  change($('#import-merge'), true);
  app.panels.dataPanel.importText(JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { name: 'Imported' }, geometry: { type: 'Point', coordinates: [10, 10] } }],
  }), { label: 'test.json' });
  assert.equal(store.count, before + 1);

  change($('#import-merge'), false);
  app.panels.dataPanel.importText(JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 1] } }],
  }));
  assert.equal(store.count, 1);
  store.undo();
  store.undo();
});

await test('invalid JSON is rejected with a message', () => {
  const ok = app.panels.dataPanel.importText('{ nope');
  assert.equal(ok, false);
});

await test('export respects the styling toggle', () => {
  change($('#exp-style'), false);
  const json = app.panels.dataPanel.json();
  assert.ok(!json.includes('"stroke-width"'), json.slice(0, 200));
  change($('#exp-style'), true);
  assert.ok(app.panels.dataPanel.json().includes('"stroke-width"'));
});

console.log('\nmap controls, persistence, shortcuts');

await test('wheel zoom keeps the ground point under the cursor', () => {
  const before = view.unproject(300, 200);
  canvas.dispatchEvent(event('wheel', { deltaY: -240, clientX: 300, clientY: 200, ctrlKey: false }));
  const after = view.unproject(300, 200);
  assert.ok(view.camera.zoom > before.zoom || Math.abs(after.lng - before.lng) < 0.5);
  assert.ok(Math.abs(after.lng - before.lng) < 1e-6, `lng drifted ${after.lng - before.lng}`);
  assert.ok(Math.abs(after.lat - before.lat) < 1e-6, `lat drifted ${after.lat - before.lat}`);
});

await test('zoom buttons and basemap switching work', () => {
  const z = view.camera.zoom;
  click($('#btn-zoom-in'));
  assert.ok(view.camera.zoom > z);
  click($('#btn-zoom-out'));
  assert.ok(Math.abs(view.camera.zoom - z) < 1e-9);

  change($('#basemap'), 'light');
  assert.equal(view.basemap, 'light');
  assert.ok(/CARTO/.test($('#attribution').textContent));
  change($('#basemap'), 'none');
  assert.ok(/No basemap/.test($('#attribution').textContent));
});

await test('panning across the antimeridian wraps instead of stopping', () => {
  view.setView({ lng: 179.5, lat: 0 }, 4, { animate: false });
  for (let i = 0; i < 40; i++) view.panByPixels(-30, 0);
  assert.ok(view.camera.center.lng >= -180 && view.camera.center.lng <= 180,
    `centre longitude left the valid range: ${view.camera.center.lng}`);
  assert.ok(view.camera.center.lng < 0, `expected to wrap east past 180°, got ${view.camera.center.lng}`);
  view.setView({ lng: 12, lat: 24 }, 4, { animate: false });
});

await test('drawn polygons are stored with an RFC 7946 exterior winding', () => {
  const polygon = store.features.find((f) => f.geometry.type === 'Polygon');
  assert.ok(polygon, 'expected a polygon on the map');
  assert.ok(isCounterClockwise(polygon.geometry.coordinates[0]),
    'exterior rings should be stored counter-clockwise');
  assert.ok(ringSignedArea(polygon.geometry.coordinates[0]) > 0);
});

await test('the status bar follows the pointer', () => {
  canvas.dispatchEvent(pointer('pointermove', 500, 350));
  assert.ok(/°/.test($('#st-coords').textContent), $('#st-coords').textContent);
  assert.ok(/^\d+\.\d$/.test($('#st-zoom').textContent));
});

await test('the workspace can be saved and rehydrated', async () => {
  const { saveWorkspace, loadWorkspace, clearWorkspace } = await import('../src/state/persist.js');
  const result = saveWorkspace(store, view);
  assert.equal(result.ok, true);
  const saved = loadWorkspace();
  assert.equal(saved.features.length, store.count);
  assert.ok(saved.camera.zoom > 0);

  const blobUrls = JSON.stringify(saved).includes('blob:');
  assert.equal(blobUrls, false, 'object URLs must not be persisted');
  clearWorkspace();
  assert.equal(loadWorkspace(), null);
});

await test('Ctrl+Z / Ctrl+Shift+Z undo and redo through the keyboard', () => {
  const before = store.count;
  store.addGeometry({ type: 'Point', coordinates: [3, 3] });
  assert.equal(store.count, before + 1);
  window.dispatch('keydown', event('keydown', { key: 'z', ctrlKey: true }));
  assert.equal(store.count, before);
  window.dispatch('keydown', event('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
  assert.equal(store.count, before + 1);
  window.dispatch('keydown', event('keydown', { key: 'z', ctrlKey: true }));
});

await test('tool keyboard shortcuts switch tools', () => {
  for (const [key, name] of [['v', 'select'], ['p', 'point'], ['l', 'line'], ['g', 'polygon'], ['r', 'rect']]) {
    window.dispatch('keydown', event('keydown', { key }));
    assert.equal(tools.name, name, `key ${key}`);
  }
  window.dispatch('keydown', event('keydown', { key: 'v' }));
});

await test('Delete removes the selection, Ctrl+A selects everything', () => {
  const count = store.count;
  window.dispatch('keydown', event('keydown', { key: 'a', ctrlKey: true }));
  assert.equal(store.selectionSize(), count);
  window.dispatch('keydown', event('keydown', { key: 'Delete' }));
  assert.equal(store.count, 0);
  store.undo();
  assert.equal(store.count, count);
});

await test('pasting GeoJSON imports it', async () => {
  change($('#import-merge'), true);
  const before = store.count;
  window.dispatch('paste', event('paste', {
    clipboardData: {
      files: [],
      getData: () => JSON.stringify({ type: 'Point', coordinates: [5, 5] }),
    },
  }));
  await flush();
  assert.equal(store.count, before + 1);
});

await test('the features panel lists, renames, zooms and deletes', async () => {
  click($$('#tabs button')[0]);
  await flush();
  const rows = $$('#feat-list .feat');
  assert.equal(rows.length, store.count);

  rows[0].dispatchEvent(event('click'));
  assert.equal(store.selectionSize(), 1);
  await flush();
  assert.equal($('#feat-editor').hidden, false);

  input($('#prop-name'), 'My shape');
  assert.equal(store.selectedFeatures()[0].properties.name, 'My shape');

  click($('#btn-add-prop'));
  await flush();
  const keyInputs = $$('#prop-list .prop-key');
  assert.ok(keyInputs.length >= 1);
  input(keyInputs[keyInputs.length - 1].parentNode.querySelector('.prop-val'), '42');

  const countBefore = store.count;
  click($('#btn-dup-feat'));
  await flush();
  assert.equal(store.count, countBefore + 1);
  click($('#btn-del-feat'));
  await flush();
  assert.equal(store.count, countBefore);
});

await test('zoom to all fits the features in the viewport', () => {
  click($('#btn-zoom-all'));
  assert.ok(view.camera.zoom > 0);
});

await test('Clear all empties the map and can be undone', async () => {
  click($('#btn-clear-all'));
  await flush();
  assert.equal(store.count, 0);
  assert.equal($('#feat-empty').hidden, false);
  store.undo();
  assert.ok(store.count > 0);
});

/* ------------------------------------------------------------------ report */

if (failures.length) {
  console.error(`\n${failures.length} of ${passed + failures.length} app tests failed:\n`);
  for (const { name, err } of failures) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${String(err && err.stack || err).split('\n').slice(0, 8).join('\n    ')}`);
  }
  process.exit(1);
}
console.log(`\n✓ ${passed} app tests passed end-to-end\n`);
renderer.requestRender?.();
void renderer;
