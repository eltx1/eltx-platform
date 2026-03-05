'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
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
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteAccount = async () => {
    if (!deletePassword || isDeleting) return;
    setIsDeleting(true);
    const res = await apiFetch('/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password: deletePassword }),
    });
    setIsDeleting(false);

    if (!res.ok) {
      const isPasswordError = res.status === 401;
      toast({
        message: isPasswordError ? t.settings.accountDeletion.invalidPassword : (res.error || t.common.genericError),
        variant: 'error',
      });
      return;
    }

    toast({ message: t.settings.accountDeletion.success, variant: 'success' });
    setDeletePassword('');
    setShowDeleteConfirm(false);
    await logout();
    router.push('/login');
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
      <div className="mt-8 rounded-lg border border-red-500/40 bg-red-500/5 p-4 space-y-3">
        <div className="text-sm font-semibold text-red-300">{t.settings.accountDeletion.title}</div>
        <p className="text-xs text-red-100/80">{t.settings.accountDeletion.description}</p>
        {!showDeleteConfirm && (
          <button
            className="px-3 py-2 rounded bg-red-500/20 text-red-200 border border-red-500/40 text-sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t.settings.accountDeletion.startButton}
          </button>
        )}

        {showDeleteConfirm && (
          <div className="space-y-3 rounded-md border border-red-500/40 bg-black/20 p-3">
            <p className="text-xs text-red-200">{t.settings.accountDeletion.warning}</p>
            <label className="space-y-1 block">
              <span className="text-xs opacity-80">{t.settings.accountDeletion.passwordLabel}</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t.settings.accountDeletion.passwordPlaceholder}
                className="w-full p-2 rounded bg-black/30 border border-white/20 text-sm"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded bg-red-600 text-white text-sm disabled:opacity-60"
                disabled={!deletePassword || isDeleting}
                onClick={handleDeleteAccount}
              >
                {isDeleting ? '...' : t.settings.accountDeletion.confirmButton}
              </button>
              <button
                className="px-3 py-2 rounded bg-white/10 text-sm"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                }}
              >
                {t.settings.accountDeletion.cancelButton}
              </button>
            </div>
          </div>
        )}
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
