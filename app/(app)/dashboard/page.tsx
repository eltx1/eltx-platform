'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '../../lib/auth';
import {
  Wallet,
  ReceiptText,
  CreditCard,
  HelpCircle,
  ShieldCheck,
  Settings,
  Coins,
  ArrowLeftRight,
  CandlestickChart,
  Gift,
  Handshake,
  LifeBuoy,
  Sparkles,
  UserRound,
  PencilLine,
  Plus,
  Send,
} from 'lucide-react';
import SectionCard from '../../../components/dashboard/SectionCard';
import DashboardMarketBoard from '../../../components/dashboard/DashboardMarketBoard';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import PostCard from '../../../components/social/PostCard';
import {
  createPost,
  getAllPosts,
  getForYouFeed,
  getPostWordLimit,
  getProfile,
  savePost,
  type SocialPost,
} from '../../lib/social-store';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [quickPost, setQuickPost] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [wordLimit, setWordLimit] = useState(1000);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      router.replace('/login');
      return;
    }
  }, [user, router]);

  useEffect(() => {
    setPosts(getAllPosts());
    setWordLimit(getPostWordLimit());
  }, []);

  const wordCount = useMemo(() => {
    if (!quickPost.trim()) return 0;
    return quickPost.trim().split(/\s+/).length;
  }, [quickPost]);

  const forYouFeed = useMemo(() => getForYouFeed(posts), [posts]);

  return (
    <div className="p-3 sm:p-4 space-y-4 sm:space-y-5 overflow-x-hidden relative">
      <h1 className="text-lg font-semibold sm:text-xl">{t.dashboard.title}</h1>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.quickPostKicker}</p>
            <h2 className="text-base font-semibold">{t.dashboard.social.quickPostTitle}</h2>
          </div>
          <span className="text-xs text-white/50">
            {wordCount}/{wordLimit} {t.dashboard.social.words}
          </span>
        </div>
        <textarea
          className="w-full min-h-[120px] rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
          placeholder={t.dashboard.social.quickPostPlaceholder}
          value={quickPost}
          onChange={(event) => setQuickPost(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-white/60">{t.dashboard.social.quickPostHint}</div>
          <button
            className="btn btn-primary px-4 py-2 text-xs"
            onClick={() => {
              if (!quickPost.trim()) {
                toast(t.dashboard.social.quickPostEmpty);
                return;
              }
              if (wordCount > wordLimit) {
                toast(t.dashboard.social.quickPostLimit);
                return;
              }
              const profile = getProfile();
              const newPost = createPost({ content: quickPost.trim(), profile });
              savePost(newPost);
              setPosts((prev) => [newPost, ...prev]);
              setQuickPost('');
              toast(t.dashboard.social.quickPostSuccess);
            }}
          >
            <Send className="h-4 w-4" />
            {t.dashboard.social.quickPostCta}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.askAiKicker}</p>
            <h2 className="text-base font-semibold">{t.dashboard.social.askAiTitle}</h2>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40"
            placeholder={t.dashboard.social.askAiPlaceholder}
            value={aiQuestion}
            onChange={(event) => setAiQuestion(event.target.value)}
          />
          <button
            className="btn btn-primary px-4 py-2 text-xs"
            onClick={() => {
              if (!aiQuestion.trim()) {
                toast(t.dashboard.social.askAiEmpty);
                return;
              }
              router.push(`/ai?q=${encodeURIComponent(aiQuestion.trim())}`);
              setAiQuestion('');
            }}
          >
            {t.dashboard.social.askAiCta}
          </button>
        </div>
        <div className="text-xs text-white/60">{t.dashboard.social.askAiHint}</div>
      </section>

      <div className="space-y-4 pt-1 sm:space-y-5">
        <div className="pt-3 border-t border-white/5 sm:pt-4">
          <DashboardMarketBoard />
        </div>

        <div className="pt-4 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Payments</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard
              title={t.dashboard.cards.wallet.title}
              href="/wallet"
              icon={Wallet}
            />
            <SectionCard
              title={t.dashboard.cards.transactions.title}
              href="/transactions"
              icon={ReceiptText}
            />
            <SectionCard title={t.dashboard.cards.pay.title} href="/pay" icon={CreditCard} />
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Trade</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title="ELTX Swap" href="/trade" icon={ArrowLeftRight} />
            <SectionCard title="Spot Trade" href="/trade/spot" icon={CandlestickChart} />
            <SectionCard title={t.dashboard.cards.p2p.title} href="/p2p" icon={Handshake} />
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Earn</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title="Staking" href="/staking" icon={Coins} />
            <SectionCard title={t.dashboard.cards.invite.title} href="/referrals" icon={Gift} />
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">{t.dashboard.ai.kicker}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard
              title={t.dashboard.cards.aiAgent.title}
              href="/ai"
              icon={Sparkles}
              badge={t.dashboard.ai.kicker}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Social</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title={t.dashboard.cards.profile.title} href="/profile" icon={UserRound} />
            <SectionCard title={t.dashboard.cards.editProfile.title} href="/profile/edit" icon={PencilLine} />
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Profile</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title={t.dashboard.cards.settings.title} href="/settings" icon={Settings} />
            <SectionCard title={t.dashboard.cards.faq.title} href="/faq" icon={HelpCircle} />
            <SectionCard title={t.dashboard.cards.support.title} href="/support" icon={LifeBuoy} />
            <SectionCard title={t.dashboard.cards.kyc.title} href="/kyc" icon={ShieldCheck} />
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.forYouKicker}</p>
              <h2 className="text-base font-semibold">{t.dashboard.social.forYouTitle}</h2>
            </div>
            <span className="text-xs text-white/50">{t.dashboard.social.forYouSubtitle}</span>
          </div>
          <div className="space-y-3">
            {forYouFeed.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </div>

      <button
        className="fixed bottom-24 left-4 sm:left-6 h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 via-fuchsia-500 to-cyan-400 text-white shadow-lg shadow-purple-900/40 flex items-center justify-center hover:scale-105 transition"
        onClick={() => router.push('/posts/new')}
        aria-label={t.dashboard.social.newPostCta}
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
