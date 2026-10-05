// Split out of the original single-file engine (see legacy/index.html).
// Origin: FAST COASTLINE (VECTOR TILES)

import L from 'leaflet';
import { S } from './state.js';
import {
  bboxArea,
  bboxOfLine,
  bboxOfRings,
  bboxesTouch,
  clampInt,
  countCoords,
  nextTick,
  nowMs,
  yieldFrame,
} from '../lib/util.js';
import { replaceLayerFromFeature } from './borderDetail.js';
import { renderCountryResults } from './countries.js';
import { ensureHeavyLibs, turf } from './heavyLibs.js';
import { updateCountriesUI } from './merge.js';
import { drawOsmPreview, fetchOsmCoastline, osmToleranceMeters, setOsmStatus } from './osmCoastline.js';
import { showToast } from './uiHelpers.js';

export function lngLatToTile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = clampInt(Math.floor((lng + 180) / 360 * n), 0, n - 1);
  const latR = Math.max(-1.4844, Math.min(1.4844, lat * Math.PI / 180));
  const y = clampInt(Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n), 0, n - 1);
  return {
    x,
    y
  };
}

export function tileToLngLat(x, y, z, px, py, extent) {
  const n = Math.pow(2, z);
  const wy = (y + py / extent) / n;
  const lng = (x + px / extent) / n * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * wy))) * 180 / Math.PI;
  return [lng, lat];
}

// Auto-pick the deepest zoom whose tile grid still fits the budget —
// this is what lets a wide area load in one fast pass. An optional
// minZ floor forces a deeper pass (used by "Boost selected area").

// Auto-pick the deepest zoom whose tile grid still fits the budget —
// this is what lets a wide area load in one fast pass. An optional
// minZ floor forces a deeper pass (used by "Boost selected area").
export function chooseTileZoom(bounds, budget, minZ) {
  const latN = bounds.getNorth(),
    latS = bounds.getSouth();
  const lngW = bounds.getWest(),
    lngE = bounds.getEast();
  const floor = minZ ? clampInt(Math.round(minZ), 4, 15) : 4;
  let z = clampInt(Math.round(S.map.getZoom()) + 2, 5, 14);
  if (z < floor) z = floor;
  const planAt = zz => {
    const min = lngLatToTile(latN, lngW, zz);
    const max = lngLatToTile(latS, lngE, zz);
    return {
      z: zz,
      min,
      max,
      count: (max.x - min.x + 1) * (max.y - min.y + 1)
    };
  };
  for (let zz = z; zz >= floor; zz--) {
    const p = planAt(zz);
    if (p.count <= budget) return p;
  }
  return planAt(floor);
}

// ---- Minimal MVT decoder (protobuf, zero dependencies) ----

// ---- Minimal MVT decoder (protobuf, zero dependencies) ----
export function mvtReadVarint(buf, pos) {
  let value = 0,
    mult = 1,
    b;
  do {
    b = buf[pos++];
    value += (b & 0x7f) * mult;
    mult *= 128;
  } while (b & 0x80);
  return {
    value,
    pos
  };
}

export function mvtZigzag(v) {
  return v >>> 1 ^ -(v & 1);
}

export function mvtParseTile(buffer) {
  const buf = new Uint8Array(buffer);
  const layers = [];
  let pos = 0;
  while (pos < buf.length) {
    const tag = mvtReadVarint(buf, pos);
    pos = tag.pos;
    const field = tag.value >> 3,
      wire = tag.value & 7;
    if (wire === 2) {
      const len = mvtReadVarint(buf, pos);
      pos = len.pos;
      const end = pos + len.value;
      if (field === 3) layers.push(mvtParseLayer(buf.subarray(pos, end)));
      pos = end;
    } else if (wire === 0) pos = mvtReadVarint(buf, pos).pos;else if (wire === 5) pos += 4;else if (wire === 1) pos += 8;else break;
  }
  return layers;
}

export function mvtParseLayer(buf) {
  let pos = 0,
    name = '',
    extent = 4096;
  const keys = [],
    values = [],
    featureBufs = [];
  const dec = new TextDecoder();
  while (pos < buf.length) {
    const tag = mvtReadVarint(buf, pos);
    pos = tag.pos;
    const field = tag.value >> 3,
      wire = tag.value & 7;
    if (wire === 2) {
      const len = mvtReadVarint(buf, pos);
      pos = len.pos;
      const end = pos + len.value;
      if (field === 1) name = dec.decode(buf.subarray(pos, end));else if (field === 2) featureBufs.push(buf.subarray(pos, end));else if (field === 3) keys.push(dec.decode(buf.subarray(pos, end)));else if (field === 4) values.push(mvtParseValue(buf.subarray(pos, end)));
      pos = end;
    } else if (wire === 0) {
      const v = mvtReadVarint(buf, pos);
      pos = v.pos;
      if (field === 5) extent = v.value || 4096;
    } else if (wire === 5) pos += 4;else if (wire === 1) pos += 8;else break;
  }
  return {
    name,
    extent,
    keys,
    values,
    featureBufs
  };
}

export function mvtParseValue(buf) {
  let pos = 0;
  while (pos < buf.length) {
    const tag = mvtReadVarint(buf, pos);
    pos = tag.pos;
    const field = tag.value >> 3,
      wire = tag.value & 7;
    if (wire === 2) {
      const len = mvtReadVarint(buf, pos);
      pos = len.pos;
      const end = pos + len.value;
      if (field === 1) return new TextDecoder().decode(buf.subarray(pos, end));
      pos = end;
    } else if (wire === 0) {
      const v = mvtReadVarint(buf, pos);
      pos = v.pos;
      if (field === 4 || field === 5 || field === 7) return v.value;
      if (field === 6) return mvtZigzag(v.value);
    } else if (wire === 5) pos += 4;else if (wire === 1) pos += 8;else break;
  }
  return null;
}

export function mvtParseFeatures(layer) {
  const out = [];
  layer.featureBufs.forEach(fbuf => {
    const tags = {};
    let pos = 0,
      geomType = 0,
      geomRaw = null;
    while (pos < fbuf.length) {
      const tag = mvtReadVarint(fbuf, pos);
      pos = tag.pos;
      const field = tag.value >> 3,
        wire = tag.value & 7;
      if (wire === 0) {
        const v = mvtReadVarint(fbuf, pos);
        pos = v.pos;
        if (field === 3) geomType = v.value;
      } else if (wire === 2) {
        const len = mvtReadVarint(fbuf, pos);
        pos = len.pos;
        const end = pos + len.value;
        if (field === 2) {
          const idx = [];
          let p = pos;
          while (p < end) {
            const r = mvtReadVarint(fbuf, p);
            p = r.pos;
            idx.push(r.value);
          }
          for (let i = 0; i + 1 < idx.length; i += 2) {
            const k = layer.keys[idx[i]];
            if (k) tags[k] = layer.values[idx[i + 1]];
          }
        } else if (field === 4) {
          const g = [];
          let p = pos;
          while (p < end) {
            const r = mvtReadVarint(fbuf, p);
            p = r.pos;
            g.push(r.value);
          }
          geomRaw = g;
        }
        pos = end;
      } else if (wire === 5) pos += 4;else if (wire === 1) pos += 8;else break;
    }
    if (geomRaw && geomRaw.length) out.push({
      geomType,
      tags,
      geomRaw
    });
  });
  return out;
}

export function mvtGeometryToRings(geomRaw) {
  const rings = [];
  let x = 0,
    y = 0,
    i = 0,
    cur = null;
  while (i < geomRaw.length) {
    const cmd = geomRaw[i++];
    const id = cmd & 7,
      count = cmd >> 3;
    if (id === 1) {
      for (let k = 0; k < count; k++) {
        x += mvtZigzag(geomRaw[i++]);
        y += mvtZigzag(geomRaw[i++]);
        cur = [[x, y]];
        rings.push(cur);
      }
    } else if (id === 2) {
      for (let k = 0; k < count; k++) {
        x += mvtZigzag(geomRaw[i++]);
        y += mvtZigzag(geomRaw[i++]);
        if (cur) cur.push([x, y]);
      }
    } else if (id === 7) {
      if (cur && cur.length) {
        cur.push([cur[0][0], cur[0][1]]);
        x = cur[0][0];
        y = cur[0][1];
      }
    } else break;
  }
  return rings;
}

export function mvtRingArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

export async function runTilePass(pattern, plan, totalTiles, sink) {
  const tiles = [];
  for (let tx = plan.min.x; tx <= plan.max.x; tx++) {
    for (let ty = plan.min.y; ty <= plan.max.y; ty++) tiles.push({
      z: plan.z,
      x: tx,
      y: ty
    });
  }
  let done = 0,
    failed = 0;
  const dec = new TextDecoder();
  const worker = async () => {
    while (tiles.length) {
      const t = tiles.shift();
      const url = pattern.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = await r.arrayBuffer();
        const layers = mvtParseTile(buf);

        // Ground-truth tolerance for this tile: ~1.5 screen pixels of the
        // real world. Densities drop 5–20× with no visible detail loss,
        // which keeps the preview, dissolve and snapping all fast.
        const cLat = tileToLngLat(t.x, t.y, t.z, 128, 128, 256)[1];
        const resolution = 156543.03392 * Math.cos(cLat * Math.PI / 180) / Math.pow(2, t.z);
        const tolDeg = Math.max(resolution * 1.5 / 111320, 1e-7);
        const water = layers.find(l => l.name === 'water');
        if (water) {
          const feats = mvtParseFeatures(water);
          feats.forEach(f => {
            if (f.geomType !== 3) return;
            const cls = f.tags && f.tags.class;
            if (cls && cls !== 'ocean') return; // lakes/rivers never count as sea
            const rings = mvtGeometryToRings(f.geomRaw);
            if (rings.length === 0) return;
            const simplified = [];
            rings.forEach(rg => {
              let ll = rg.map(p => tileToLngLat(t.x, t.y, t.z, p[0], p[1], water.extent));
              if (ll.length < 4) return;
              if (window.turf) {
                try {
                  const s = turf.simplify(turf.lineString(ll), {
                    tolerance: tolDeg,
                    highQuality: false,
                    mutate: false
                  });
                  if (s && s.geometry && s.geometry.coordinates.length >= 4) ll = s.geometry.coordinates;
                } catch (e) {}
              }
              // Drop tile-seam slivers — these were the straight false
              // segments along tile borders that made the coast look broken.
              if (Math.abs(mvtRingArea(ll)) < 1e-7) return;
              simplified.push(ll);
              sink.coast.push(ll);
            });
            if (simplified.length === 0) return;

            // Sign-convention-free classification: the largest ring is an
            // exterior, rings sharing its sign are exteriors too (holes = islands)
            let maxAbs = -1,
              maxSign = 1;
            simplified.forEach(rg => {
              const a = mvtRingArea(rg);
              if (Math.abs(a) > maxAbs) {
                maxAbs = Math.abs(a);
                maxSign = a >= 0 ? 1 : -1;
              }
            });
            const oriented = simplified.filter(rg => (mvtRingArea(rg) >= 0 ? 1 : -1) === maxSign);
            if (oriented.length) sink.ocean.push(oriented);
          });
        }
      } catch (e) {
        failed++;
      }
      done++;
      if (done % 5 === 0 || done === totalTiles) setOsmStatus(`tiles ${done}/${totalTiles}`, 'busy');
    }
  };
  const pool = [worker(), worker(), worker(), worker(), worker(), worker()];
  await Promise.all(pool.map(p => p.then(() => {}).catch(() => {})));
  return failed;
}

// ---- Tile-seam dissolve (the key to a genuinely real coastline) ----
// Vector tiles clip the ocean at every tile edge, so per-tile polygons come
// with straight false segments along tile borders. Turf unions touching
// polygons into connected landmasses, and the coastline is then read from
// the dissolved rings — seam-free, continuous, actual OSM geometry.

export async function dissolveOceanFeatures(list) {
  if (!window.turf || list.length === 0) return list || [];
  const sorted = list.slice().sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox));
  const groups = [];
  const COORD_CAP = 60000; // stop merging a group once it gets huge
  const TIME_BUDGET = 9000; // never let the dissolve freeze the UI
  const t0 = nowMs();
  let budgetHit = false;
  for (let i = 0; i < sorted.length; i++) {
    if (nowMs() - t0 > TIME_BUDGET) {
      budgetHit = true;
      break;
    }
    const f = sorted[i];
    let placed = false;
    for (let g = 0; g < groups.length; g++) {
      if (!bboxesTouch(groups[g].bbox, f.bbox)) continue;
      try {
        const u = turf.union(groups[g].feature, f.feature);
        if (u && u.geometry && countCoords(u.geometry.coordinates) <= COORD_CAP) {
          groups[g] = {
            feature: u,
            bbox: [Math.min(groups[g].bbox[0], f.bbox[0]), Math.min(groups[g].bbox[1], f.bbox[1]), Math.max(groups[g].bbox[2], f.bbox[2]), Math.max(groups[g].bbox[3], f.bbox[3])]
          };
          placed = true;
          break;
        }
      } catch (e) {/* geometric corner case — keep looking / fall back */}
    }
    if (!placed) groups.push({
      feature: f.feature,
      bbox: f.bbox
    });
    if (i % 6 === 0) {
      setOsmStatus(`dissolving tile seams ${i}/${sorted.length}…`, 'busy');
      await yieldFrame(); // rAF yields keep the progress bar animating
    }
  }
  if (budgetHit) setOsmStatus('merge budget reached — partial dissolve', 'warn');
  return groups;
}

export function rebuildCoastLinesFromOcean() {
  S.osmCoastLines = [];
  S.osmTilesOcean.forEach(o => {
    const g = o.feature.geometry;
    if (!g) return;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    polys.forEach(rings => rings.forEach(ring => {
      if (ring.length >= 3) S.osmCoastLines.push({
        coords: ring,
        bbox: bboxOfLine(ring)
      });
    }));
  });
}

export async function fetchFastCoastTiles(boundsOpt, opts) {
  if (S.osmFetchBusy) {
    showToast('Still fetching coastline…');
    return false;
  }
  const o = opts || {};
  const append = !!o.append;
  const budget = o.budget || parseInt((document.getElementById('coast-quality') || {}).value || '180', 10);
  const wantZoom = o.minZoom || 0;
  S.osmFetchBusy = true;
  setOsmStatus('tiles…', 'busy');
  const btn = document.getElementById('btn-osm-fast');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-60');
  }
  try {
    await ensureHeavyLibs();
    const bounds = boundsOpt || S.map.getBounds().pad(0.05);
    const plan = chooseTileZoom(bounds, budget, wantZoom);
    const totalTiles = plan.count;

    // Try .pbf first, then extension-less, so a source change can't break it
    const patterns = ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf', 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}'];
    const sink = {
      coast: [],
      ocean: []
    };
    let failed = totalTiles;
    for (const pat of patterns) {
      sink.coast.length = 0;
      sink.ocean.length = 0;
      failed = await runTilePass(pat, plan, totalTiles, sink);
      if (sink.coast.length > 0) {
        S.osmTileUrlPattern = pat;
        break;
      }
    }
    if (sink.coast.length === 0) {
      setOsmStatus(failed >= totalTiles ? 'tile source down' : 'no ocean here', 'warn');
      showToast(failed >= totalTiles ? 'Vector tile source unreachable — try Retina (Overpass)' : 'No ocean in this area — pan to a coast');
      return false;
    }

    // Raw per-tile polygons → dissolved landmass-scale geometry
    const rawList = sink.ocean.map(rings => ({
      feature: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: rings
        }
      },
      bbox: bboxOfRings(rings) // all rings, so island holes count too
    }));
    let dissolved = await dissolveOceanFeatures(rawList).catch(() => rawList);
    if (!dissolved || dissolved.length === 0) dissolved = rawList;
    if (append) {
      const combined = S.osmTilesOcean.concat(dissolved);
      setOsmStatus('merging with existing ocean…', 'busy');
      const remerged = await dissolveOceanFeatures(combined).catch(() => combined);
      S.osmTilesOcean = remerged && remerged.length ? remerged : combined;
    } else {
      S.osmTilesOcean = dissolved;
    }
    S.osmTileZoomUsed = plan.z;
    rebuildCoastLinesFromOcean();
    if (S.osmCoastLines.length === 0) {
      // Dissolve produced nothing usable — fall back to the raw tile rings
      S.osmCoastLines = sink.coast.map(ring => ({
        coords: ring,
        bbox: bboxOfLine(ring)
      }));
    }
    drawOsmPreview();
    const pts = S.osmCoastLines.reduce((s, r) => s + r.coords.length, 0);
    setOsmStatus(`${pts.toLocaleString()} pts · z${plan.z}${append ? ' boosted' : ''} · seams dissolved`, 'ok');
    showToast(`Coastline ready — ${pts.toLocaleString()} real points at zoom ${plan.z}, tile seams removed`);
    return true;
  } catch (err) {
    console.warn('Fast coastline failed:', err);
    setOsmStatus('failed', 'warn');
    return false;
  } finally {
    S.osmFetchBusy = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-60');
    }
  }
}

// Second-pass refinement: fetch deeper tiles for just the selected shape
// (a tiny area, so a much higher zoom fits the budget) and dissolve them
// into the existing ocean geometry.

// Second-pass refinement: fetch deeper tiles for just the selected shape
// (a tiny area, so a much higher zoom fits the budget) and dissolve them
// into the existing ocean geometry.
export async function boostCoastDetail() {
  const layer = S.activeSelectedLayer;
  const hasBounds = layer && typeof layer.getBounds === 'function' && layer.getBounds && layer.getBounds().isValid();
  const bounds = hasBounds ? layer.getBounds().pad(0.15) : S.map.getBounds().pad(0.05);
  const floorZ = Math.max(S.osmTileZoomUsed + 1, 11);
  const budget = Math.max(180, parseInt((document.getElementById('coast-quality') || {}).value || '180', 10));
  const ok = await fetchFastCoastTiles(bounds, {
    append: true,
    budget,
    minZoom: floorZ
  });
  if (ok) {
    showToast(`Detail boosted to zoom ${S.osmTileZoomUsed}${hasBounds ? ' for the selected area' : ''} — seams dissolved & merged`);
  }
}

// Turf simplify — trims coastline point count for exports/animations while
// staying visually faithful (tolerance in metres).

// Turf simplify — trims coastline point count for exports/animations while
// staying visually faithful (tolerance in metres).
export async function simplifySelectedCoast() {
  const layer = S.activeSelectedLayer;
  if (!layer || !(layer instanceof L.Polyline)) {
    showToast('Select a shape first');
    return;
  }
  await ensureHeavyLibs();
  if (!window.turf) {
    showToast('Turf unavailable');
    return;
  }
  const meters = parseFloat((document.getElementById('coast-simplify') || {}).value || '50');
  const tolDeg = Math.max(1, meters) / 111320;
  let before = 0,
    simplified = null;
  try {
    const geo = layer.toGeoJSON();
    before = countCoords(geo.geometry.coordinates);
    simplified = turf.simplify(geo, {
      tolerance: tolDeg,
      highQuality: true,
      mutate: false
    });
  } catch (e) {
    showToast('Simplify failed on this geometry');
    return;
  }
  if (!simplified || !simplified.geometry) {
    showToast('Simplify failed');
    return;
  }
  const after = countCoords(simplified.geometry.coordinates);
  if (after >= before) {
    showToast('Already minimal at this tolerance');
    return;
  }
  Object.keys(S.countryLayerById).forEach(k => {
    if (S.countryLayerById[k] === layer) delete S.countryLayerById[k];
  });
  const ci = S.countryLayers.indexOf(layer);
  if (ci >= 0) S.countryLayers.splice(ci, 1);
  replaceLayerFromFeature(simplified, layer.options);
  updateCountriesUI();
  renderCountryResults();
  showToast(`Simplified ${before.toLocaleString()} → ${after.toLocaleString()} points (±${Math.round(meters)} m)`);
}

// Cut the selected shape (a country, a drawn region…) with the fetched
// ocean polygons so its border becomes the genuine coastline.

// Cut the selected shape (a country, a drawn region…) with the fetched
// ocean polygons so its border becomes the genuine coastline.
export async function refineSelectionWithTilesCoast(auto) {
  const layer = S.activeSelectedLayer;
  if (!layer || !(layer instanceof L.Polygon)) {
    if (!auto) showToast('Select a polygon or country first');
    return;
  }
  await ensureHeavyLibs();
  if (S.osmTilesOcean.length === 0) {
    setOsmStatus('auto-fetching…', 'busy');
    const ok = await fetchFastCoastTiles(layer.getBounds().pad(0.25));
    if (!ok) return;
  }
  const geo = layer.toGeoJSON();
  const pb = turf.bbox(geo);
  const cands = S.osmTilesOcean.filter(o => !(pb[0] > o.bbox[2] || pb[2] < o.bbox[0] || pb[1] > o.bbox[3] || pb[3] < o.bbox[1]));
  if (cands.length === 0) {
    if (!auto) showToast('No fetched ocean near this shape');
    return;
  }

  // Turf strategy: merge the fetched ocean polygons into one shape, then a
  // single difference cuts the shape's border onto the real coastline.
  let acc = geo;
  let applied = 0;
  setOsmStatus(`merging ${cands.length} ocean tiles…`, 'busy');
  let oceanUnion = null;
  const mergeCap = 400;
  for (let i = 0; i < cands.length && i < mergeCap; i++) {
    try {
      const merged = oceanUnion ? turf.union(oceanUnion, cands[i].feature) : cands[i].feature;
      if (merged && merged.geometry) oceanUnion = merged;
    } catch (e) {/* keep the partial union */}
    if (i % 25 === 0) {
      setOsmStatus(`merging ocean ${i}/${Math.min(cands.length, mergeCap)}…`, 'busy');
      await nextTick();
    }
  }
  if (oceanUnion) {
    try {
      const res = turf.difference(geo, oceanUnion);
      if (res && res.geometry) {
        acc = res;
        applied = 1;
      }
    } catch (e) {}
  }

  // Fallback: if the big union failed, cut tile by tile (fewer, chunked)
  if (applied === 0) {
    const diffCap = Math.min(cands.length, 120);
    for (let i = 0; i < diffCap; i++) {
      try {
        const res = turf.difference(acc, cands[i].feature);
        if (res && res.geometry) {
          acc = res;
          applied++;
        }
      } catch (e) {}
      if (i % 20 === 0) {
        setOsmStatus(`refining ${i}/${diffCap}…`, 'busy');
        await nextTick();
      }
    }
  }
  if (applied === 0) {
    setOsmStatus('no overlap', 'warn');
    if (!auto) showToast('This shape does not overlap the fetched ocean data');
    return;
  }
  Object.keys(S.countryLayerById).forEach(k => {
    if (S.countryLayerById[k] === layer) delete S.countryLayerById[k];
  });
  const ci = S.countryLayers.indexOf(layer);
  if (ci >= 0) S.countryLayers.splice(ci, 1);
  replaceLayerFromFeature({
    type: 'Feature',
    properties: geo.properties || {},
    geometry: acc.geometry
  }, layer.options);
  updateCountriesUI();
  renderCountryResults();
  setOsmStatus('coast-accurate', 'ok');
  showToast(auto ? 'Country loaded with real coastline borders' : 'Borders now follow the real coastline');
}

// ---- Snapping a shape's border onto the real coast (all Turf.js) ----
// turf.nearestPointOnLine does the distance math, and turf.lineSlice walks
// the genuine coastline between two consecutive snapped vertices — so the
// inserted geometry is the actual OSM line, not a straight interpolation.

// ---- Snapping a shape's border onto the real coast (all Turf.js) ----
// turf.nearestPointOnLine does the distance math, and turf.lineSlice walks
// the genuine coastline between two consecutive snapped vertices — so the
// inserted geometry is the actual OSM line, not a straight interpolation.
export function coastFeature(line) {
  if (!line.feature) line.feature = turf.lineString(line.coords);
  return line.feature;
}

export function nearestOnOsm(lng, lat, cosLat, tolMeters) {
  if (!window.turf) return null;
  const pt = turf.point([lng, lat]);
  const mLng = tolMeters / 111320 / Math.max(cosLat, 0.15) + 0.0005;
  const mLat = tolMeters / 111320 + 0.0005;
  let best = null;
  for (let li = 0; li < S.osmCoastLines.length; li++) {
    const line = S.osmCoastLines[li];
    const bb = line.bbox;
    if (lng < bb[0] - mLng || lng > bb[2] + mLng || lat < bb[1] - mLat || lat > bb[3] + mLat) continue;
    try {
      const np = turf.nearestPointOnLine(coastFeature(line), pt, {
        units: 'kilometers'
      });
      const d = np.properties.dist * 1000;
      if (!best || d < best.dist) {
        best = {
          dist: d,
          li,
          location: np.geometry.coordinates,
          index: np.properties.index
        };
      }
    } catch (e) {/* skip malformed line */}
  }
  return best;
}

export function snapRingToOsm(ring, cosLat, tolMeters) {
  const closed = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const verts = closed ? ring.slice(0, -1) : ring.slice();
  const n = verts.length;
  if (n < 3) return {
    ring,
    snapped: 0
  };
  const out = [];
  let prev = null;
  let snapped = 0;
  for (let i = 0; i < n; i++) {
    const v = verts[i];
    const near = nearestOnOsm(v[0], v[1], cosLat, tolMeters);
    if (near && near.dist <= tolMeters) {
      // Same coastline way as the previous snapped vertex → walk the real
      // coast between the two points with turf.lineSlice
      if (prev && prev.li === near.li) {
        try {
          const slice = turf.lineSlice(turf.point(prev.location), turf.point(near.location), coastFeature(S.osmCoastLines[near.li]));
          const sc = slice.geometry.coordinates;
          for (let k = 1; k < sc.length - 1 && out.length < 8000; k++) out.push([sc[k][0], sc[k][1]]);
        } catch (e) {/* fall through to the direct snap */}
      }
      out.push([near.location[0], near.location[1]]);
      prev = {
        li: near.li,
        location: near.location
      };
      snapped++;
    } else {
      out.push([v[0], v[1]]);
      prev = null;
    }
  }
  if (out.length < 3) return {
    ring: ring,
    snapped: 0
  };
  return {
    ring: closed ? out.concat([out[0]]) : out,
    snapped
  };
}

export async function snapSelectionToOsmCoast() {
  const layer = S.activeSelectedLayer;
  if (!layer || !(layer instanceof L.Polygon)) {
    showToast('Select a polygon first — draw it roughly along the coast, then snap');
    return;
  }

  // Auto-fetch the coastline for the shape's own area if nothing is loaded
  if (S.osmCoastLines.length === 0) {
    const ok = await fetchOsmCoastline(layer.getBounds().pad(0.25), true);
    if (!ok) return;
  }
  const tol = osmToleranceMeters();
  const cosLat = Math.max(Math.cos(S.map.getCenter().lat * Math.PI / 180), 0.15);
  const geo = layer.toGeoJSON();
  const geom = geo.geometry;
  let snapped = 0;
  const mapRing = ring => {
    const r = snapRingToOsm(ring, cosLat, tol);
    snapped += r.snapped;
    return r.ring;
  };
  let newGeom;
  try {
    if (geom.type === 'Polygon') {
      newGeom = {
        type: 'Polygon',
        coordinates: geom.coordinates.map(mapRing)
      };
    } else if (geom.type === 'MultiPolygon') {
      newGeom = {
        type: 'MultiPolygon',
        coordinates: geom.coordinates.map(poly => poly.map(mapRing))
      };
    } else {
      showToast('Snapping works on polygons');
      return;
    }
  } catch (e) {
    showToast('Snapping failed on this geometry');
    return;
  }
  if (snapped === 0) {
    showToast(`No border points within ${Math.round(tol)} m of real coastline — raise the tolerance or fetch this area`);
    return;
  }

  // Keep the country index coherent if this was a loaded country
  Object.keys(S.countryLayerById).forEach(k => {
    if (S.countryLayerById[k] === layer) delete S.countryLayerById[k];
  });
  const ci = S.countryLayers.indexOf(layer);
  if (ci >= 0) S.countryLayers.splice(ci, 1);
  replaceLayerFromFeature({
    type: 'Feature',
    properties: geo.properties || {},
    geometry: newGeom
  }, layer.options);
  updateCountriesUI();
  renderCountryResults();
  showToast(`Snapped ${snapped} border point${snapped > 1 ? 's' : ''} onto the real OSM coastline — the rest follows the coast exactly`);
}

// ================= LOAD COUNTRIES AS EDITABLE GEOJSON =================
// Pulls the complete Natural Earth country dataset (every sovereign state
// and dependency) and drops each one onto the map as its own editable,
// uniquely colored shape carrying its real name.
