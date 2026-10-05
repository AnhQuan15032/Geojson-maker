
export function Toast() {
  return (
    <div id="toast" role="status" aria-live="polite" className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-slate-700 text-slate-200 text-xs px-4 py-2 rounded-full shadow-2xl transition-all duration-300 opacity-0 pointer-events-none transform -translate-y-2">
      {' Notification '}
    </div>
  );
}
