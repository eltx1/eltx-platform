import './globals.css';
import { LangProvider } from './lib/i18n';
import { ToastProvider } from './lib/toast';
import { AuthProvider } from './lib/auth';
import NavBar from '../components/layout/NavBar';

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
              <NavBar />
              {children}
            </ToastProvider>
          </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
