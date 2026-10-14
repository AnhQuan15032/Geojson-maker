// End-to-end wiring for the vector auto-animator: real component tree + real
// engine bootstrap, driven the way a user would — rail button, keyboard
// shortcut, the panel's own buttons — rather than by calling engine functions.
import { describe, it, expect, beforeAll, vi } from 'vitest';

global.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import './setup.js';
import './dom-stubs.js';
import L from 'leaflet';
import App from '../App.jsx';
import { startEngine } from '../engine/bootstrap.js';
import { S } from '../engine/state.js';

beforeAll(() => {
  global.fetch = vi.fn(() => Promise.reject(new Error('offline in test')));
  window.URL.createObjectURL = vi.fn(() => 'blob:stub');
  window.URL.revokeObjectURL = vi.fn();
  // The app map draws on a canvas renderer; jsdom has no 2D context.
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  // The download helper clicks a blob: link; jsdom cannot navigate there.
  HTMLAnchorElement.prototype.click = function () { this.dataset.clicked = '1'; };
});

function addPolygon(pts, name, fill) {
  const layer = L.polygon(pts, { color: fill, fillColor: fill, fillOpacity: 1, weight: 0 });
  layer.feature = { type: 'Feature', properties: { name, fill } };
  S.drawnItems.addLayer(layer);
  return layer;
}

const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('vector animator — user flow', () => {
  it('draw two shapes → Animate → preview → export', () => {
    const host = document.createElement('div');
    host.id = 'root';
    document.body.appendChild(host);
    act(() => { createRoot(host).render(<App />); });
    act(() => { startEngine(); });

    const drawer = document.getElementById('animate-drawer');
    const preview = document.getElementById('btn-morph-preview');
    const exportBtn = document.getElementById('btn-morph-export');
    expect(drawer).toBeTruthy();
    expect(preview.disabled, 'nothing to animate yet').toBe(true);
    expect(exportBtn.disabled).toBe(true);

    const A = addPolygon([[51.5, -0.2], [51.5, -0.1], [51.56, -0.1], [51.56, -0.2]], 'One', '#10b981');
    const B = addPolygon([[51.52, -0.05], [51.55, 0.0], [51.58, -0.03], [51.56, -0.08], [51.53, -0.09]], 'Two', '#f59e0b');

    // Rail button opens the panel and auto-fills From/To with the last two shapes
    document.getElementById('btn-animate-rail').click();
    expect(drawer.classList.contains('open')).toBe(true);
    expect(S.morphSourceLayer).toBe(A);
    expect(S.morphTargetLayer).toBe(B);
    expect(document.getElementById('morph-from-name').textContent).toBe('One');
    expect(document.getElementById('morph-to-name').textContent).toBe('Two');
    expect(document.getElementById('morph-status').textContent).toMatch(/32 points matched .* no tangles/);
    expect(preview.disabled).toBe(false);
    expect(exportBtn.disabled).toBe(false);

    // "A" toggles the panel
    key('a');
    expect(drawer.classList.contains('open')).toBe(false);
    key('a');
    expect(drawer.classList.contains('open')).toBe(true);

    // Preview button starts the ghost; Esc stops it
    preview.click();
    expect(S.morphPreviewRaf).toBeTruthy();
    expect(S.map.hasLayer(S.morphPreviewLayer)).toBe(true);
    expect(preview.classList.contains('is-playing')).toBe(true);
    key('Escape');
    expect(S.morphPreviewRaf).toBeNull();
    expect(S.morphPreviewLayer).toBeNull();
    expect(preview.classList.contains('is-playing')).toBe(false);

    // Options from the panel reach the engine
    const duration = document.getElementById('morph-duration');
    duration.value = '3';
    duration.dispatchEvent(new Event('input', { bubbles: true }));
    expect(S.morphDuration).toBe(3);
    expect(document.getElementById('morph-total-time').textContent).toBe('4.0 s total');
    const pingPong = document.getElementById('morph-pingpong');
    pingPong.click();
    expect(S.morphPingPong).toBe(true);
    expect(document.getElementById('morph-total-time').textContent).toBe('7.5 s total');

    // Deleting the end shape empties its slot through the layer-group hook
    S.drawnItems.removeLayer(B);
    expect(S.morphTargetLayer).toBeNull();
    expect(exportBtn.disabled).toBe(true);

    // Put it back, pick again from the panel (swap, then "Use selected"), export from the panel
    S.drawnItems.addLayer(B);
    document.querySelector('#animate-drawer button[title="Swap From and To"]').click();
    expect(S.morphSourceLayer).toBeNull();
    expect(S.morphTargetLayer).toBe(A);
    S.activeSelectedLayer = B;
    const useSelected = [...drawer.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Use selected');
    useSelected[0].click(); // "From" slot
    expect(S.morphSourceLayer).toBe(B);
    expect(S.morphTargetLayer).toBe(A);
    expect(document.getElementById('morph-from-name').textContent).toBe('Two');
    expect(exportBtn.disabled).toBe(false);
    exportBtn.click();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
