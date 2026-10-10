import { useEffect, useState } from 'react';
import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
import { DEMO_MAPS, CONTINENTS, listDiscover, getMap } from '../../lib/share';
import { S } from '../../engine/state';
import L from 'leaflet';
import { showToast } from '../../engine/uiHelpers';
import { setupLayerProperties } from '../../engine/colors';
import { onFeatureClick } from '../../engine/exporters/geojson';
import { populateStyleDrawer } from '../../engine/styleInspector';
import { updateStats } from '../../engine/quickTools';

export function CreationsDrawer() {
  const [discover, setDiscover] = useState([...DEMO_MAPS, ...CONTINENTS]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const d = await listDiscover(20).catch(()=> [...DEMO_MAPS, ...CONTINENTS]);
      setDiscover(d||[...DEMO_MAPS, ...CONTINENTS]);
    } finally { setLoading(false); }
  };

  const isTest = import.meta.env.MODE === 'test';
  useEffect(() => {
    if (isTest) return;
    refresh();
    const el = document.getElementById('creations-drawer');
    if (!el) return;
    const obs = new MutationObserver(() => {
      if (el.classList.contains('open')) refresh();
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    if (el.classList.contains('open')) refresh();
    const onRefresh = () => refresh();
    el.addEventListener('refresh', onRefresh);
    return () => { obs.disconnect(); el.removeEventListener('refresh', onRefresh); };
  }, []);

  const [loadingId, setLoadingId] = useState(null);

  // Robust load — waits for map if needed, never silently fails to be clickable
  const handleLoad = async (map) => {
    try {
      // For continents, always fetch real geometry (Natural Earth union) — may take 1-2s first time
      const isContinent = map.kind === 'continent' || map.id?.startsWith('continent_');
      if (isContinent) {
        setLoadingId(map.id);
        showToast(`Loading real ${map.title}…`);
      }
      // Wait up to 2s for engine to be ready (fixes "not clickable" when clicked too early)
      for (let i = 0; i < 20; i++) {
        if (S.map && S.drawnItems) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (!S.map || !S.drawnItems) {
        showToast('Map not ready yet — wait a second and try again');
        if (isContinent) setLoadingId(null);
        return;
      }
      let full = map;
      // if passed an id or missing geojson, fetch it — and for continents fetch real regardless
      if (!map.geojson || isContinent) {
        try {
          const fetched = await getMap(map.id);
          full = fetched.map || fetched;
          // getMap for continents returns real GeoJSON; use it
        } catch (e) {
          if (isContinent) {
            console.warn('Real continent failed, using fallback', e);
            full = map; // fallback to rough polygon already in map
          } else {
            showToast('Could not fetch map — try again');
            if (isContinent) setLoadingId(null);
            return;
          }
        } finally {
          if (isContinent) setLoadingId(null);
        }
      }
      const gj = full.geojson || full;
      if (!gj || (!gj.type && !gj.features)) {
        showToast('This item has no GeoJSON');
        return;
      }
      let added = 0;
      // Use a fresh unique color per load so continents stay distinct from existing shapes
      const geoLayer = L.geoJSON(gj, {
        style: f => {
          const p = f?.properties||{};
          // Keep author color for continents/demos, fallback to fill
          const c = p.fill || full.color || '#10b981';
          const isLine = f?.geometry?.type?.includes('Line');
          return isLine ? { color: p.stroke||c, weight: p['stroke-width']||3, opacity:1, fillOpacity:0 } : { color: c, fillColor: c, fillOpacity: 1, weight: 0 };
        },
        onEachFeature: (f, layer) => {
          try { setupLayerProperties(layer); } catch {}
          if (f?.properties) {
            layer.feature = layer.feature || { type:'Feature', properties:{} };
            layer.feature.properties = { ...(f.properties), name: full.title || f.properties.name || 'Region' };
          }
          layer.on('click', () => {
            S.activeSelectedLayer = layer;
            try { populateStyleDrawer(layer); } catch {}
            try { onFeatureClick(layer); } catch {}
          });
        }
      });
      geoLayer.eachLayer(l => {
        if (l.eachLayer && l.getLayers && l.getLayers().length && !l.toGeoJSON) {
          l.eachLayer(child => { S.drawnItems.addLayer(child); added++; });
        } else {
          S.drawnItems.addLayer(l);
          added++;
        }
      });
      if (added===0) {
        showToast('Nothing to load');
        return;
      }
      try { updateStats(); } catch {}
      showToast(`Loaded “${full.title||map.title}” — ${added} shape${added>1?'s':''}`);
      actions.closeDrawers();
      setTimeout(()=> {
        try {
          const b = S.drawnItems.getBounds();
          if (b.isValid()) S.map.fitBounds(b, { padding:[30,30], maxZoom: 4 });
        } catch {}
      }, 120);
    } catch (e) {
      console.error(e);
      showToast('Failed to load: ' + (e.message||'error'));
    }
  };

  // Dedicated continent loader with same robust path — continents are FeatureCollections with 1-2 polys
  const handleLoadContinent = (continent) => handleLoad(continent);

  const continents = discover.filter(m=>m.kind==='continent');
  const demos = discover.filter(m=>m.kind==='demo');

  return (
    <div id="creations-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:top-20 lg:w-[420px] z-40 bg-slate-900/98 backdrop-blur-xl border border-slate-700/80 rounded-t-3xl lg:rounded-3xl p-5 max-h-[85vh] lg:max-h-none lg:h-auto overflow-y-auto flex flex-col pointer-events-auto">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200 flex items-center gap-2">
          <Icon name="compass" className="w-4 h-4 text-amber-400" /> Discover
          <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono">{discover.length}</span>
        </h3>
        <button type="button" onClick={() => actions.closeDrawers()} className="text-slate-400 hover:text-white p-1 cursor-pointer touch-manipulation">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      <p className="text-[11px] text-slate-500 mb-3 shrink-0">Tap <b className="text-slate-300">Load</b> to add to map — works offline, no storage.</p>

      {loading && <div className="text-center text-xs text-slate-500 py-4">Loading…</div>}

      {!loading && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* CONTINENTS */}
          <div>
            <h4 className="text-[11px] font-black tracking-widest uppercase text-slate-400 flex items-center gap-2 mb-2">
              <Icon name="globe-2" className="w-3.5 h-3.5 text-cyan-400" /> Continents
              <span className="text-[10px] font-mono text-slate-500 normal-case tracking-normal">7 regions</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {continents.map(m=>(
                <div key={m.id} className="bg-slate-800/90 rounded-2xl border border-slate-700/60 overflow-hidden flex flex-col">
                  <div className="h-20 grid place-items-center overflow-hidden relative" style={{background: `linear-gradient(135deg, ${m.color}18, #0f172a)`}}>
                    <div className="absolute inset-0 opacity-20" style={{background: `radial-gradient(60% 60% at 50% 35%, ${m.color}, transparent)`}}/>
                    <Icon name={m.title==='Oceania' ? 'waves' : m.title==='Antarctica' ? 'snowflake' : 'globe-2'} className="w-7 h-7 relative z-10" style={{color: m.color}}/>
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-2">
                    <div className="text-xs font-bold text-white truncate">{m.title}</div>
                    <button
                      type="button"
                      disabled={loadingId===m.id}
                      onClick={()=>handleLoadContinent(m)}
                      onTouchEnd={(e)=>{ e.preventDefault(); handleLoadContinent(m); }}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer touch-manipulation select-none relative z-10 pointer-events-auto ${loadingId===m.id ? 'bg-slate-600 opacity-60' : 'bg-slate-700 hover:bg-slate-600 active:bg-slate-500'}`}
                      style={{pointerEvents:'auto'}}
                    >{loadingId===m.id ? 'Loading…' : 'Load'}</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">Each loads as an <b className="text-slate-300">editable polygon</b> — recolor, split, merge, or cut to real coastline.</p>
          </div>

          {/* DEMOS */}
          <div>
            <h4 className="text-[11px] font-black tracking-widest uppercase text-slate-400 flex items-center gap-2 mb-2">
              <Icon name="map" className="w-3.5 h-3.5 text-emerald-400" /> Featured
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {demos.map(m=>(
                <div key={m.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/60 overflow-hidden">
                  <div className="h-28 bg-slate-800 grid place-items-center overflow-hidden relative">
                    <div className="h-full w-full bg-gradient-to-br from-emerald-900/40 via-sky-900/30 to-amber-900/30 grid place-items-center"><Icon name="map" className="w-8 h-8 text-emerald-400/70"/></div>
                  </div>
                  <div className="p-3.5">
                    <div className="text-xs font-bold text-white truncate">{m.title}</div>
                    <div className="text-[11px] text-slate-400">by {m.author?.name||'demo'} · editable</div>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={()=>handleLoad(m)}
                        onTouchEnd={(e)=>{ e.preventDefault(); handleLoad(m); }}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-bold text-white cursor-pointer touch-manipulation select-none relative z-10 pointer-events-auto"
                        style={{pointerEvents:'auto'}}
                      >Load</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-slate-500 text-center py-2 border-t border-slate-800 mt-2">Storage deleted — nothing is saved. Draw, export, reload.</div>
        </div>
      )}
    </div>
  );
}
