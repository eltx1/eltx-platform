'use client';

import { ShieldCheck, Sparkles, Gauge, Expand } from 'lucide-react';
import SectionCta from './SectionCta';
import { useLang } from '../../app/lib/i18n';

const enPillars = [
  {
    icon: ShieldCheck,
    title: 'Safety by design',
    copy: 'Protected profiles, secure wallets, and audited smart contracts.',
  },
  {
    icon: Sparkles,
    title: 'Social made simple',
    copy: 'Post, share, and chat while your wallet and trading tools stay one tap away.',
  },
  {
    icon: Gauge,
    title: 'Fast performance',
    copy: 'Optimized for instant social interactions and smooth on-chain actions.',
  },
  {
    icon: Expand,
    title: 'Built to scale',
    copy: 'Web3-ready architecture prepared for new communities and future upgrades.',
  },
];

const arPillars = [
  {
    icon: ShieldCheck,
    title: 'أمان من البداية',
    copy: 'حسابات محمية وضبط خصوصية واضح للمستخدم.',
  },
  {
    icon: Sparkles,
    title: 'سوشيال بشكل أبسط',
    copy: 'نشر ومشاركة ومحادثات فورية بدون تعقيد.',
  },
  {
    icon: Gauge,
    title: 'أداء سريع',
    copy: 'واجهة خفيفة وسريعة على كل الشاشات.',
  },
  {
    icon: Expand,
    title: 'جاهزة للتوسع',
    copy: 'بنية مرنة تدعم نمو المجتمع والخصائص الجديدة.',
  },
];

export default function About() {
  const { lang } = useLang();
  const pillars = lang === 'ar' ? arPillars : enPillars;
  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-purple-950/20 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-3 text-center md:text-left md:space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-300/80">{lang === 'ar' ? 'عن المنصة' : 'About LordAi.Net'}</p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
            {lang === 'ar' ? 'منصة تواصل اجتماعي ذكية للمبدعين والمجتمعات.' : 'AI social infrastructure for creators and communities.'}
          </h2>
          <p className="text-base md:text-lg text-white/80 max-w-3xl mx-auto md:mx-0">
            {lang === 'ar' ? 'التجربة الأساسية أصبحت سوشيال أولاً، مع مساعد ذكاء اصطناعي يساعد المستخدمين على الإنتاج والنمو بشكل أسرع.' : 'The homepage is now social-first, with AI workflows that help users create, engage, and grow faster.'}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-purple-900/10 backdrop-blur-sm p-5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold text-lg">{pillar.title}</h3>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{pillar.copy}</p>
              </div>
            );
          })}
        </div>
        <SectionCta
          eyebrow={lang === 'ar' ? 'انضم للمنصة' : 'Join LordAi.Net'}
          title={lang === 'ar' ? 'أنشئ بروفايلك في دقائق' : 'Create your profile in minutes'}
          copy={lang === 'ar' ? 'انشئ حسابك، اعمل أول منشور، وابدأ بناء مجتمعك.' : 'Set up your profile, publish your first post, and start building your audience.'}
        />
      </div>
    </section>
  );
}
