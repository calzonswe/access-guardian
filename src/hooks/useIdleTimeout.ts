import { useEffect, useRef } from 'react';

/**
 * Calls onIdle after `timeoutMinutes` of inactivity (no user input events).
 * Pass enabled=false (or timeoutMinutes<=0) to disable the timer.
 */
export function useIdleTimeout(enabled: boolean, timeoutMinutes: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || !timeoutMinutes || timeoutMinutes <= 0) return;
    const ms = timeoutMinutes * 60 * 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), ms);
    };

    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange',
    ];
    for (const ev of events) window.addEventListener(ev, reset, { passive: true });
    reset();
    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, reset);
    };
  }, [enabled, timeoutMinutes]);
}
