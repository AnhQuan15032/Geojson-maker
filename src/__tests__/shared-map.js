// A real Leaflet map shared by both sides of the parity comparison: the
// refactored module reads it from the store, the sandboxed original reads it
// from its own top-level `map` binding. Same instance, so any difference in
// output is a difference in the code, not in the projection.
import './dom-stubs.js';
import L from 'leaflet';
import { S } from '../engine/state.js';
import { setLegacyVar } from './legacy.mjs';

let shared = null;

export function sharedMap() {
  if (shared) return shared;
  const el = document.createElement('div');
  el.style.width = '1024px';
  el.style.height = '768px';
  document.body.appendChild(el);
  shared = L.map(el, { center: [51.5, -0.12], zoom: 12, attributionControl: false });
  S.map = shared;
  setLegacyVar('map', shared);
  return shared;
}

/** Installs the same drawn-shapes layer group on both sides. */
export function sharedDrawnItems(layers = []) {
  const group = L.featureGroup(layers);
  S.drawnItems = group;
  setLegacyVar('drawnItems', group);
  return group;
}
