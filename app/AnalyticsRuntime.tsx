'use client';

import { useMemo, useState } from 'react';
import { dict, useLang } from './lib/i18n';
import { getAnalyticsSettings, getConsentState, setConsentState } from './lib/analytics';

export default function AnalyticsRuntime() {
  const settings = useMemo(() => getAnalyticsSettings(), []);
  const { lang } = useLang();
  const t = dict[lang];
  const [consent, setConsent] = useState<'granted' | 'denied' | null>(() => getConsentState());

  if (!settings?.enabled || !settings.consentModeEnabled || consent) return null;

  const accept = () => {
    setConsentState('granted');
    setConsent('granted');
  };

  const reject = () => {
    setConsentState('denied');
    setConsent('denied');
  };

  const title = lang === 'ar' ? 'إعدادات ملفات الارتباط' : 'Cookie consent';
  const body =
    lang === 'ar'
      ? 'نستخدم كوكيز التحليلات والإعلانات لتحسين الأداء وقياس الحملات. يمكنك القبول أو الرفض.'
      : 'We use analytics and ads cookies to measure campaign performance and improve product quality. You can accept or reject.';

  return (
    <div className="fixed inset-x-4 bottom-4 z-[100] rounded-xl border border-white/20 bg-neutral-900/95 p-4 shadow-2xl backdrop-blur">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs text-white/70">{body}</p>
      <div className="mt-3 flex gap-2">
        <button className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black" onClick={accept}>
          {lang === 'ar' ? 'موافقة' : 'Accept'}
        </button>
        <button className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white" onClick={reject}>
          {lang === 'ar' ? 'رفض' : 'Reject'}
        </button>
      </div>
    </div>
  );
}
