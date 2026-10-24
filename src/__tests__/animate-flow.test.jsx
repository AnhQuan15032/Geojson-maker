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

    // Canvas viewport and image-transform controls are wired to the engine.
    const viewport = document.getElementById('morph-viewport');
    viewport.value = '4:5';
    viewport.dispatchEvent(new Event('change', { bubbles: true }));
    expect(S.morphViewport).toBe('4:5');
    expect(S.morphPlanCache.proj.canvasHeight).toBe(1350);
    viewport.value = '9:16';
    viewport.dispatchEvent(new Event('change', { bubbles: true }));
    const mask = document.getElementById('morph-flag-mask');
    mask.click();
    expect(S.morphFlagSettings.masked).toBe(false);
    const flagRotation = document.getElementById('morph-flag-rotation-to');
    flagRotation.value = '35';
    flagRotation.dispatchEvent(new Event('input', { bubbles: true }));
    expect(S.morphFlagSettings.rotationTo).toBe(35);

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
    const D = addPolygon([[51.60, -0.18], [51.60, -0.15], [51.63, -0.15], [51.63, -0.18]], 'Four', '#a855f7');
    D.setStyle({ opacity: 0.65, fillOpacity: 0.7, weight: 2, dashArray: '5 2', lineJoin: 'bevel' });
    document.getElementById('btn-morph-add-track').click();
    expect(S.morphTracks).toHaveLength(2);
    expect(S.morphActiveTrack).toBe(1);
    expect(document.querySelectorAll('#morph-tracks .morph-track')).toHaveLength(2);
    expect(exportBtn.disabled, 'an empty second track does not block the first').toBe(false);
    S.activeSelectedLayer = C;
    document.querySelector('#morph-tracks [data-action="use-from"][data-track="1"]').click();
    S.activeSelectedLayer = D;
    document.querySelector('#morph-tracks [data-action="use-to"][data-track="1"]').click();
    expect(S.morphTracks[1]).toEqual({ from: C, to: D });
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
    expect(S.morphTracks).toEqual([{ from: C, to: D }]);
    expect(document.getElementById('morph-from-name-0').textContent).toBe('Three');

    // The Layers-panel action duplicates the selected map shape without changing its appearance.
    const duplicateButton = document.getElementById('btn-duplicate-selected-shape-layers');
    expect(duplicateButton).toBeTruthy();
    const original = S.activeSelectedLayer;
    const originalGeometry = original.toGeoJSON().geometry;
    const originalStyle = {
      color: original.options.color,
      fillColor: original.options.fillColor,
      fillOpacity: original.options.fillOpacity,
      weight: original.options.weight,
      opacity: original.options.opacity,
      dashArray: original.options.dashArray,
      lineJoin: original.options.lineJoin,
    };
    const shapeCount = S.drawnItems.getLayers().length;
    duplicateButton.click();
    const copy = S.activeSelectedLayer;
    expect(S.drawnItems.getLayers()).toHaveLength(shapeCount + 1);
    expect(copy).not.toBe(original);
    expect(copy.toGeoJSON().geometry).toEqual(originalGeometry);
    expect(copy.feature.properties.name).toBe('Four (copy)');
    expect({
      color: copy.options.color,
      fillColor: copy.options.fillColor,
      fillOpacity: copy.options.fillOpacity,
      weight: copy.options.weight,
      opacity: copy.options.opacity,
      dashArray: copy.options.dashArray,
      lineJoin: copy.options.lineJoin,
    }).toEqual(originalStyle);
  });

  it('graph editor: drag the handles → custom curve previews, persists and exports as cubicBezier', async () => {
    // (continues on the mounted app from the previous test)
    const drawer = document.getElementById('animate-drawer');
    if (!drawer.classList.contains('open')) key('a');
    const svg = document.getElementById('morph-curve-svg');
    const select = document.getElementById('morph-easing');
    const h1 = document.getElementById('morph-curve-h1');
    const h2 = document.getElementById('morph-curve-h2');
    expect(svg).toBeTruthy();
    expect(select.value).toBe('easeInOut');
    const pos = (el) => (el.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/) || []).slice(1, 3).map(Number);
    // default preset shows its handles: (0.42, 0) → plot (112.4, 240), (0.58, 1) → (147.6, 20)
    expect(pos(h1)[0]).toBeCloseTo(20 + 0.42 * 220, 3);
    expect(pos(h1)[1]).toBeCloseTo(240, 3);
    expect(pos(h2)[1]).toBeCloseTo(20, 3);

    // In jsdom the SVG has no layout box, so client coordinates are viewBox units.
    const ptr = (type, x, y) => svg.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
    // grab the second handle (nearest to the pointer) and drag it to the AM-style corner (0.1, 1)
    ptr('pointerdown', 150, 25);
    expect(svg.classList.contains('is-dragging')).toBe(true);
    ptr('pointermove', 20 + 0.1 * 220, 20);
    expect(S.morphEasing).toBe('custom');
    expect(select.value).toBe('custom');
    expect(S.morphEasingBezier[2]).toBeCloseTo(0.1, 6);
    expect(S.morphEasingBezier[3]).toBeCloseTo(1, 6);
    expect(localStorage.getItem('gs.morphEasingBezier'), 'not persisted while dragging').toBeNull();
    ptr('pointerup', 20 + 0.1 * 220, 20);
    expect(svg.classList.contains('is-dragging')).toBe(false);
    expect(JSON.parse(localStorage.getItem('gs.morphEasingBezier'))[2]).toBeCloseTo(0.1, 6);
    // the first handle: nearest-handle rule picks it when the pointer is bottom-left
    ptr('pointerdown', 20 + 0.9 * 220, 240);
    ptr('pointerup', 20 + 0.9 * 220, 240);
    expect(S.morphEasingBezier[0]).toBeCloseTo(0.9, 6);
    expect(S.morphEasingBezier[1]).toBeCloseTo(0, 6);
    expect(document.getElementById('morph-curve-x1').value).toBe('0.9');
    expect(document.getElementById('morph-curve-path').getAttribute('d')).toMatch(/^M 20 240 C 218 240, 42 20, 240 20$/);

    // typed values are clamped and re-render the curve; dragging a handle onto a preset selects that preset
    const y1 = document.getElementById('morph-curve-y1');
    y1.value = '-5';
    y1.dispatchEvent(new Event('change', { bubbles: true }));
    expect(S.morphEasingBezier[1]).toBe(-1);
    document.querySelector('[data-easing-preset="easeOut"]').click();
    expect(S.morphEasing).toBe('easeOut');
    expect(select.value).toBe('easeOut');
    expect(S.morphEasingBezier).toEqual([0, 0, 0.58, 1]);
    // mirror turns ease-out into ease-in; the select follows
    document.getElementById('btn-morph-curve-mirror').click();
    expect(S.morphEasing).toBe('easeIn');
    expect(S.morphEasingBezier).toEqual([0.42, 0, 1, 1]);
    // picking from the select repaints the editor
    select.value = 'linear';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(S.morphEasing).toBe('linear');
    expect(pos(h1)[0]).toBeCloseTo(20 + 220 / 3, 2);

    // a custom curve is what the export writes
    ptr('pointerdown', 20 + 0.8879618 * 220, 240);
    ptr('pointerup', 20 + 0.8879618 * 220, 240);
    ptr('pointerdown', 20 + 0.10184711 * 220, 20);
    ptr('pointerup', 20 + 0.10184711 * 220, 20);
    expect(S.morphEasing).toBe('custom');
    const parts = [];
    const OrigBlob = globalThis.Blob;
    globalThis.Blob = class extends OrigBlob { constructor(p, o) { super(p, o); parts.push((p || []).join('')); } };
    try {
      document.getElementById('btn-morph-export').click();
    } finally {
      globalThis.Blob = OrigBlob;
    }
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain('e="cubicBezier 0.8879618 0.0 0.10184711 1.0"');
    expect(parts[0]).not.toContain('e="cubicBezier 0.42');

    // while previewing, the playhead sweeps the editor (no start hold so the first frames are inside the morph)
    const hold = document.getElementById('morph-hold-start');
    hold.value = '0';
    hold.dispatchEvent(new Event('input', { bubbles: true }));
    const playhead = document.getElementById('morph-curve-playhead');
    const dot = document.getElementById('morph-curve-dot');
    document.getElementById('btn-morph-preview').click();
    await new Promise((r) => setTimeout(r, 120)); // let a few animation frames run
    expect(playhead.getAttribute('opacity')).toBe('1');
    expect(dot.getAttribute('visibility')).toBe('visible');
    expect(Number(dot.getAttribute('cx'))).toBeGreaterThan(20);
    // the dot sits on the curve: for this AM-style curve the first part moves slowly (y ≈ 0 near x = 0)
    const u = (Number(dot.getAttribute('cx')) - 20) / 220;
    const y = (240 - Number(dot.getAttribute('cy'))) / 220;
    if (u < 0.3) expect(y).toBeLessThan(u);
    key('Escape');
    expect(playhead.getAttribute('opacity')).toBe('0.5');
    expect(dot.getAttribute('visibility')).toBe('hidden');
  });
});
