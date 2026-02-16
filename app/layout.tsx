import 'server-only';
import './globals.css';
import type { Metadata } from 'next';
import { LangProvider } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { AuthProvider } from './lib/auth';
import NavBar from '../components/layout/NavBar';
import Footer from '../components/layout/Footer';
import ServiceWorkerManager from '../components/ServiceWorkerManager';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lordai.net';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'LordAi.Net | AI Web3 Social Media Network',
    template: '%s | LordAi.Net',
  },
  description:
    'LordAi.Net is an AI-powered social media network for Web3 communities with trading, staking, payments, and bilingual English/Arabic experiences.',
  keywords: [
    'LordAi.Net',
    'AI social media network',
    'Web3 social platform',
    'crypto trading platform',
    'spot trading',
    'P2P crypto marketplace',
    'web3 wallet',
    'staking',
    'DeFi gateway',
    'منصة سوشيال ميديا Web3',
    'منصة تداول كريبتو',
  ],
  openGraph: {
    title: 'LordAi.Net | AI Web3 Social Media Network',
    description:
      'Share, chat, and earn on LordAi.Net with AI-powered social features, plus secure trading, staking, and payments.',
    url: siteUrl,
    siteName: 'LordAi.Net',
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
