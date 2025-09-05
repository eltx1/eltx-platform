'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { Wallet, ReceiptText, CreditCard, HelpCircle, Settings, PiggyBank } from 'lucide-react';
import SectionCard from '../../../components/dashboard/SectionCard';
import AICard from '../../../components/dashboard/AICard';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="p-4 rounded-2xl bg-white/5 flex items-center justify-between">
        <div>
          <div className="text-sm opacity-80">ELTX Balance</div>
          <div className="text-2xl font-bold">0</div>
        </div>
        <a href="/wallet" className="btn btn-primary">Deposit</a>
      </div>
      <AICard />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SectionCard title="Wallet" href="/wallet" icon={Wallet} />
        <SectionCard title="Transactions" href="/transactions" icon={ReceiptText} />
        <SectionCard title="Pay" href="/pay" icon={CreditCard} />
        <SectionCard title="Earn" href="/earn" icon={PiggyBank} badge="New" />
        <SectionCard title="Settings" href="/settings" icon={Settings} />
        <SectionCard title="FAQ" href="/faq" icon={HelpCircle} />
      </div>
    </div>
  );
}

