import { useEffect, useState, useRef } from 'react';
import { Icon } from '../../lib/icons';
import actions from '../../engine/actions';
import { getUser, subscribeAuth } from '../../lib/auth';
import { listDiscover, listMyMaps, getMap, publishMap, deleteMap, getUsage, uploadGeoJSONFile, formatBytes, quotaPercent } from '../../lib/cloud';
import { liveGeoJSONString } from '../../engine/quickTools';
import { S } from '../../engine/state';
import L from 'leaflet';
import { showToast } from '../../engine/uiHelpers';

export function CreationsDrawer() {
  const [tab, setTab] = useState('discover'); // discover | my
  const [discover, setDiscover] = useState([]);
  const [myMaps, setMyMaps] = useState([]);
  const [usage, setUsage] = useState({ usage: 0, quota: 1048576 });
  const [user, setUser] = useState(getUser());
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeAuth(setUser);
    setUser(getUser());
    return unsub;
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const [d, m, u] = await Promise.all([
        listDiscover(20).catch(()=>[]),
        user ? listMyMaps().catch(()=>[]) : Promise.resolve([]),
        user ? getUsage().catch(()=>({usage:0, quota:1048576})) : Promise.resolve({usage:0, quota:1048576}),
      ]);
      setDiscover(d);
      setMyMaps(m);
      setUsage(u);
    } finally { setLoading(false); }
  };

  // refresh when drawer opens
  useEffect(() => {
    const el = document.getElementById('creations-drawer');
    if (!el) return;
    const obs = new MutationObserver(() => {
      if (el.classList.contains('open')) refresh();
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    if (el.classList.contains('open')) refresh();
    return () => obs.disconnect();
  }, [user]);

  useEffect(() => { if (user) refresh(); }, [user]);

  const handleLoad = async (map) => {
    try {
      // if discover preview only has metadata, fetch full
      let full = map;
      if (!map.geojson) {
        full = await getMap(map.id);
        full = full.map || full;
      }
      const gj = full.geojson || full;
      // use leaflet to add to map
      const layer = L.geoJSON(gj);
      layer.eachLayer(l => {
        // ensure style
        if (l.setStyle && full.title) {
          // keep original style if any
        }
        S.drawnItems.addLayer(l);
        if (l.feature) l.feature.properties = { ...(l.feature.properties||{}), name: full.title };
      });
      showToast(`Loaded “${full.title}”`);
      actions.closeDrawers();
      // fit bounds
      try { S.map.fitBounds(S.drawnItems.getBounds(), { padding:[30,30] }); } catch {}
    } catch (e) {
      showToast('Failed to load: ' + e.message);
    }
  };

  const handlePublishCurrent = async () => {
    if (!user) { showToast('Sign in to publish'); return; }
    if (S.drawnItems.getLayers().length===0) { showToast('Draw something first'); return; }
    const title = prompt('Creation title:', `My map ${new Date().toLocaleDateString()}`);
    if (!title) return;
    try {
      const gj = JSON.parse(liveGeoJSONString(false));
      // capture preview as data URL from map canvas
      let preview = null;
      try {
        const canvas = document.querySelector('#map canvas');
        if (canvas) preview = canvas.toDataURL('image/png');
      } catch {}
      await publishMap({ title, geojson: gj, isPublic: true, preview });
      showToast(`Published “${title}”`);
      refresh();
    } catch (e) {
      if (e.data?.error==='QUOTA_EXCEEDED' || e.message==='QUOTA_EXCEEDED') {
        showToast(`Quota exceeded: ${formatBytes(usage.usage)} / ${formatBytes(usage.quota)}`);
      } else showToast('Publish failed: '+e.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) { showToast('Sign in to upload'); e.target.value=''; return; }
    if (file.size > 1048576) { showToast('File too large — 1 MB quota'); e.target.value=''; return; }
    try {
      const text = await file.text();
      const gj = JSON.parse(text);
      const title = file.name.replace(/\.geojson$/i,'').replace(/\.json$/i,'');
      let preview = null;
      try { const canvas = document.querySelector('#map canvas'); if (canvas) preview = canvas.toDataURL('image/png'); } catch {}
      await publishMap({ title, geojson: gj, isPublic: false, preview });
      showToast(`Uploaded “${title}”`);
      refresh();
    } catch (err) {
      showToast('Upload failed: '+(err.message||'invalid GeoJSON'));
    } finally { e.target.value=''; }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this map?')) return;
    await deleteMap(id);
    showToast('Deleted');
    refresh();
  };

  const pct = quotaPercent(usage.usage);
  const isOver = usage.usage >= usage.quota;

  return (
    <div id="creations-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:top-20 lg:w-[420px] z-40 bg-slate-900/98 backdrop-blur-xl border border-slate-700/80 rounded-t-3xl lg:rounded-3xl p-5 max-h-[85vh] lg:max-h-none lg:h-auto overflow-y-auto flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200 flex items-center gap-2">
          <Icon name="compass" className="w-4 h-4 text-amber-400" /> Discover
          <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono">{discover.length + myMaps.length}</span>
        </h3>
        <button onClick={() => actions.closeDrawers()} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      {/* storage meter */}
      <div className="mb-3 bg-slate-800/80 rounded-2xl border border-slate-700/40 p-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5"><Icon name="hard-drive" className="w-3.5 h-3.5 text-emerald-400"/> Cloud storage</span>
          <span className={`text-[11px] font-mono ${isOver?'text-red-400':'text-slate-400'}`}>{formatBytes(usage.usage)} / {formatBytes(usage.quota)}</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full ${pct>90?'bg-red-500': pct>70?'bg-amber-500':'bg-emerald-500'} transition-all`} style={{width:`${pct}%`}} />
        </div>
        {!user && <p className="text-[11px] text-amber-300 mt-1.5">Sign in to use cloud storage</p>}
      </div>

      {/* tabs */}
      <div className="flex bg-slate-800 rounded-xl p-1 mb-3">
        <button onClick={()=>setTab('discover')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${tab==='discover'?'bg-slate-700 text-white':'text-slate-400'}`}>Discover</button>
        <button onClick={()=>setTab('my')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${tab==='my'?'bg-slate-700 text-white':'text-slate-400'}`}>My Maps</button>
      </div>

      {/* upload */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={handlePublishCurrent} className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5">
          <Icon name="map" className="w-4 h-4"/> Publish current
        </button>
        <button onClick={()=>fileRef.current?.click()} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5">
          <Icon name="upload" className="w-4 h-4"/> Upload .geojson
        </button>
        <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={handleFileUpload} />
      </div>

      {loading && <div className="text-center text-xs text-slate-500 py-4">Loading…</div>}

      {!loading && tab==='discover' && (
        <div className="grid grid-cols-1 gap-3 flex-1 overflow-y-auto">
          {discover.length===0 && <div className="text-[11px] text-slate-500 text-center py-6">No public maps yet — be the first to publish!</div>}
          {discover.map(m=>(
            <div key={m.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/60 overflow-hidden">
              <div className="h-32 bg-slate-800 grid place-items-center overflow-hidden">
                {m.preview ? <img src={m.preview} className="w-full h-full object-cover"/> : <div className="h-full w-full bg-gradient-to-br from-emerald-900/40 via-sky-900/30 to-amber-900/30 grid place-items-center"><Icon name="map" className="w-8 h-8 text-emerald-400/70"/></div>}
              </div>
              <div className="p-3.5">
                <div className="text-xs font-bold text-white truncate">{m.title}</div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5"> {m.author?.avatar && <img src={m.author.avatar} className="w-4 h-4 rounded-full"/>} by {m.author?.name||'unknown'} · {formatBytes(m.bytes||0)}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={()=>handleLoad(m)} className="flex-1 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white">Load</button>
                  <a href={`/api/maps/${m.id}`} target="_blank" className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white grid place-items-center"><Icon name="download" className="w-3.5 h-3.5"/></a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab==='my' && (
        <div className="grid grid-cols-1 gap-3 flex-1 overflow-y-auto">
          {!user && <div className="text-[11px] text-slate-500 text-center py-6">Sign in to see your maps<br/><button onClick={()=>actions.openAuthModal()} className="mt-2 text-sky-400 underline">Sign in</button></div>}
          {user && myMaps.length===0 && <div className="text-[11px] text-slate-500 text-center py-6">No maps yet — publish or upload one</div>}
          {myMaps.map(m=>(
            <div key={m.id} className="bg-slate-800/80 rounded-2xl border border-slate-700/60 overflow-hidden">
              <div className="h-28 bg-slate-800 grid place-items-center overflow-hidden">
                {m.preview ? <img src={m.preview} className="w-full h-full object-cover"/> : <Icon name="map" className="w-8 h-8 text-emerald-400/70"/>}
              </div>
              <div className="p-3.5">
                <div className="text-xs font-bold text-white truncate">{m.title}</div>
                <div className="text-[11px] text-slate-400">{new Date(m.createdAt).toLocaleDateString()} · {formatBytes(m.bytes||0)} · {m.isPublic?'Public':'Private'}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={()=>handleLoad(m)} className="flex-1 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white">Load</button>
                  <button onClick={()=>handleDelete(m.id)} className="px-3 py-2 rounded-xl bg-red-900/50 hover:bg-red-800 text-xs font-bold text-red-300"><Icon name="trash-2" className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
