'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { getApiBaseForBrowser } from './lib/api-base';

const STORAGE_KEY = 'eltx.activity.session';

function getOrCreateSessionId() {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing && existing.length >= 8) return existing;
  const created = `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(STORAGE_KEY, created);
  return created;
}

async function sendActivity(payload: { session_id: string; path: string; event: 'page_view' | 'heartbeat' }) {
  try {
    const base = getApiBaseForBrowser();
    await fetch(`${base}/activity/heartbeat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // best effort telemetry
  }
}

export default function ActivityTracker() {
  const pathname = usePathname();
  const sessionId = useMemo(() => getOrCreateSessionId(), []);

  useEffect(() => {
    if (!sessionId || !pathname) return;
    sendActivity({ session_id: sessionId, path: pathname, event: 'page_view' });

    const heartbeat = window.setInterval(() => {
      sendActivity({ session_id: sessionId, path: pathname, event: 'heartbeat' });
    }, 60_000);

    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        sendActivity({ session_id: sessionId, path: pathname, event: 'heartbeat' });
      }
    };

    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [pathname, sessionId]);

  return null;
}
