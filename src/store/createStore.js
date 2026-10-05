// A tiny observable object store.
//
// The engine writes to it with plain assignment (`S.map = ...`) exactly as it
// wrote to bare `let` bindings before; the Proxy turns each of those writes
// into a notification so React can re-render. Writes are coalesced into one
// notification per microtask, because a single user action routinely touches
// several fields at once.

export function createStore(initialState) {
  const listeners = new Set();
  const target = { ...initialState };
  let version = 0;
  let queued = false;

  const notify = () => {
    version++;
    // iterate over a copy: a listener may unsubscribe during notification
    for (const listener of [...listeners]) listener();
  };

  const scheduleNotify = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      notify();
    });
  };

  const store = new Proxy(target, {
    set(obj, key, value) {
      if (Object.is(obj[key], value)) return true;
      obj[key] = value;
      scheduleNotify();
      return true;
    },
    deleteProperty(obj, key) {
      if (!(key in obj)) return true;
      delete obj[key];
      scheduleNotify();
      return true;
    },
  });

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getVersion = () => version;

  return { store, subscribe, getVersion, notify };
}
