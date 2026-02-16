'use client';

import { ChevronDown, Clock4, Mail, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { dict, useLang } from '../lib/i18n';

type FaqItem = { id: number; question: string; answer: string; createdAt?: string };

const fallbackFaqs: FaqItem[] = [
  {
    id: 1,
    question: 'What is LordAi.Net?',
    answer: 'LordAi.Net is an AI-powered Web3 social network where you can post, chat, and earn while keeping trading and wallet tools close.',
  },
  {
    id: 2,
    question: 'How do I deposit?',
    answer:
      'Copy your personal BNB wallet address from the app and send BNB or supported tokens. Funds are detected automatically after network confirmations.',
  },
  {
    id: 3,
    question: 'When will staking launch?',
    answer: 'Staking is rolling out gradually. You will see available plans inside the app as soon as your region is enabled.',
  },
  {
    id: 4,
    question: 'Is there a mobile app?',
    answer: 'A dedicated mobile experience is in active development. Join our newsletter inside the app to get an early invite.',
  },
  {
    id: 5,
    question: 'Who can I contact for support?',
    answer: 'Email support@lordai.net or open a ticket from the help center for priority assistance from the team.',
  },
];

export default function FAQPage() {
  const { lang } = useLang();
  const t = dict[lang];

  const [faqs, setFaqs] = useState<FaqItem[]>(fallbackFaqs);
  const [openId, setOpenId] = useState<number | null>(fallbackFaqs[0]?.id ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFaqs = async () => {
      try {
        const res = await fetch('/api/faqs', { cache: 'no-store' });
        const data = await res.json();
        if (Array.isArray(data?.faqs) && data.faqs.length) {
          setFaqs(data.faqs);
          setOpenId(data.faqs[0].id);
        }
      } catch (error) {
        console.error('Failed to load FAQs', error);
      } finally {
        setLoading(false);
      }
    };

    loadFaqs();
  }, []);

  const lastUpdated = useMemo(() => {
    const latest = faqs
      .map((faq) => faq.createdAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];
    return latest ? new Date(latest).toLocaleDateString() : 'Recently refreshed';
  }, [faqs]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-blue-900/20 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-white/60">FAQ</p>
              <h1 className="text-3xl font-semibold md:text-4xl">{t.dashboard.cards.faq.title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Answers to the most common questions about LordAi.Net, deposits, staking, and support. Updated in real time by the team.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/70">
              <Clock4 className="h-5 w-5 text-blue-300" />
              <div>
                <p className="text-xs uppercase text-white/50">Last update</p>
                <p className="font-semibold text-white">{lastUpdated}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[{
              title: 'Instant answers',
              copy: 'Every question is grouped for speed and clarity.',
            },
            {
              title: 'Live updates',
              copy: 'Admin edits show up here immediately for customers.',
            },
            {
              title: 'Need help?',
              copy: 'Reach the team anytime from the support center.',
            }].map((item, idx) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-blue-900/20"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-200">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-white">{item.title}</p>
                    <p className="text-sm text-white/60">{item.copy}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            {faqs.map((faq) => {
              const open = openId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/10"
                >
                  <button
                    onClick={() => setOpenId(open ? null : faq.id)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-200">
                        {faq.id}
                      </span>
                      <div>
                        <p className="text-base font-semibold leading-snug text-white">{faq.question}</p>
                        <p className="text-xs uppercase tracking-wide text-white/50">Updated {faq.createdAt ? new Date(faq.createdAt).toLocaleDateString() : 'recently'}</p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-white/70 transition duration-200 ${open ? 'rotate-180 text-white' : ''}`}
                    />
                  </button>
                  <div
                    className={`grid transition-all duration-200 ${open ? 'grid-rows-[1fr] border-t border-white/10 bg-black/40' : 'grid-rows-[0fr]'} `}
                  >
                    <div className="overflow-hidden px-4 pb-5 pt-2 text-sm leading-relaxed text-white/80">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                <Sparkles className="h-4 w-4 animate-pulse text-blue-300" />
                Syncing latest answers...
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-blue-600/20 via-blue-500/10 to-indigo-600/10 p-6 shadow-lg shadow-blue-900/30">
              <div className="flex items-center gap-3 text-sm text-white/70">
                <Mail className="h-5 w-5 text-blue-200" />
                <p className="uppercase tracking-wide text-white/60">Need more help?</p>
              </div>
              <h3 className="mt-3 text-xl font-semibold text-white">Talk with LordAi.Net support</h3>
              <p className="mt-2 text-sm text-white/70">
                Can’t find your answer? Reach out to our support engineers and we’ll get back in minutes during business hours.
              </p>
              <div className="mt-4 space-y-2 text-sm text-white/80">
                <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-2">support@lordai.net</p>
                <p className="rounded-xl border border-white/10 bg-black/30 px-4 py-2">Help center → Account & payments</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
              <p className="font-semibold text-white">Pro tip</p>
              <p className="mt-1">
                We keep FAQs in sync with the admin portal. Any changes made by the operations team appear instantly here—no page reload needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
