'use client';

import { dict, useLang } from '../lib/i18n';

export default function AboutPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const content = {
    en: [
      'ELTX is a utility token platform enabling secure and low-cost transfers on the BNB Smart Chain. Designed for governments, enterprises, and everyday users, ELTX simplifies blockchain integration for real-world services.',
      'Our mission is to provide reliable infrastructure and user-friendly tools so that institutions and individuals can interact with digital assets confidently.',
      'The platform leverages audited smart contracts and decentralized architecture to deliver transparency, speed, and scalability.',
    ],
    ar: [
      'ELTX هي منصة توكن خدمي تمكّنك من إجراء تحويلات آمنة ومنخفضة التكلفة على شبكة بينانس الذكية. تم تصميمها لخدمة الحكومات والشركات والمستخدمين الأفراد، مما يجعل دمج البلوك تشين في الخدمات اليومية أمرًا بسيطًا.',
      'هدفنا هو توفير بنية موثوقة وأدوات سهلة الاستخدام حتى يتمكن المؤسسات والأفراد من التعامل مع الأصول الرقمية بثقة.',
      'تعتمد المنصة على عقود ذكية خضعت للتدقيق وهيكلية لامركزية لتقديم الشفافية والسرعة وقابلية التوسع.',
    ],
  } as const;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.about}</h1>
      {content[lang].map((p, i) => (
        <p key={i} className="opacity-80 text-sm">
          {p}
        </p>
      ))}
    </div>
  );
}
