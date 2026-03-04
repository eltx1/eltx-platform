'use client';

import { useEffect } from 'react';
import { captureFirstUtmFromLocation } from './lib/utm';

export default function UtmBootstrap() {
  useEffect(() => {
    captureFirstUtmFromLocation();
  }, []);

  return null;
}
