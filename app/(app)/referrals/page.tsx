'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, Link2, UserPlus } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { dict, useLang } from '../../lib/i18n';

type ReferralRow = {
  referred_user_id: number;
  username: string;
  email: string;
  created_at: string;
  has_purchase: boolean;
  reward_eltx: string;
  rewarded_at: string | null;
};

type ReferralSummary = {
  code: string;
  stats: {
    invited: number;
    purchases: number;
    rewards_eltx: string;
  };
  referrals: ReferralRow[];
};

export default function ReferralsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];

  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      router.replace('/login');
      return;
    }
    setOrigin(window.location.origin);
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<ReferralSummary>('/referrals/summary');
    if (res.ok) {
      setSummary(res.data);
    } else {
      setSummary(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      load();
    }
  }, [user, load]);

  const referralLink = useMemo(() => {
    if (!summary?.code || !origin) return '';
    return `${origin}/signup?ref=${summary.code}`;
  }, [origin, summary?.code]);

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const stats = summary?.stats;
  const referrals = summary?.referrals || [];

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-white/60">{t.referrals.title}</p>
        <h1 className="text-2xl font-semibold">{t.referrals.title}</h1>
        <p className="text-sm text-white/60">{t.referrals.subtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase text-white/60">{t.referrals.stats.invited}</p>
          <p className="mt-2 text-2xl font-semibold">{loading ? '...' : stats?.invited ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase text-white/60">{t.referrals.stats.purchases}</p>
          <p className="mt-2 text-2xl font-semibold">{loading ? '...' : stats?.purchases ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase text-white/60">{t.referrals.stats.rewards}</p>
          <p className="mt-2 text-2xl font-semibold">{loading ? '...' : `${stats?.rewards_eltx ?? '0'} ELTX`}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Link2 className="h-4 w-4" />
          {t.referrals.link.label}
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={referralLink}
            readOnly
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t.referrals.link.copied : t.referrals.link.copy}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <UserPlus className="h-4 w-4" />
          {t.referrals.list.title}
        </div>
        <div className="mt-4 space-y-3">
          {loading && <p className="text-sm text-white/60">{t.referrals.list.loading}</p>}
          {!loading && referrals.length === 0 && <p className="text-sm text-white/60">{t.referrals.list.empty}</p>}
          {!loading &&
            referrals.map((referral) => {
              const statusText = referral.has_purchase ? t.referrals.list.purchased : t.referrals.list.pending;
              return (
                <div
                  key={referral.referred_user_id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-white/90">{referral.username || referral.email}</p>
                    <p className="text-xs text-white/50">{t.referrals.list.registered}: {new Date(referral.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-sm text-white/70">{statusText}</div>
                  <div className="text-sm font-semibold text-emerald-200">
                    {referral.reward_eltx || '0'} ELTX
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
