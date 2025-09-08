'use client';

import { useEffect } from 'react';
export default function ServiceWorkerManager() {

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        const notify = () => {
          if (confirm('New version available. Reload now?')) {
            reg.waiting?.postMessage('skipWaiting');
          }
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
  }, []);

  return null;
}
