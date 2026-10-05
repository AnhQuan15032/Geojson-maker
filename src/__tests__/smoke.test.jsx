// Smoke test: mount the real component tree, run the real engine bootstrap,
// and assert the two actually meet — the engine finds the elements React
// rendered and initialises the map against them.
import { describe, it, expect, beforeAll, vi } from 'vitest';

global.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import './setup.js';
import App from '../App.jsx';
import { startEngine } from '../engine/bootstrap.js';
import { S } from '../engine/state.js';

// jsdom has no network and no canvas; neither is needed to prove wiring.
beforeAll(() => {
  global.fetch = vi.fn(() => Promise.reject(new Error('offline in test')));
  window.URL.createObjectURL = vi.fn(() => 'blob:stub');
  window.URL.revokeObjectURL = vi.fn();
  // Leaflet measures the container; give it a real size so the map initialises.
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1024 });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, value: 768 });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 1024, bottom: 768, width: 1024, height: 768, toJSON() {} };
  };
});

describe('app bootstrap', () => {
  it('renders every top-level region the original markup had', () => {
    const host = document.createElement('div');
    host.id = 'root';
    document.body.appendChild(host);

    act(() => {
      createRoot(host).render(<App />);
    });

    for (const id of [
      'app-header', 'mobile-app-header', 'map', 'desktop-rail', 'mobile-nav',
      'mobile-selection-bar', 'export-drawer', 'draw-drawer', 'style-drawer',
      'image-drawer', 'layers-drawer', 'tutorial-overlay', 'tour-spot',
      'tour-call', 'tutorial-pill', 'shortcut-sheet', 'toast', 'sheet-backdrop',
      'a11y-live', 'skip-link',
    ]) {
      expect(document.getElementById(id), `#${id} should be rendered`).toBeTruthy();
    }
  });

  it('replaces data-lucide placeholders with real SVG icons', () => {
    const icons = document.querySelectorAll('svg.lucide');
    expect(icons.length).toBeGreaterThan(100);
    // nothing should be left un-rendered
    expect(document.querySelectorAll('i[data-lucide]').length).toBe(0);
  });

  it('initialises the Leaflet map on the React-rendered #map node', () => {
    act(() => {
      startEngine();
    });

    expect(S.map, 'engine should have stored the map on the store').toBeTruthy();
    expect(S.drawnItems, 'engine should have created the draw layer group').toBeTruthy();
    // Leaflet decorates its container once initialised
    expect(document.getElementById('map').classList.contains('leaflet-container')).toBe(true);
    expect(S.map.getContainer()).toBe(document.getElementById('map'));
  });

  it('reacts to store writes (the Proxy -> useSyncExternalStore path)', async () => {
    const { subscribe, getVersion } = await import('../engine/state.js');
    const before = getVersion();
    let notified = 0;
    const off = subscribe(() => { notified++; });
    S.colorSeq = 12345;
    await Promise.resolve(); // the store coalesces into one microtask
    off();
    expect(notified).toBe(1);
    expect(getVersion()).toBeGreaterThan(before);
  });
});
