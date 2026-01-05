import AppBottomNav from '../../components/layout/AppBottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_20%_20%,rgba(129,140,248,0.08),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(192,132,252,0.08),transparent_32%)]">
      <div className="container mx-auto px-3 sm:px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+140px)]">{children}</div>
      <AppBottomNav />
    </div>
  );
}
