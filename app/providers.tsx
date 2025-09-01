'use client';
import type { ReactNode } from 'react';
import { LangProvider } from './(site)/i18n';

export function Providers({ children }: { children: ReactNode }) {
  return <LangProvider>{children}</LangProvider>;
}
