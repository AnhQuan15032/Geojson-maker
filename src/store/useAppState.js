import { useCallback, useRef, useSyncExternalStore } from 'react';
import { S, subscribe, getVersion } from '../engine/state.js';

/**
 * Re-render the calling component whenever any engine state field changes.
 * Use this when a component reads several fields at once; the snapshot is a
 * plain counter, so it can never tear or loop.
 */
export function useEngineVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/**
 * Re-render only when the selected field actually changes.
 * `select` must return a primitive (or a referentially stable value) —
 * returning a fresh object each call would make React re-render forever.
 */
export function useEngineValue(select) {
  const selectRef = useRef(select);
  selectRef.current = select;
  const cache = useRef({ value: undefined, version: -1 });

  const getSnapshot = useCallback(() => {
    const version = getVersion();
    if (version !== cache.current.version) {
      const next = selectRef.current(S);
      if (!Object.is(next, cache.current.value)) cache.current.value = next;
      cache.current.version = version;
    }
    return cache.current.value;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
