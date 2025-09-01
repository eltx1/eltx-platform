import './globals.css';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata = {
  title: 'ELTX — Next',
  description: 'ELTX utility token site (Next.js)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
