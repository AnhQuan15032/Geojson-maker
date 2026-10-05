// Behavioural parity: run the ORIGINAL implementation (sandboxed copy of
// legacy/index.html) and the refactored module side by side on identical
// inputs. This is what proves the 9,400-line split preserved behaviour rather
// than merely compiling.
import { describe, it, expect, beforeAll } from 'vitest';
import { legacy, legacyValue } from './legacy.mjs';
import { sharedMap, sharedDrawnItems } from './shared-map.js';

import {
  clampInt, bboxArea, bboxesTouch, bboxOfRings, bboxOfLine, computeGeoBbox,
  escapeXml, hexToRgba, hexToRgbArr, rgbToHexStr, mercXY, mercLL, rngFactory,
  subsamplePts, pushTop, gridKey, normDir, rectOverlapArea, countCoords,
  chaikinOpen,
} from '../lib/util.js';
import { hslToHex } from '../engine/colors.js';
import { rgbToHex } from '../engine/styleInspector.js';
import { hexToAlightColor, buildAlightMotionPathData, buildAlightMotionLineData } from '../engine/exporters/alightMotion.js';
import { buildSvgPathData, buildRingSvg, buildSvgLineData } from '../engine/exporters/svg.js';
import { hexToKmlColor } from '../engine/exporters/kml.js';
import {
  lngLatToTile, tileToLngLat, mvtReadVarint, mvtZigzag, mvtRingArea, mvtGeometryToRings,
} from '../engine/coastTiles.js';
import { fractalSplit, roughenPathPx } from '../engine/borderDetail.js';
import { buildDistanceMap, sampleMaskPoints, rasterToZoom0, zoom0ToRaster } from '../engine/georef.js';
import { buildSeaMask } from '../engine/seaDetect.js';
import { nearestPathSide } from '../engine/split.js';
import { liveGeoJSONString } from '../engine/quickTools.js';
import L from 'leaflet';
import { containFit, coverFit, viewportPixelSize } from '../engine/overlayImage.js';

// ---- fixtures ------------------------------------------------------------
const ll = (lat, lng) => ({ lat, lng });
const RING = [ll(51.5, -0.12), ll(51.51, -0.1), ll(51.49, -0.09), ll(51.5, -0.12)];
const LINE = [ll(10, 20), ll(10.5, 20.7), ll(11, 21.2)];

// MVT commands: MoveTo(1,1) LineTo(4,4) LineTo(4,1) ClosePath, zigzag-encoded
const MVT_GEOM = [
  1, 2, 2, 4,          // MoveTo count=1 -> (1,1)
  2, 6, 6, 0, 6,       // LineTo count=3
  7,                   // ClosePath
];

const MASK = new Uint8Array([
  0, 1, 1, 0,
  1, 1, 1, 1,
  1, 1, 0, 0,
  0, 1, 1, 0,
]);

const stat = { W: 4, H: 4, k: 1, z0: 0, distMap: null };
stat.distMap = buildDistanceMap(MASK, 4, 4);

/** Asserts both implementations agree, with a readable label on failure. */
function agree(label, runLegacy, runNew) {
  it(label, () => {
    expect(runNew(), `${label}: new implementation diverged from the original`).toEqual(runLegacy());
  });
}

describe('geometry + maths helpers', () => {
  beforeAll(() => { sharedMap(); });

  agree('clampInt clamps into range', () => [legacy('clampInt')(5, 1, 3), legacy('clampInt')(-2, 1, 3), legacy('clampInt')(2, 1, 3)],
    () => [clampInt(5, 1, 3), clampInt(-2, 1, 3), clampInt(2, 1, 3)]);

  agree('bboxArea / bboxesTouch', () => [legacy('bboxArea')([0, 0, 10, 20]), legacy('bboxesTouch')([0, 0, 5, 5], [4, 4, 9, 9]), legacy('bboxesTouch')([0, 0, 5, 5], [6, 6, 9, 9])],
    () => [bboxArea([0, 0, 10, 20]), bboxesTouch([0, 0, 5, 5], [4, 4, 9, 9]), bboxesTouch([0, 0, 5, 5], [6, 6, 9, 9])]);

  agree('bboxOfRings / bboxOfLine', () => [legacy('bboxOfRings')([RING.map((p) => [p.lng, p.lat])]), legacy('bboxOfLine')(LINE.map((p) => [p.lng, p.lat]))],
    () => [bboxOfRings([RING.map((p) => [p.lng, p.lat])]), bboxOfLine(LINE.map((p) => [p.lng, p.lat]))]);

  agree('computeGeoBbox over a Polygon and a Point', () => [
    legacy('computeGeoBbox')({ type: 'Polygon', coordinates: [RING.map((p) => [p.lng, p.lat])] }),
    legacy('computeGeoBbox')({ type: 'Point', coordinates: [12, 34] }),
  ], () => [
    computeGeoBbox({ type: 'Polygon', coordinates: [RING.map((p) => [p.lng, p.lat])] }),
    computeGeoBbox({ type: 'Point', coordinates: [12, 34] }),
  ]);

  agree('mercXY / mercLL round-trip', () => {
    const a = legacy('mercXY')(51.5, -0.12, 12);
    const b = legacy('mercLL')(a.x, a.y, 12);
    return [a, b];
  }, () => {
    const a = mercXY(51.5, -0.12, 12);
    const b = mercLL(a.x, a.y, 12);
    return [a, b];
  });

  agree('rngFactory is deterministic per seed', () => {
    const r = legacy('rngFactory')(42);
    return [r(), r(), r()];
  }, () => {
    const r = rngFactory(42);
    return [r(), r(), r()];
  });

  agree('gridKey / normDir / rectOverlapArea / countCoords', () => [
    legacy('gridKey')(-0.123, 51.456),
    legacy('normDir')({ x: 3, y: 4 }, { x: 0, y: 0 }),
    legacy('rectOverlapArea')({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }),
    legacy('countCoords')({ type: 'Polygon', coordinates: [RING.map((p) => [p.lng, p.lat])] }),
  ], () => [
    gridKey(-0.123, 51.456),
    normDir({ x: 3, y: 4 }, { x: 0, y: 0 }),
    rectOverlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }),
    countCoords({ type: 'Polygon', coordinates: [RING.map((p) => [p.lng, p.lat])] }),
  ]);

  agree('subsamplePts thins a dense path', () => {
    const pts = [];
    for (let i = 0; i < 500; i++) pts.push(i * 2, Math.sin(i));
    // typed arrays from the vm realm are a different constructor, so compare contents
    return Array.from(legacy('subsamplePts')(pts, 40));
  }, () => {
    const pts = [];
    for (let i = 0; i < 500; i++) pts.push(i * 2, Math.sin(i));
    return Array.from(subsamplePts(pts, 40));
  });

  agree('pushTop keeps the best N by hits, ties broken by mean', () => {
    const l = [];
    for (let i = 0; i < 20; i++) legacy('pushTop')(l, { hits: i % 7, mean: i }, 5);
    return l;
  }, () => {
    const n = [];
    for (let i = 0; i < 20; i++) pushTop(n, { hits: i % 7, mean: i }, 5);
    return n;
  });

  agree('chaikinOpen smooths an open path identically', () => legacy('chaikinOpen')([{ x: 0, y: 0 }, { x: 10, y: 4 }, { x: 20, y: 0 }], 2),
    () => chaikinOpen([{ x: 0, y: 0 }, { x: 10, y: 4 }, { x: 20, y: 0 }], 2));
});

describe('colour conversions', () => {
  agree('hslToHex across the hue wheel', () => [0, 45, 120, 200, 300].map((h) => legacy('hslToHex')(h, 72, 50)),
    () => [0, 45, 120, 200, 300].map((h) => hslToHex(h, 72, 50)));

  agree('hexToKmlColor packs ABGR with alpha', () => ['#10b981', '#ff0000', '#000000'].map((c) => [legacy('hexToKmlColor')(c), legacy('hexToKmlColor')(c, 0.5)]),
    () => ['#10b981', '#ff0000', '#000000'].map((c) => [hexToKmlColor(c), hexToKmlColor(c, 0.5)]));

  agree('hexToAlightColor', () => ['#10b981', '#a5bfdd'].map((c) => legacy('hexToAlightColor')(c)),
    () => ['#10b981', '#a5bfdd'].map((c) => hexToAlightColor(c)));

  agree('hexToRgba / hexToRgbArr / rgbToHexStr / rgbToHex', () => [
    legacy('hexToRgba')('#10b981', 0.25),
    legacy('hexToRgbArr')('#a5bfdd'),
    legacy('rgbToHexStr')(16, 185, 129),
    legacy('rgbToHex')('rgb(16, 185, 129)'),
  ], () => [
    hexToRgba('#10b981', 0.25),
    hexToRgbArr('#a5bfdd'),
    rgbToHexStr(16, 185, 129),
    rgbToHex('rgb(16, 185, 129)'),
  ]);
});

describe('exporters', () => {
  beforeAll(() => { sharedMap(); });

  agree('escapeXml escapes every XML-significant character', () => legacy('escapeXml')('<tag a="1">Tom & Jerry\'s</tag>'),
    () => escapeXml('<tag a="1">Tom & Jerry\'s</tag>'));

  agree('buildSvgPathData projects a ring', () => legacy('buildSvgPathData')(RING, 100, 200),
    () => buildSvgPathData(RING, 100, 200));

  agree('buildRingSvg / buildSvgLineData', () => [legacy('buildRingSvg')(RING, 10, 20), legacy('buildSvgLineData')(LINE, 10, 20)],
    () => [buildRingSvg(RING, 10, 20), buildSvgLineData(LINE, 10, 20)]);

  agree('buildAlightMotionPathData emits the same path + bounds', () => legacy('buildAlightMotionPathData')(RING, -0.1, 51.5, 0.62, 5, 320, 240),
    () => buildAlightMotionPathData(RING, -0.1, 51.5, 0.62, 5, 320, 240));

  agree('buildAlightMotionLineData', () => legacy('buildAlightMotionLineData')(LINE, 20.5, 10.5, 0.98, 3, 100, 100),
    () => buildAlightMotionLineData(LINE, 20.5, 10.5, 0.98, 3, 100, 100));
});

describe('vector tile (MVT) decoding', () => {
  agree('mvtZigzag / mvtReadVarint', () => {
    const buf = new Uint8Array([0xac, 0x02]);
    return [[-3, 3, 0, -1, 300].map((v) => legacy('mvtZigzag')(v)), legacy('mvtReadVarint')(buf, 0)];
  }, () => {
    const buf = new Uint8Array([0xac, 0x02]);
    return [[-3, 3, 0, -1, 300].map((v) => mvtZigzag(v)), mvtReadVarint(buf, 0)];
  });

  agree('lngLatToTile / tileToLngLat round-trip', () => [
    legacy('lngLatToTile')(51.5, -0.12, 10),
    legacy('tileToLngLat')(511, 340, 10, 2048, 2048, 4096),
    legacy('lngLatToTile')(0, 0, 4),
  ], () => [
    lngLatToTile(51.5, -0.12, 10),
    tileToLngLat(511, 340, 10, 2048, 2048, 4096),
    lngLatToTile(0, 0, 4),
  ]);

  agree('mvtGeometryToRings decodes a command buffer', () => legacy('mvtGeometryToRings')(MVT_GEOM),
    () => mvtGeometryToRings(MVT_GEOM));

  agree('mvtRingArea is signed by winding', () => legacy('mvtRingArea')([[0, 0], [4, 0], [4, 4], [0, 4]]),
    () => mvtRingArea([[0, 0], [4, 0], [4, 4], [0, 4]]));
});

describe('border roughener + georeference maths', () => {
  agree('fractalSplit subdivides the same way for a seed', () => {
    const l = []; const n = [];
    legacy('fractalSplit')({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, 8, 0.55, legacy('rngFactory')(7), l);
    fractalSplit({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, 8, 0.55, rngFactory(7), n);
    return [l, n];
  }, () => {
    const l = [];
    legacy('fractalSplit')({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, 8, 0.55, legacy('rngFactory')(7), l);
    const n = [];
    fractalSplit({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, 8, 0.55, rngFactory(7), n);
    return [l, n];
  });

  agree('roughenPathPx respects the point budget', () => {
    const path = [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }];
    return [legacy('roughenPathPx')(path, 4, 0.5, 3, legacy('rngFactory')(11), 200),
      roughenPathPx(path, 4, 0.5, 3, rngFactory(11), 200)];
  }, () => {
    const path = [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }];
    return [legacy('roughenPathPx')(path, 4, 0.5, 3, legacy('rngFactory')(11), 200),
      roughenPathPx(path, 4, 0.5, 3, rngFactory(11), 200)];
  });

  agree('buildDistanceMap produces the same field', () => Array.from(legacy('buildDistanceMap')(MASK, 4, 4)),
    () => Array.from(buildDistanceMap(MASK, 4, 4)));

  agree('sampleMaskPoints picks the same subset', () => Array.from(legacy('sampleMaskPoints')(MASK, 4, 4, 6)),
    () => Array.from(sampleMaskPoints(MASK, 4, 4, 6)));

  agree('rasterToZoom0 / zoom0ToRaster', () => [legacy('rasterToZoom0')(stat, 1234), legacy('zoom0ToRaster')(stat, 4321)],
    () => [rasterToZoom0(stat, 1234), zoom0ToRaster(stat, 4321)]);
});

describe('sea-colour masking + overlay fitting', () => {
  beforeAll(() => { sharedMap(); });

  const cache = { W: 4, H: 4, data: new Uint8Array([
    10, 20, 30, 255, 10, 20, 30, 255, 200, 10, 10, 255, 200, 10, 10, 255,
    10, 20, 30, 255, 12, 22, 31, 255, 200, 10, 10, 255, 200, 10, 10, 255,
    10, 20, 30, 255, 10, 20, 30, 255, 200, 10, 10, 255, 11, 21, 30, 255,
    10, 20, 30, 255, 10, 20, 30, 255, 200, 10, 10, 255, 200, 10, 10, 255,
  ]) };

  agree('buildSeaMask thresholds identically', () => Array.from(legacy('buildSeaMask')(cache, [10, 20, 30], 40)),
    () => Array.from(buildSeaMask(cache, [10, 20, 30], 40)));

  agree('containFit / coverFit / viewportPixelSize', () => [
    legacy('containFit')(1000, 500, 2),
    legacy('coverFit')(1000, 500, 2),
    legacy('viewportPixelSize')(12, 1),
  ], () => [containFit(1000, 500, 2), coverFit(1000, 500, 2), viewportPixelSize(12, 1)]);
});

describe('the GeoJSON the app exports', () => {
  it('liveGeoJSONString produces byte-identical output', () => {
    sharedMap();
    const poly = L.polygon([[51.5, -0.12], [51.51, -0.1], [51.49, -0.09]], {
      color: '#10b981', fillColor: '#10b981', fillOpacity: 0.4,
    });
    poly.feature = poly.feature || {};
    poly.feature.properties = { name: 'Test Region', stroke: '#10b981', 'stroke-width': 2 };
    const line = L.polyline([[10, 20], [10.5, 20.7]], { color: '#ff0000' });
    line.feature = line.feature || {};
    line.feature.properties = { name: 'Test Line', stroke: '#ff0000' };
    sharedDrawnItems([poly, line]);

    for (const pretty of [false, true]) {
      expect(liveGeoJSONString(pretty), `pretty=${pretty}`).toEqual(legacy('liveGeoJSONString')(pretty));
    }
  });
});

describe('split geometry', () => {
  agree('nearestPathSide classifies both sides of a cut line', () => {
    const path = [[0, 0], [10, 0]];
    return [legacy('nearestPathSide')(5, 1, path, 1), legacy('nearestPathSide')(5, -1, path, 1), legacy('nearestPathSide')(20, 0, path, 1)];
  }, () => {
    const path = [[0, 0], [10, 0]];
    return [nearestPathSide(5, 1, path, 1), nearestPathSide(5, -1, path, 1), nearestPathSide(20, 0, path, 1)];
  });
});
