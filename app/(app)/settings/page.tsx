'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import { getDefaultSpotSlippageBps, setDefaultSpotSlippageBps, subscribeSpotSlippage } from '../../lib/settings';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [slippagePercent, setSlippagePercent] = useState(() => getDefaultSpotSlippageBps() / 100);

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsubscribe = subscribeSpotSlippage((bps) => {
      setSlippagePercent(bps / 100);
    });
    return unsubscribe;
  }, []);

  const slippageDisplay = useMemo(() => {
    if (!Number.isFinite(slippagePercent)) return '0';
    return slippagePercent.toFixed(2).replace(/\.00$/, '');
  }, [slippagePercent]);

  const handleSlippageCommit = (value: number) => {
    const normalized = Number.isFinite(value) && value >= 0 ? value : 0;
    setSlippagePercent(normalized);
    const bps = Math.round(normalized * 100);
    setDefaultSpotSlippageBps(bps);
    toast({ message: t.settings.slippageSaved, variant: 'success' });
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <div className="p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">{t.nav.settings}</h1>
      {user && (
        <div className="space-y-1">
          <div className="text-sm opacity-80">{t.common.userId}</div>
          <div className="p-3 bg-white/5 rounded flex items-center justify-between">
            <span className="text-sm">{user.id}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(String(user.id));
                toast(t.common.copied);
              }}
              className="p-1 hover:text-white/80"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <div className="text-sm font-medium">{t.settings.spotSlippage.title}</div>
        <p className="text-xs opacity-70">{t.settings.spotSlippage.description}</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.1"
            value={slippageDisplay}
            onChange={(e) => {
              const value = Number.parseFloat(e.target.value);
              if (!Number.isNaN(value)) setSlippagePercent(value);
              else setSlippagePercent(0);
            }}
            onBlur={(e) => {
              const value = Number.parseFloat(e.target.value);
              handleSlippageCommit(Number.isFinite(value) ? value : 0);
            }}
            className="w-24 p-2 rounded bg-black/20 border border-white/20 text-sm"
          />
          <span className="text-sm">%</span>
          <button
            className="px-3 py-1 bg-white/10 rounded text-xs"
            onClick={() => handleSlippageCommit(getDefaultSpotSlippageBps() / 100)}
          >
            {t.settings.spotSlippage.reset}
          </button>
        </div>
      </div>
      <div>
        <button
          className="px-3 py-1 bg-gray-100 text-black rounded"
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
        >
          {lang === 'en' ? 'العربية' : 'English'}
        </button>
      </div>
      <button
        className="px-3 py-1 bg-white/5 rounded"
        onClick={handleLogout}
      >
        {t.nav.logout}
      </button>
    </div>
  );
}
