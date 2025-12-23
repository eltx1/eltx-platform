import 'server-only';
import './globals.css';
import type { Metadata } from 'next';
import { LangProvider } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { AuthProvider } from './lib/auth';
import NavBar from '../components/layout/NavBar';
import Footer from '../components/layout/Footer';
import ServiceWorkerManager from '../components/ServiceWorkerManager';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eltx.io';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ELTX | Crypto Trading Platform & Web3 Exchange',
    template: '%s | ELTX',
  },
  description:
    'Trade ELTX and leading cryptocurrencies with fast on-chain settlement, secure wallets, and bilingual support for English and Arabic users.',
  keywords: [
    'ELTX exchange',
    'crypto trading platform',
    'buy ELTX token',
    'spot trading',
    'P2P crypto marketplace',
    'web3 wallet',
    'staking',
    'DeFi gateway',
    'منصة تداول كريبتو',
    'شراء وبيع العملات الرقمية',
  ],
  openGraph: {
    title: 'ELTX | Crypto Trading Platform & Web3 Exchange',
    description:
      'Start trading and investing in ELTX with secure wallets, instant swaps, and Arabic/English support built for crypto users everywhere.',
    url: siteUrl,
    siteName: 'ELTX',
    locale: 'en_US',
    type: 'website',
  },
  alternates: {
    canonical: siteUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col overflow-x-hidden bg-neutral-950 text-white">
        <LangProvider>
          <AuthProvider>
            <ToastProvider>
              <ServiceWorkerManager />
              <NavBar />
              <main className="flex-1">{children}</main>
              <Footer />
            </ToastProvider>
          </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
