// Split out of the original single-file engine (see legacy/index.html).
// Origin: LAZY HEAVY LIBRARIES (Lightweight Init)

import { S } from './state.js';

export let turf = null;

export let topojson = null;

export function ensureHeavyLibs() {
  if (!S.heavyLibsPromise) {
    S.heavyLibsPromise = Promise.all([import('@turf/turf'), import('topojson-client')]).then(([turfModule, topojsonModule]) => {
      turf = turfModule.default ?? turfModule;
      topojson = topojsonModule.default ?? topojsonModule;
      if (typeof window !== 'undefined') {
        window.turf = turf;
        window.topojson = topojson;
      }
    }).catch(err => {
      S.heavyLibsPromise = null;
      throw err;
    });
  }
  return S.heavyLibsPromise;
}
