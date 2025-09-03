'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { dict, useLang } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { Wallet, ReceiptText, HelpCircle, Settings, Handshake } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  const cards = [
    { id: 'wallet', title: t.dashboard.cards.wallet.title, subtitle: t.dashboard.cards.wallet.subtitle, icon: Wallet, route: '/wallet', status: 'active' },
    { id: 'transactions', title: t.dashboard.cards.transactions.title, subtitle: t.dashboard.cards.transactions.subtitle, icon: ReceiptText, route: '/transactions', status: 'active' },
    { id: 'faq', title: t.dashboard.cards.faq.title, subtitle: t.dashboard.cards.faq.subtitle, icon: HelpCircle, route: '/faq', status: 'active' },
    { id: 'settings', title: t.dashboard.cards.settings.title, subtitle: t.dashboard.cards.settings.subtitle, icon: Settings, route: '/settings', status: 'active' },
    { id: 'partners', title: t.dashboard.cards.partners.title, subtitle: t.dashboard.cards.partners.subtitle, icon: Handshake, route: '/partners', status: 'soon' },
  ];

  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.dashboard.title}</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return c.status === 'active' ? (
            <Link
              key={c.id}
              href={c.route}
              className="p-4 bg-white/5 rounded hover:bg-white/10 flex flex-col items-center text-center"
            >
              <Icon className="mb-2" />
              <div className="font-semibold">{c.title}</div>
              {c.subtitle && <div className="text-xs opacity-70">{c.subtitle}</div>}
            </Link>
          ) : (
            <div
              key={c.id}
              className="p-4 bg-white/5 rounded text-center opacity-50 cursor-not-allowed"
              title={t.common.soon}
            >
              <Icon className="mx-auto mb-2" />
              <div className="font-semibold">{c.title}</div>
              {c.subtitle && <div className="text-xs opacity-70">{c.subtitle}</div>}
              <div className="text-xs mt-1">{t.common.soon}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
