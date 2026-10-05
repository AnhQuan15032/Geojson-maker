import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import { startEngine } from './engine/bootstrap.js';
import './lib/leaflet-setup.js';
import './index.css';

/**
 * The engine is imperative: it looks elements up by id, attaches Leaflet
 * behaviour and mutates the DOM directly. It has to start after React has
 * committed the component tree, and a ref callback is the one hook guaranteed
 * to fire once the DOM exists — so that is the hand-off point.
 *
 * StrictMode is deliberately not used: its development-time mount / unmount /
 * remount cycle would tear down and rebuild the subtree while the Leaflet map
 * stays bound to the detached nodes from the first mount.
 */
function EngineMount() {
  return (
    <div
      style={{ display: 'contents' }}
      ref={(node) => {
        if (node) startEngine();
      }}
    />
  );
}

// EngineMount comes last so its ref is the last one attached in the commit.
createRoot(document.getElementById('root')).render(
  <>
    <App />
    <EngineMount />
  </>,
);
