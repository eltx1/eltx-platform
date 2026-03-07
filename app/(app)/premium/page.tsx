'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { apiFetch } from '../../lib/api';

type PremiumStatus = {
  is_premium: boolean;
  premium_expires_at: string | null;
  monthly_price_usdt: number;
};

export default function PremiumPage() {
  const { user, refresh } = useAuth();
  const { lang } = useLang();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<PremiumStatus | null>(null);

  const labels = useMemo(
    () =>
      lang === 'ar'
        ? {
            title: 'عضوية البريميم الفيريفايد',
            subtitle: 'اشتراك شهري 1 USDT.',
            active: 'أنت مشترك بريميم ✅',
            inactive: 'أنت عضو عادي حاليًا.',
            expires: 'تاريخ انتهاء الاشتراك',
            price: 'السعر الشهري الحالي',
            subscribe: 'اشترك الآن',
            subscribing: 'جاري الاشتراك...',
            success: 'تم تفعيل عضوية البريميم بنجاح.',
            fail: 'فشل الاشتراك. اتأكد إن رصيد USDT كافي.',
            walletHint: 'الخصم يتم مباشرة من رصيد USDT في محفظتك.',
            perks: 'المميزات: أولوية ظهور بوستاتك وتعليقاتك في For You.',
          }
        : {
            title: 'Premium Verified Membership',
            subtitle: 'Monthly subscription is 1 USDT.',
            active: 'You are a premium member ✅',
            inactive: 'You are currently a regular member.',
            expires: 'Subscription expiry',
            price: 'Current monthly price',
            subscribe: 'Subscribe now',
            subscribing: 'Subscribing...',
            success: 'Premium membership activated successfully.',
            fail: 'Subscription failed. Make sure your USDT balance is enough.',
            walletHint: 'Charge is deducted directly from your USDT wallet balance.',
            perks: 'Benefits: your posts and comments get priority in For You feed.',
          },
    [lang]
  );

  const loadStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const res = await apiFetch<{ ok: boolean; status: PremiumStatus }>('/premium/status');
    if (res.ok && res.data?.status) {
      setStatus(res.data.status);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const subscribe = async () => {
    setSaving(true);
    const res = await apiFetch('/premium/subscribe', { method: 'POST', body: JSON.stringify({ months: 1 }) });
    setSaving(false);
    if (!res.ok) {
      toast(labels.fail);
      return;
    }
    toast(labels.success);
    await Promise.all([loadStatus(), refresh()]);
  };

  if (!user) return null;

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-3xl">
      <section className="x-card space-y-3 p-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-sky-400" /> {labels.title}</h1>
        <p className="text-sm text-white/70">{labels.subtitle}</p>
        {loading || !status ? (
          <p className="text-sm text-white/60">...</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className={status.is_premium ? 'text-emerald-300' : 'text-white/70'}>{status.is_premium ? labels.active : labels.inactive}</p>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
              <p><span className="text-white/60">{labels.price}:</span> <span className="font-semibold">{status.monthly_price_usdt} USDT / month</span></p>
              <p><span className="text-white/60">{labels.expires}:</span> <span className="font-semibold">{status.premium_expires_at ? new Date(status.premium_expires_at).toLocaleString() : '-'}</span></p>
            </div>
            <div className="rounded-2xl border border-[#c9a75c]/30 bg-[#c9a75c]/10 p-3 text-xs text-[#f4deae] flex items-center gap-2">
              <Wallet className="h-4 w-4" /> {labels.walletHint}
            </div>
            <p className="text-xs text-white/60">{labels.perks}</p>
            {!status.is_premium && (
              <button className="btn btn-primary px-4 py-2 text-xs" disabled={saving} onClick={subscribe}>
                {saving ? labels.subscribing : labels.subscribe}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
