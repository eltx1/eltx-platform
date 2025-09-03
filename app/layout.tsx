import './globals.css';
import Header from './(site)/components/Header';
import { LangProvider } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { AuthProvider } from './lib/auth';

export const metadata = {
  title: 'ELTX — Next',
  description: 'ELTX utility token site (Next.js)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden">
        <LangProvider>
          <AuthProvider>
            <ToastProvider>
              <Header />
              {children}
            </ToastProvider>
          </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
