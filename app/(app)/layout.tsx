import AppBottomNav from '../../components/layout/AppBottomNav';
import AppShell from '../../components/layout/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <AppBottomNav />
    </>
  );
}
