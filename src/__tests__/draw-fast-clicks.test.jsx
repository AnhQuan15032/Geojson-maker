// Drawing feel: quick clicks place vertices and never zoom the map, the
// Geoman hint box ("Click first marker to finish") is gone, and double-click
// zoom is back once the shape is finished. Real component tree, real engine,
// real Leaflet + Geoman, driven through DOM events on the map container.
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
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  HTMLAnchorElement.prototype.click = function () { this.dataset.clicked = '1'; };
  // the guided tour would otherwise pop up after 900 ms and swallow the Escape key
  localStorage.setItem('gjs_tutorial_seen', '1');
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mouse(type, x, y) {
  S.map.getContainer().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));
}

const drawButton = (label) => [...document.querySelectorAll('#draw-drawer button')].find((b) => b.textContent.trim() === label);

describe('drawing — fast clicks and the hint box', () => {
  it('fast clicks add vertices without zooming; the hint tooltip is gone; dblclick zoom returns afterwards', async () => {
    const host = document.createElement('div');
    host.id = 'root';
    document.body.appendChild(host);
    act(() => { createRoot(host).render(<App />); });
    act(() => { startEngine(); });

    const map = S.map;
    expect(map.doubleClickZoom.enabled(), 'double-click zoom is on when not drawing').toBe(true);
    const zoom0 = map.getZoom();

    // start a polygon from the Draw panel
    drawButton('Polygon').click();
    expect(map.pm.globalDrawModeEnabled()).toBe(true);
    expect(map.doubleClickZoom.enabled(), 'paused for the draw session').toBe(false);
    expect(S.drawDblClickZoomPaused).toBe(true);
    const draw = map.pm.Draw.Polygon;
    expect(draw.options.tooltips).toBe(false);
    expect(draw._hintMarker.getTooltip(), 'no "Click first marker to finish" box').toBeUndefined();
    expect(document.querySelector('.leaflet-tooltip')).toBeNull();

    // three quick clicks at different spots + the dblclick a browser (or Leaflet's
    // double-tap detector) fires for the fast pair
    mouse('click', 300, 300);
    mouse('click', 420, 310);
    mouse('dblclick', 420, 310);
    mouse('click', 380, 420);
    mouse('dblclick', 380, 420);
    expect(draw._layer.getLatLngs()).toHaveLength(3);
    expect(map.getZoom(), 'no zoom while drawing').toBe(zoom0);
    expect(document.querySelector('.leaflet-tooltip')).toBeNull();

    // other ways of zooming still work mid-draw
    expect(map.scrollWheelZoom.enabled()).toBe(true);
    expect(map.touchZoom.enabled() || !L.Browser.touch, 'pinch zoom untouched').toBe(true);
    map.zoomIn(1, { animate: false });
    expect(map.getZoom()).toBe(zoom0 + 1);
    map.zoomOut(1, { animate: false });
    expect(map.getZoom()).toBe(zoom0);

    // click the first vertex again → the polygon is finished and lands in drawnItems
    const before = S.drawnItems.getLayers().length;
    mouse('click', 300, 300);
    expect(map.pm.globalDrawModeEnabled()).toBe(false);
    expect(S.drawnItems.getLayers()).toHaveLength(before + 1);
    const created = S.drawnItems.getLayers()[before];
    expect(created).toBeInstanceOf(L.Polygon);
    expect(created.getLatLngs()[0]).toHaveLength(3);

    // the finishing tap may itself complete a double-tap: still no zoom right after
    mouse('dblclick', 300, 300);
    expect(map.getZoom()).toBe(zoom0);
    expect(map.doubleClickZoom.enabled()).toBe(false);

    // …and double-click zoom is back shortly after the session ended
    await sleep(350);
    expect(map.doubleClickZoom.enabled()).toBe(true);
    expect(S.drawDblClickZoomPaused).toBe(false);
    mouse('dblclick', 500, 400);
    expect(map.getZoom(), 'normal double-click zoom again').toBe(zoom0 + 1);
    map.setZoom(zoom0, { animate: false });

    // switching tools mid-session keeps the pause until the last session ends
    drawButton('Line').click();
    expect(map.pm.Draw.Line.enabled()).toBe(true);
    expect(map.pm.Draw.Line._hintMarker.getTooltip()).toBeUndefined();
    expect(map.doubleClickZoom.enabled()).toBe(false);
    drawButton('Polygon').click();
    expect(map.doubleClickZoom.enabled()).toBe(false);
    await sleep(350);
    expect(map.doubleClickZoom.enabled(), 'still drawing → still paused').toBe(false);
    // Esc abandons the shape; nothing new on the map, zoom handler back after the grace period
    mouse('click', 200, 200);
    mouse('click', 260, 220);
    const count = S.drawnItems.getLayers().length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(map.pm.globalDrawModeEnabled()).toBe(false);
    expect(S.drawnItems.getLayers()).toHaveLength(count);
    expect(map.doubleClickZoom.enabled()).toBe(false);
    await sleep(350);
    expect(map.doubleClickZoom.enabled()).toBe(true);
  });

  it('the split blade keeps its own double-click handling (Geoman pauses the zoom itself)', async () => {
    const map = S.map;
    const polygon = S.drawnItems.getLayers().find((l) => l instanceof L.Polygon);
    S.activeSelectedLayer = polygon;
    const { startSplitMode } = await import('../engine/split.js');
    startSplitMode();
    expect(map.pm.globalDrawModeEnabled()).toBe(true);
    expect(S.splitModeActive).toBe(true);
    expect(map.pm.Draw.Line.options.finishOn).toBe('dblclick');
    expect(map.pm.Draw.Line.options.tooltips).toBe(false);
    expect(map.pm.Draw.Line._hintMarker.getTooltip()).toBeUndefined();
    expect(map.doubleClickZoom.enabled()).toBe(false);
    expect(S.drawDblClickZoomPaused, 'Geoman disabled it first — nothing for us to restore').toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(map.pm.globalDrawModeEnabled()).toBe(false);
    expect(S.splitModeActive).toBe(false);
    expect(map.doubleClickZoom.enabled(), 'Geoman re-enables it right away').toBe(true);
  });
});
