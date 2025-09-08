'use client';

import { useEffect } from 'react';
import { useToast } from '../app/lib/toast';

export default function ServiceWorkerManager() {
  const toast = useToast();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        const notify = () => {
          toast('New version available, reloading...');
          reg.waiting?.postMessage('skipWaiting');
        };
        if (reg.waiting) notify();
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (nw) {
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                notify();
              }
            });
          }
        });
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, [toast]);

  return null;
}
