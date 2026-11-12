import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface AsyncResult<T> {
  readonly data: T | null;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * A tiny data-fetching hook: run `load` when `deps` change, ignore the result of a superseded
 * request, and expose a manual reload. A render-time race in the old shell — clicking a tab
 * twice fast — could show the slower response; the `cancelled` flag prevents that.
 *
 * `load` must be stable (a module function or a `useCallback`), or this refetches every render.
 * It may return `null` for "nothing to fetch yet" — the hook then reports `data: null` and
 * stays idle rather than calling into a loader that has no valid arguments.
 */
export function useAsync<T>(load: () => Promise<T> | null, deps: DependencyList): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    const promise = loadRef.current();
    if (promise === null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    promise.then(
      (result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(caught);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's contract
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, reload };
}
