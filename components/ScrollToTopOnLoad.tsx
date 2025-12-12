'use client';

import { useEffect } from 'react';

export default function ScrollToTopOnLoad() {
  useEffect(() => {
    const { history } = window;
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, behavior: 'auto' });

    return () => {
      history.scrollRestoration = previousRestoration || 'auto';
    };
  }, []);

  return null;
}
