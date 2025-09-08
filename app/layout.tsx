import './globals.css';
import { LangProvider } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { AuthProvider } from './lib/auth';
import NavBar from '../components/layout/NavBar';
import Footer from '../components/layout/Footer';
import ServiceWorkerManager from '../components/ServiceWorkerManager';

export const metadata = {
  title: 'ELTX — Next',
  description: 'ELTX utility token site (Next.js)',
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
