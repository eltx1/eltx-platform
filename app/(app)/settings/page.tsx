'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useLang();
  const t = dict[lang];

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
