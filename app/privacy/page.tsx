'use client';

import { dict, useLang } from '../lib/i18n';

export default function PrivacyPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const content = {
    en: [
      'ELTX collects minimal personal information such as email addresses to operate the service.',
      'Data is used only to provide and secure the platform and is never sold to third parties.',
      'We apply industry-standard security measures to protect your information. Contact us with any privacy concerns.',
    ],
    ar: [
      'تجمع ELTX أقل قدر ممكن من المعلومات الشخصية مثل عناوين البريد الإلكتروني لتشغيل الخدمة.',
      'يتم استخدام البيانات فقط لتقديم المنصة وتأمينها ولن تُباع لأي طرف ثالث.',
      'نطبق تدابير أمان وفق المعايير الصناعية لحماية معلوماتك. تواصل معنا لأي استفسار يتعلق بالخصوصية.',
    ],
  } as const;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.privacy}</h1>
      {content[lang].map((p, i) => (
        <p key={i} className="opacity-80 text-sm">
          {p}
        </p>
      ))}
    </div>
  );
}
