'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';
import { useAuth } from './auth';

type MessageThread = {
  id: number;
  unread_count: number;
};

const STORAGE_KEY = 'eltx:messages:unread-total';

function wsBaseFromApiBase(apiBase?: string) {
  if (!apiBase) return 'ws://localhost:4000';
  if (apiBase.startsWith('https://')) return apiBase.replace('https://', 'wss://');
  if (apiBase.startsWith('http://')) return apiBase.replace('http://', 'ws://');
  return apiBase;
}

function sumUnread(threads: MessageThread[] = []) {
  return threads.reduce((total, thread) => total + Number(thread.unread_count || 0), 0);
}

export function writeUnreadTotal(total: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, String(Math.max(0, total || 0)));
  window.dispatchEvent(new Event('message-unread-updated'));
}

export function useMessageUnread() {
  const { user } = useAuth();
  const [unreadTotal, setUnreadTotal] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromStorage = Number(window.localStorage.getItem(STORAGE_KEY) || '0');
    setUnreadTotal(Number.isFinite(fromStorage) ? Math.max(0, fromStorage) : 0);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setUnreadTotal(0);
      writeUnreadTotal(0);
      return;
    }

    let cancelled = false;

    const syncUnread = async () => {
      const res = await apiFetch<{ threads: MessageThread[] }>('/messages/inbox');
      if (!res.ok || cancelled) return;
      const total = sumUnread(res.data.threads || []);
      setUnreadTotal(total);
      writeUnreadTotal(total);
    };

    syncUnread();

    const base = wsBaseFromApiBase(process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000');
    const socket = new WebSocket(`${base}/messages/ws`);
    socket.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data || '{}');
        if (packet?.type === 'message:new' || packet?.type === 'message:request' || packet?.type === 'message:request:update') {
          syncUnread();
        }
      } catch {
        // ignore malformed packets
      }
    };

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => {
      const next = Number(window.localStorage.getItem(STORAGE_KEY) || '0');
      setUnreadTotal(Number.isFinite(next) ? Math.max(0, next) : 0);
    };

    window.addEventListener('storage', handleUpdate);
    window.addEventListener('message-unread-updated', handleUpdate);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('message-unread-updated', handleUpdate);
    };
  }, []);

  return useMemo(() => ({ unreadTotal, hasUnread: unreadTotal > 0 }), [unreadTotal]);
}
