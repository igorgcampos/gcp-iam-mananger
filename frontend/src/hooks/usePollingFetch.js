import { useState, useEffect, useCallback, useRef } from 'react';

export function usePollingFetch(fetchFn, { interval = 30_000, onError = () => {}, enabled = true } = {}) {
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await fetchRef.current();
      setLastUpdated(new Date());
    } catch (err) {
      onErrorRef.current(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const id = setInterval(() => load(true), intervalRef.current);
    return () => clearInterval(id);
  }, [load, enabled]);

  return { loading, lastUpdated, reload: load };
}
