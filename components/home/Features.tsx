'use client';

import { Shield, Zap, Bot, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import SectionCta from './SectionCta';
import { useLang } from '../../app/lib/i18n';

const enData = [
  { icon: MessageCircle, title: 'Social-first feed', desc: 'Publish updates, comment instantly, and connect like modern social apps.' },
  { icon: Bot, title: 'AI assistant', desc: 'Generate ideas, rewrite captions, and get smart suggestions while posting.' },
  { icon: Shield, title: 'Private by default', desc: 'Safe sign-in flows with account controls and reliable session protection.' },
  { icon: Zap, title: 'Built for speed', desc: 'Fast timeline loading and responsive interactions on desktop and mobile.' },
];

const arData = [
  { icon: MessageCircle, title: 'تجربة سوشيال أولاً', desc: 'انشر وتفاعل بسرعة زي منصات التواصل الحديثة.' },
  { icon: Bot, title: 'مساعد ذكاء اصطناعي', desc: 'ساعدك في كتابة المحتوى وتحسينه أثناء النشر.' },
  { icon: Shield, title: 'خصوصية وأمان', desc: 'تسجيل آمن وتحكم كامل في الحساب والجلسات.' },
  { icon: Zap, title: 'سرعة عالية', desc: 'تحميل سريع وتجربة سلسة على الكمبيوتر والموبايل.' },
];

export default function Features() {
  const { lang } = useLang();
  const data = lang === 'ar' ? arData : enData;
  return (
    <section className="py-16 px-4 bg-gradient-to-b from-neutral-950 via-fuchsia-950/20 to-neutral-950">
      <div className="max-w-6xl mx-auto space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/80">{lang === 'ar' ? 'المزايا' : 'Features'}</p>
          <h2 className="text-3xl font-bold">{lang === 'ar' ? 'ليه LordAi.Net؟' : 'Why LordAi.Net?'}</h2>
          <p className="text-white/70 text-sm md:text-base">
            {lang === 'ar' ? 'منصة سوشيال مدعومة بالذكاء الاصطناعي مع تجربة سريعة وتشجع المستخدم على التسجيل.' : 'A social media experience powered by AI and designed to convert visitors into active members.'}
          </p>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 max-w-6xl mx-auto mt-8">
        {data.map((d, i) => {
          const Icon = d.icon;
          return (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="p-[1px] rounded-2xl bg-gradient-to-br from-purple-600/80 to-cyan-600/80 shadow-lg"
            >
              <div className="h-full p-6 rounded-2xl bg-black/70 text-left backdrop-blur-xl border border-white/10 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center shadow">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-lg">{d.title}</h3>
                </div>
                <p className="text-sm opacity-80 leading-relaxed flex-1">{d.desc}</p>
                <div className="text-xs text-white/70">{lang === 'ar' ? 'سوشيال + ذكاء اصطناعي + أدوات نمو المجتمع.' : 'Social feed + AI tools + audience growth workflows.'}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="max-w-6xl mx-auto px-4 mt-10">
        <SectionCta
          eyebrow={lang === 'ar' ? 'ابدأ الآن' : 'Social onboarding'}
          title={lang === 'ar' ? 'جاهز تبدأ على LordAi.Net؟' : 'Ready to try LordAi.Net?'}
          copy={lang === 'ar' ? 'اعمل حسابك وابدأ أول منشورك في أقل من دقيقة.' : 'Create your profile and publish your first post in under a minute.'}
        />
      </div>
    </section>
  );
}
