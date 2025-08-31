import './globals.css';

export const metadata = {
  title: 'ELTX — Next',
  description: 'ELTX utility token site (Next.js)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
