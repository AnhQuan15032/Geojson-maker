// Quick country loading, driven like a user: the L shortcut / rail button
// jump to the search box, Enter loads the first match, the same country can
// be loaded again (numbered copies), and recent countries come back in one tap.
import { describe, it, expect, beforeAll, vi } from 'vitest';

global.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import './setup.js';
import './dom-stubs.js';
import App from '../App.jsx';
import { startEngine } from '../engine/bootstrap.js';
import { S } from '../engine/state.js';
import { fetchWorldAtlas, buildCountryIndex } from '../engine/countries.js';

// A tiny world-atlas-shaped topology (two square "countries"), so the index
// builder runs for real without the network.
const TOPO = {
  type: 'Topology',
  objects: {
    countries: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', id: '900', properties: { name: 'Testland' }, arcs: [[0]] },
        { type: 'Polygon', id: '901', properties: { name: 'Vectoria' }, arcs: [[1]] },
      ],
    },
  },
  arcs: [
    [[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]],
    [[20, 20], [23, 20], [23, 23], [20, 23], [20, 20]],
  ],
};

const square = (x0, y0, size, name, id) => ({
  id,
  name,
  feature: { type: 'Feature', id, properties: { name }, geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]] } },
  bbox: [x0, y0, x0 + size, y0 + size],
});

beforeAll(() => {
  global.fetch = vi.fn(() => Promise.reject(new Error('offline in test')));
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  HTMLAnchorElement.prototype.click = function () { this.dataset.clicked = '1'; };
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
});

const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const countryLayers = () => S.drawnItems.getLayers().filter((l) => l._countryEntryId);
const names = () => countryLayers().map((l) => l.feature.properties.name);

describe('country loader — quick access and repeated loads', () => {
  it('L opens the search, Enter loads the first match, loading again makes numbered copies', async () => {
    const host = document.createElement('div');
    host.id = 'root';
    document.body.appendChild(host);
    act(() => { createRoot(host).render(<App />); });
    act(() => { startEngine(); });
    localStorage.removeItem('gs.recentCountries');

    const drawer = document.getElementById('layers-drawer');
    const input = document.getElementById('country-search');
    expect(drawer.classList.contains('open')).toBe(false);
    // the loader sits at the top of the drawer, before the base-map picker
    const loader = document.getElementById('country-loader');
    expect(loader.compareDocumentPosition(document.getElementById('basemap-select') || drawer.querySelector('select')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // the index is already in memory (prefetched / cached) — no network in this test
    S.countriesIndexCache['50m'] = [square(10, 10, 2, 'Testland', '900'), square(20, 20, 3, 'Vectoria', '901')];

    key('l');
    expect(drawer.classList.contains('open')).toBe(true);
    expect(document.activeElement).toBe(input);
    await Promise.resolve();
    await Promise.resolve();
    const results = document.getElementById('country-results');
    expect(results.classList.contains('hidden')).toBe(false);
    expect(results.querySelectorAll('[data-country-id]')).toHaveLength(2);

    // type → filtered → Enter loads the first match
    input.value = 'vect';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(results.querySelectorAll('[data-country-id]')).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(names()).toEqual(['Vectoria']);
    expect(document.getElementById('countries-status').textContent).toMatch(/Vectoria loaded/);
    expect(results.querySelector('[data-country-id="901"]').textContent).toMatch(/load again/);

    // the same country again → a second, numbered copy (not a zoom-to-existing)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(names()).toEqual(['Vectoria', 'Vectoria (2)']);
    expect(document.getElementById('countries-status').textContent).toMatch(/copy 2 of Vectoria/);
    expect(results.querySelector('[data-country-id="901"]').textContent).toMatch(/×2 on map/);
    // a click on a result loads exactly once (delegated handler, no inline onclick)
    results.querySelector('[data-country-id="901"]').click();
    expect(names()).toEqual(['Vectoria', 'Vectoria (2)', 'Vectoria (3)']);
    expect(countryLayers().map((l) => l.feature.properties.fill)).toHaveLength(3);
    expect(new Set(countryLayers().map((l) => l.feature.properties.fill)).size, 'each copy gets its own colour').toBe(3);

    // Escape clears the query; the other country loads by click
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.value).toBe('');
    results.querySelector('[data-country-id="900"]').click();
    expect(names()).toEqual(['Vectoria', 'Vectoria (2)', 'Vectoria (3)', 'Testland']);

    // recent chips: newest first, one tap reloads, persisted
    const recent = document.getElementById('country-recent');
    expect(recent.classList.contains('hidden')).toBe(false);
    const chips = [...recent.querySelectorAll('[data-recent-index]')].map((b) => b.textContent.trim());
    expect(chips[0]).toMatch(/^Testland/);
    expect(chips[1]).toMatch(/^Vectoria/);
    expect(JSON.parse(localStorage.getItem('gs.recentCountries')).map((e) => e.name)).toEqual(['Testland', 'Vectoria']);
    recent.querySelector('[data-recent-index="1"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(names()).toEqual(['Vectoria', 'Vectoria (2)', 'Vectoria (3)', 'Testland', 'Vectoria (4)']);
    recent.querySelector('[data-recent-clear]').click();
    expect(recent.classList.contains('hidden')).toBe(true);
    expect(localStorage.getItem('gs.recentCountries')).toBeNull();

    // removing copies renumbers nothing but frees the slot count
    S.drawnItems.removeLayer(countryLayers()[0]);
    document.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(results.querySelector('[data-country-id="901"]').textContent).toMatch(/×3 on map/);

    // the rail button and the mobile menu entry go to the same place
    key('l'); // toggles nothing off — it only opens/focuses
    expect(drawer.classList.contains('open')).toBe(true);
    document.getElementById('btn-country-rail').click();
    expect(document.activeElement).toBe(input);
  });

  it('the world-atlas download is served from Cache Storage after the first time', async () => {
    const store = new Map();
    const cache = {
      match: vi.fn(async (url) => (store.has(url) ? store.get(url).clone() : undefined)),
      put: vi.fn(async (url, res) => { store.set(url, res); }),
    };
    global.caches = { open: vi.fn(async () => cache) };
    const body = JSON.stringify(TOPO);
    global.fetch = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));

    const first = await fetchWorldAtlas('110m');
    expect(first.objects.countries.geometries).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);

    const second = await fetchWorldAtlas('110m');
    expect(second.objects.countries.geometries[1].properties.name).toBe('Vectoria');
    expect(global.fetch, 'second call never touches the network').toHaveBeenCalledTimes(1);

    // the index builder consumes it (quietly, as the idle prefetch does) and unstitches features
    delete S.countriesIndexCache['110m'];
    const list = await buildCountryIndex('110m', { silent: true });
    expect(list.map((e) => e.name)).toEqual(['Testland', 'Vectoria']);
    expect(S.countriesIndexCache['110m']).toBe(list);
    expect(list[0].bbox).toEqual([10, 10, 12, 12]);
  });
});
