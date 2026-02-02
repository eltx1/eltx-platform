'use client';

import { dict, useLang } from '../lib/i18n';
import type { ReactNode } from 'react';

export default function AboutPage() {
  const { lang } = useLang();
  const t = dict[lang];
  const content: Record<'en' | 'ar', ReactNode> = {
    en: (
      <>
        <p className="opacity-80 text-sm">LordAi.Net — AI Web3 social media platform</p>
        <p className="opacity-80 text-sm">
          LordAi.Net is a social-first Web3 platform that blends posts, chat, and creator earnings with trading, staking, and
          secure wallet services across supported blockchains (currently BNB Smart Chain, with Ethereum and Solana coming soon).
          We combine a clean user experience with rigorous, auditable accounting behind the scenes.
        </p>
        <h2 className="font-medium mt-4">What we do</h2>
        <ul className="list-disc pl-4 space-y-2">
          <li>
            <p className="font-medium">Unified Wallet Experience</p>
            <p className="opacity-80 text-sm">
              Each user receives a unique deposit address. Our sweeper securely consolidates balances into platform vaults
              (hot/cold) to reduce address risk while keeping precise deposit records and real-time balances.
            </p>
          </li>
          <li>
            <p className="font-medium">Multi-asset Support</p>
            <p className="opacity-80 text-sm">
              Native coins (e.g., BNB) and standard tokens (e.g., USDT/USDC), with transparent gas and service fees.
            </p>
          </li>
          <li>
            <p className="font-medium">Real-time Dashboard</p>
            <p className="opacity-80 text-sm">
              Instant visibility into deposits, balances, and transaction status—plus alerts for important events.
            </p>
          </li>
          <li>
            <p className="font-medium">Built to Grow</p>
            <p className="opacity-80 text-sm">
              A modular architecture (per-chain adapters) to add networks and features quickly, including future Earn/Rewards
              with clear risk controls.
            </p>
          </li>
        </ul>
        <h2 className="font-medium mt-4">How we protect users</h2>
        <ul className="list-disc pl-4 space-y-2">
          <li className="opacity-80 text-sm">
            Custodial security with treasury management, withdrawal limits, and monitored signing policies.
          </li>
          <li className="opacity-80 text-sm">Atomic accounting so deposits and balance updates always match.</li>
          <li className="opacity-80 text-sm">
            Fraud and risk monitoring with automated rules and manual review where needed.
          </li>
          <li className="opacity-80 text-sm">Transparency on fees and status at every step.</li>
        </ul>
        <p className="opacity-80 text-sm">Get in touch: info.eltx@gmail.com</p>
        <p className="opacity-80 text-sm">Legal entity: EliteX Agency LTD - United Kingdom</p>
      </>
    ),
    ar: (
      <>
        <p className="opacity-80 text-sm">LordAi.Net — منصة سوشيال ميديا Web3 بالذكاء الاصطناعي</p>
        <p className="opacity-80 text-sm">
          LordAi.Net منصة سوشيال Web3 بتركّز على البوستات والدردشة وربح المحتوى، ومعاها خدمات تداول واستاكينج ومحافظ آمنة عبر
          سلاسل البلوكشين المدعومة (حاليًا شبكة BNB الذكية مع إضافة إيثريوم وسولانا قريبًا). ندمج تجربة مستخدم بسيطة مع محاسبة
          دقيقة وقابلة للمراجعة خلف الكواليس.
        </p>
        <h2 className="font-medium mt-4">ماذا نقدم</h2>
        <ul className="list-disc pl-4 space-y-2">
          <li>
            <p className="font-medium">تجربة محفظة موحدة</p>
            <p className="opacity-80 text-sm">
              يحصل كل مستخدم على عنوان إيداع فريد. يقوم نظام السحب لدينا بتجميع الأرصدة بأمان في خزائن المنصة (ساخنة/باردة)
              لتقليل مخاطر العناوين مع الحفاظ على سجلات إيداع دقيقة وأرصدة محدثة لحظيًا.
            </p>
          </li>
          <li>
            <p className="font-medium">دعم متعدد للأصول</p>
            <p className="opacity-80 text-sm">
              عملات أصلية (مثل BNB) وتوكنات قياسية (مثل USDT/USDC) مع رسوم غاز وخدمة شفافة.
            </p>
          </li>
          <li>
            <p className="font-medium">لوحة تحكم فورية</p>
            <p className="opacity-80 text-sm">
              رؤية لحظية للإيداعات والأرصدة وحالة المعاملات بالإضافة إلى تنبيهات للأحداث المهمة.
            </p>
          </li>
          <li>
            <p className="font-medium">مصمم للنمو</p>
            <p className="opacity-80 text-sm">
              هيكلية معيارية (موصلات لكل سلسلة) لإضافة الشبكات والميزات بسرعة بما في ذلك عوائد مستقبلية مع ضوابط مخاطر واضحة.
            </p>
          </li>
        </ul>
        <h2 className="font-medium mt-4">كيف نحمي المستخدمين</h2>
        <ul className="list-disc pl-4 space-y-2">
          <li className="opacity-80 text-sm">
            حفظ أمين مع إدارة خزينة، حدود للسحب، وسياسات توقيع مراقَبة.
          </li>
          <li className="opacity-80 text-sm">محاسبة ذرية لضمان تطابق الإيداعات مع تحديثات الأرصدة دائمًا.</li>
          <li className="opacity-80 text-sm">
            مراقبة الاحتيال والمخاطر بقواعد آلية ومراجعة يدوية عند الحاجة.
          </li>
          <li className="opacity-80 text-sm">شفافية في الرسوم والحالة في كل خطوة.</li>
        </ul>
        <p className="opacity-80 text-sm">تواصل معنا: info.eltx@gmail.com</p>
        <p className="opacity-80 text-sm">الكيان القانوني: EliteX Agency LTD - المملكة المتحدة</p>
      </>
    ),
  } as const;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{t.footer.about}</h1>
      {content[lang]}
    </div>
  );
}
