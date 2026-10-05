// Leaflet + Geoman bring-up, in one place so that the app and the tests load
// them in exactly the same order.
//
// Leaflet-Geoman ships as a pre-bundled IIFE that ends with `L.PM.initialize()`
// and reads `L` from the global scope — it has no module import for leaflet.
// Importing leaflet-global first puts the very same Leaflet instance the rest
// of the app uses onto window, which is what Geoman then decorates.
import './leaflet-global.js';
import '@geoman-io/leaflet-geoman-free';

import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'maplibre-gl/dist/maplibre-gl.css';
