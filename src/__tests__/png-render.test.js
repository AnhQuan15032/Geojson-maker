import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup.js';
import './dom-stubs.js';
import L from 'leaflet';
import { S } from '../engine/state.js';
import {
  drawVectorLayerToCanvas,
  renderLinePath,
  renderPolygonPath,
} from '../engine/exporters/png.js';

const ll = (lat, lng) => L.latLng(lat, lng);
let previousMap;

function mockContext() {
  const ctx = {
    globalAlpha: 1,
    fillStyle: null,
    strokeStyle: null,
    fillCalls: [],
    strokeCalls: [],
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    fill(rule) {
      this.fillCalls.push({ rule, alpha: this.globalAlpha, style: this.fillStyle });
    },
    stroke() {
      this.strokeCalls.push({ alpha: this.globalAlpha, style: this.strokeStyle, width: this.lineWidth });
    },
  };
  return ctx;
}

beforeEach(() => {
  previousMap = S.map;
  S.map = {
    latLngToContainerPoint: (point) => ({ x: point.lng, y: point.lat }),
  };
});

afterEach(() => {
  S.map = previousMap;
});

describe('transparent PNG vector renderer', () => {
  it('keeps multi-part lines as separate paths instead of drawing a joining slash', () => {
    const ctx = mockContext();
    const parts = [
      [ll(1, 2), ll(3, 4)],
      [ll(5, 6), ll(7, 8)],
    ];

    renderLinePath(ctx, parts, 0, 0);

    expect(ctx.moveTo.mock.calls).toEqual([[2, 1], [6, 5]]);
    expect(ctx.lineTo.mock.calls).toEqual([[4, 3], [8, 7]]);
  });

  it('closes every polygon ring independently, including multipolygon rings and holes', () => {
    const ctx = mockContext();
    const polygons = [
      [
        [ll(0, 0), ll(0, 2), ll(2, 2), ll(2, 0)],
        [ll(0.5, 0.5), ll(1.5, 0.5), ll(1.5, 1.5), ll(0.5, 1.5)],
      ],
      [[ll(4, 4), ll(4, 6), ll(6, 6), ll(6, 4)]],
    ];

    renderPolygonPath(ctx, polygons, 0, 0);

    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx.closePath).toHaveBeenCalledTimes(3);
  });

  it('renders source fill/stroke opacity, dash pattern, and line joins', () => {
    const ctx = mockContext();
    ctx.globalAlpha = 0.8;
    const polygon = L.polygon(
      [[0, 0], [0, 2], [2, 2], [2, 0]],
      {
        color: '#123456',
        fillColor: '#abcdef',
        fillOpacity: 0.35,
        opacity: 0.6,
        weight: 4,
        dashArray: '5 2',
        lineCap: 'butt',
        lineJoin: 'bevel',
      },
    );

    drawVectorLayerToCanvas(ctx, polygon, 0, 0);

    expect(ctx.fillCalls).toEqual([{ rule: 'evenodd', alpha: 0.8 * 0.35, style: '#abcdef' }]);
    expect(ctx.strokeCalls).toEqual([{ alpha: 0.8 * 0.6, style: '#123456', width: 4 }]);
    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 2]);
    expect(ctx.lineCap).toBe('butt');
    expect(ctx.lineJoin).toBe('bevel');
  });

  it('renders CircleMarkers at their configured radius and opacity', () => {
    const ctx = mockContext();
    const marker = L.circleMarker([1, 2], {
      radius: 7,
      color: '#111111',
      fillColor: '#ff0000',
      fillOpacity: 0.4,
      opacity: 0.5,
    });

    drawVectorLayerToCanvas(ctx, marker, 0, 0);

    expect(ctx.arc).toHaveBeenCalledWith(2, 1, 7, 0, Math.PI * 2);
    expect(ctx.fillCalls[0].alpha).toBeCloseTo(0.4);
    expect(ctx.strokeCalls[0].alpha).toBeCloseTo(0.5);
  });
});
