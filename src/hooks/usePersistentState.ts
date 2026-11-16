import { useEffect, useState } from 'react';

/**
 * useState that survives navigation within the browser tab (sessionStorage).
 * Used for list filters so they are still set when the user comes back.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const storageKey = `ag:filter:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* private mode */ }
  }, [storageKey, value]);
  return [value, setValue];
}
