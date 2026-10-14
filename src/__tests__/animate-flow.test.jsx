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
    expect(S.morphTracks[0].from).toBe(A);
    expect(S.morphTracks[0].to).toBe(B);
    expect(document.getElementById('morph-from-name-0').textContent).toBe('One');
    expect(document.getElementById('morph-to-name-0').textContent).toBe('Two');
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
    expect(S.morphTracks[0].to).toBeNull();
    expect(exportBtn.disabled).toBe(true);

    // Put it back, pick again from the panel (swap, then "Use selected"), export from the panel
    S.drawnItems.addLayer(B);
    document.querySelector('#animate-drawer button[title="Swap From and To"]').click();
    expect(S.morphTracks[0].from).toBeNull();
    expect(S.morphTracks[0].to).toBe(A);
    S.activeSelectedLayer = B;
    const useSelected = [...drawer.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Use selected');
    useSelected[0].click(); // "From" slot
    expect(S.morphTracks[0].from).toBe(B);
    expect(S.morphTracks[0].to).toBe(A);
    expect(document.getElementById('morph-from-name-0').textContent).toBe('Two');
    expect(exportBtn.disabled).toBe(false);
    exportBtn.click();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);

    // A second morph: "Add morph" creates an empty active track, the panel fills it from the selection,
    // both tracks preview together and export as two keyframed layers; the play-mode select reaches the engine
    const C = addPolygon([[51.40, -0.30], [51.40, -0.25], [51.45, -0.25], [51.45, -0.30]], 'Three', '#ef4444');
    document.getElementById('btn-morph-add-track').click();
    expect(S.morphTracks).toHaveLength(2);
    expect(S.morphActiveTrack).toBe(1);
    expect(document.querySelectorAll('#morph-tracks .morph-track')).toHaveLength(2);
    expect(exportBtn.disabled, 'an empty second track does not block the first').toBe(false);
    S.activeSelectedLayer = C;
    document.querySelector('#morph-tracks [data-action="use-from"][data-track="1"]').click();
    S.activeSelectedLayer = A;
    document.querySelector('#morph-tracks [data-action="use-to"][data-track="1"]').click();
    expect(S.morphTracks[1]).toEqual({ from: C, to: A });
    expect(document.getElementById('morph-from-name-1').textContent).toBe('Three');
    expect(document.getElementById('morph-status').textContent).toMatch(/2 morphs/);
    expect(document.getElementById('morph-total-time').textContent).toBe('7.5 s total · 2 morphs together');
    const mode = document.getElementById('morph-sequence');
    mode.value = 'sequence';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    expect(S.morphSequence).toBe(true);
    expect(document.getElementById('morph-total-time').textContent).toBe('13.5 s total · 2 morphs in sequence');
    preview.click();
    expect(S.morphPreviewLayer.getLayers()).toHaveLength(2);
    key('Escape');
    exportBtn.click();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2);
    // removing a track from its row
    document.querySelector('#morph-tracks [data-action="remove"][data-track="0"]').click();
    expect(S.morphTracks).toEqual([{ from: C, to: A }]);
    expect(document.getElementById('morph-from-name-0').textContent).toBe('Three');
  });
});
