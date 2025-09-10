'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const t = dict[lang];
  const toast = useToast();

  useEffect(() => {
    if (user === null) router.replace('/login');
  }, [user, router]);

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
