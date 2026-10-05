// src/lib/hooks/useHeartbeat.ts
// Phase 3: Client-side heartbeat hook for Sales employees.
// Sends a heartbeat every 2 minutes to indicate availability.
// Pauses when the tab is hidden or the browser is offline.
'use client';

import { useEffect, useRef, useCallback } from 'react';

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface UseHeartbeatOptions {
  /** Whether the current user should send heartbeats (e.g. is a Sales employee) */
  enabled: boolean;
}

export function useHeartbeat({ enabled }: UseHeartbeatOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    try {
      const response = await fetch('/api/heartbeat', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        console.warn('[Heartbeat] Failed:', response.status);
      }
    } catch (err) {
      // Network errors are expected when offline; silently ignore
      console.warn('[Heartbeat] Network error:', err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Send initial heartbeat immediately
    sendHeartbeat();

    // Set up interval
    intervalRef.current = setInterval(() => {
      // Only send if tab is visible and browser is online
      if (document.visibilityState === 'visible' && navigator.onLine) {
        sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Handle visibility change: send heartbeat when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        sendHeartbeat();
      }
    };

    // Handle online/offline events
    const handleOnline = () => {
      sendHeartbeat();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, sendHeartbeat]);
}
