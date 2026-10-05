// Leaflet-Geoman ships as a pre-bundled IIFE that ends with `L.PM.initialize()`
// and reads `L` from the global scope — it has no module import for leaflet.
// Setting the global here, in a module that main.jsx imports *before* Geoman,
// gives it the exact same Leaflet instance the rest of the app uses.
import L from 'leaflet';

if (typeof window !== 'undefined' && !window.L) {
  window.L = L;
}

export default L;
