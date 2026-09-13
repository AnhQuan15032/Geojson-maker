/**
 * Raster basemap tiles.
 *
 * Tiles are cached per z/x/y, drawn at a fractional zoom (so wheel-zooming is
 * smooth) and, while a zoom level is still loading, the nearest already-loaded
 * ancestor tile is drawn in its place instead of leaving a hole.
 */

import { clamp } from '../core/util.js';
import { TILE_SIZE } from '../core/geo.js';

const sub = (z, x, y, letters) => letters[Math.abs(x + y) % letters.length];

export const PROVIDERS = {
  osm: {
    label: 'OpenStreetMap',
    max: 19,
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors',
  },
  light: {
    label: 'Light (CARTO)',
    max: 20,
    url: (z, x, y) => `https://${sub(z, x, y, 'abc')}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors © CARTO',
  },
  dark: {
    label: 'Dark (CARTO)',
    max: 20,
    url: (z, x, y) => `https://${sub(z, x, y, 'abc')}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors © CARTO',
  },
  none: { label: 'No basemap', max: 22, url: null, attribution: '' },
};

const MAX_CACHE = 420;
const MAX_INFLIGHT = 8;

export class TileLayer {
  constructor({ provider = 'osm', onLoad = () => {} } = {}) {
    this.provider = provider;
    this.onLoad = onLoad;
    this.cache = new Map();   // "z/x/y" -> { img, state, z, x, y }
    this.inflight = 0;
    this.queue = [];
    this.failedTiles = 0;
    this.requestedTiles = 0;
  }

  setProvider(key) {
    if (!PROVIDERS[key]) return;
    if (key === this.provider) return;
    this.provider = key;
    this.cache.clear();
    this.queue.length = 0;
  }

  get attribution() {
    return PROVIDERS[this.provider].attribution || '';
  }

  key(z, x, y) { return `${z}/${x}/${y}`; }

  /**
   * @param {CanvasRenderingContext2D} ctx  in CSS-pixel space
   * @param {{scale:number,ox:number,oy:number}} m camera matrix
   */
  draw(ctx, m, camera, width, height) {
    const provider = PROVIDERS[this.provider];
    if (!provider || !provider.url) return;

    const tileZ = clamp(Math.round(camera.zoom), 0, provider.max);
    const k = 2 ** (camera.zoom - tileZ);
    const size = TILE_SIZE * k;
    const n = 2 ** tileZ;

    let x0 = Math.floor((0 - m.ox) / size);
    let x1 = Math.ceil((width - m.ox) / size);
    let y0 = Math.floor((0 - m.oy) / size);
    let y1 = Math.ceil((height - m.oy) / size);

    // Never ask for more than one world width of tiles.
    if (x1 - x0 > n) { const mid = (x0 + x1) / 2; x0 = Math.floor(mid - n / 2); x1 = x0 + n; }
    y0 = clamp(y0, 0, n);
    y1 = clamp(y1, 0, n);
    if ((x1 - x0) * (y1 - y0) > 260) return;  // absurd viewport: skip this frame

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const wx = ((tx % n) + n) % n;
        const dx = tx * size + m.ox;
        const dy = ty * size + m.oy;
        const tile = this.get(tileZ, wx, ty);

        if (tile && tile.state === 'ready') {
          ctx.drawImage(tile.img, dx, dy, size + 0.6, size + 0.6);
          continue;
        }
        if (this.drawAncestor(ctx, m, tileZ, wx, ty, size, dx, dy)) continue;

        // Nothing loaded yet: neutral placeholder so the grid is legible.
        ctx.fillStyle = this.provider === 'dark' ? '#1b2129' : '#e8ecf1';
        ctx.fillRect(dx, dy, size + 0.6, size + 0.6);
      }
    }
  }

  drawAncestor(ctx, m, tileZ, x, y, size, dx, dy) {
    for (let dz = 1; dz <= 4; dz++) {
      const pz = tileZ - dz;
      if (pz < 0) break;
      const p = 2 ** dz;
      const px = Math.floor(x / p);
      const py = Math.floor(y / p);
      const parent = this.peek(pz, px, py);
      if (!parent || parent.state !== 'ready') continue;
      const pSize = size * p;
      const src = TILE_SIZE / p;
      ctx.drawImage(
        parent.img,
        (x - px * p) * src, (y - py * p) * src, src, src,
        dx - (x - px * p) * size, dy - (y - py * p) * size, pSize, pSize,
      );
      return true;
    }
    return false;
  }

  peek(z, x, y) { return this.cache.get(this.key(z, x, y)) || null; }

  get(z, x, y) {
    const key = this.key(z, x, y);
    let tile = this.cache.get(key);
    if (!tile) {
      tile = { img: null, state: 'idle', z, x, y };
      this.cache.set(key, tile);
      this.request(tile);
    } else if (tile.state === 'idle') {
      this.request(tile);
    }
    // Refresh recency (Map keeps insertion order).
    this.cache.delete(key);
    this.cache.set(key, tile);
    this.evict(z);
    return tile.state === 'ready' ? tile : null;
  }

  evict(currentZ) {
    if (this.cache.size <= MAX_CACHE) return;
    for (const [key, tile] of this.cache) {
      if (this.cache.size <= MAX_CACHE) break;
      if (tile.z === currentZ || tile.state === 'loading') continue;
      this.cache.delete(key);
    }
  }

  request(tile) {
    const provider = PROVIDERS[this.provider];
    if (!provider || !provider.url) return;
    this.requestedTiles++;
    if (this.inflight >= MAX_INFLIGHT) {
      tile.state = 'queued';
      this.queue.push(tile);
      return;
    }
    this.load(tile, provider.url(tile.z, tile.x, tile.y), true);
  }

  load(tile, url, cors) {
    this.inflight++;
    tile.state = 'loading';
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    img.onload = () => {
      this.inflight--;
      tile.img = img;
      tile.state = 'ready';
      this.onLoad();
      this.pump();
    };
    img.onerror = () => {
      this.inflight--;
      if (cors) {
        // Retry once without CORS — some mirrors omit the header.
        this.load(tile, url, false);
        return;
      }
      tile.state = 'error';
      this.failedTiles++;
      this.pump();
    };
    img.src = url;
  }

  pump() {
    while (this.inflight < MAX_INFLIGHT && this.queue.length) {
      const tile = this.queue.shift();
      if (tile.state === 'ready' || tile.state === 'loading') continue;
      const provider = PROVIDERS[this.provider];
      if (!provider || !provider.url) { tile.state = 'idle'; continue; }
      this.load(tile, provider.url(tile.z, tile.x, tile.y), true);
    }
  }
}
