import { useEffect, useState } from 'react';
import { Icon } from '../../lib/icons';
import { CHANGELOG, fetchChangelog } from '../../lib/changelog';
import actions from '../../engine/actions';

export function ChangelogDrawer() {
  const [log, setLog] = useState(CHANGELOG);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (import.meta.env.MODE !== 'test') fetchChangelog().then(setLog).catch(()=>{});
    const el = document.getElementById('changelog-drawer');
    if (!el) return;
    const obs = new MutationObserver(() => setOpen(el.classList.contains('open')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return (
    <div id="changelog-drawer" className="sheet-drawer fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200 flex items-center gap-2">
          <Icon name="scroll-text" className="w-4 h-4 text-sky-400" /> Changelog
        </h3>
        <button onClick={() => actions.closeDrawers()} className="text-slate-400 hover:text-white p-1">
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-4">
        {log.map(entry => (
          <div key={entry.version} className="bg-slate-800/60 rounded-2xl border border-slate-700/40 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-emerald-400">{entry.version}</span>
              <span className="text-[11px] text-slate-500">{entry.date}</span>
              <span className="ml-auto text-xs font-bold text-white">{entry.title}</span>
            </div>
            <ul className="list-disc list-inside text-[12px] text-slate-300 space-y-0.5">
              {entry.changes.map((c,i)=><li key={i}>{c}</li>)}
            </ul>
          </div>
        ))}
        <a href="https://github.com/AnhQuan15032/Geojson-maker/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer" className="text-[11px] text-sky-400 hover:underline">View on GitHub →</a>
      </div>
    </div>
  );
}
