// Boots the *production bundle* (dist/) in jsdom.
//
// Dev and prod resolve modules differently — Leaflet and Geoman are UMD
// packages that Vite pre-bundles in dev but Rollup inlines in prod, and the
// Geoman bundle reaches for a global `L`. This test is what proves the shipped
// artefact, not just the source, actually starts.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import './dom-stubs.js';

const distHtml = path.resolve(import.meta.dirname, '../../dist/index.html');
const hasDist = fs.existsSync(distHtml);

describe.skipIf(!hasDist)('production bundle', () => {
  beforeAll(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('mounts the app and starts the engine from the built assets', async () => {
    const html = fs.readFileSync(distHtml, 'utf8');
    const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
    expect(entry, 'dist/index.html should reference a built entry chunk').toBeTruthy();

    const file = path.resolve(path.dirname(distHtml), entry.slice(1));
    await import(/* @vite-ignore */ pathToFileURL(file).href);

    // Let the engine's own async boot settle.
    await new Promise((r) => setTimeout(r, 50));

    const map = document.getElementById('map');
    expect(map, 'React should have rendered the map container').toBeTruthy();
    expect(map.classList.contains('leaflet-container'), 'Leaflet should have initialised on it').toBe(true);
    expect(document.querySelectorAll('svg.lucide').length).toBeGreaterThan(100);
    expect(document.querySelectorAll('.leaflet-pm-toolbar, .leaflet-control-container').length).toBeGreaterThan(0);
  });
});
