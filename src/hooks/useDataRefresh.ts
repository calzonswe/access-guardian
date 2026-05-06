import { useEffect, useState, useCallback } from 'react';
import * as store from '@/services/dataStore';

/**
 * Hook that ensures data store is fresh when a page mounts.
 * Returns { loading, reload } for triggering re-renders after mutations.
 */
export function useDataRefresh() {
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await store.initPromise;
      await store.refreshAll();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const reload = useCallback(async () => {
    await store.refreshAll();
    setTick(t => t + 1);
  }, []);

  return { loading, reload };
}
