'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    if (!user?.id) return;
    setPosts(getAllPosts(user.id));
    setWordLimit(getPostWordLimit());
  }, [user?.id]);

  const wordCount = useMemo(() => {
    if (!quickPost.trim()) return 0;
    return quickPost.trim().split(/\s+/).length;
  }, [quickPost]);

  const forYouFeed = useMemo(() => getForYouFeed(posts), [posts]);

  return (
    <div className="space-y-4 overflow-x-hidden rounded-2xl border border-[#2f3336] bg-black p-3 sm:p-4 sm:space-y-5">
      <h1 className="text-lg font-semibold sm:text-xl">{t.dashboard.title}</h1>

      <section className="x-card space-y-4 p-4">
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
          className="x-input min-h-[120px] p-4 text-sm placeholder:text-white/40"
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
              if (!user?.id) {
                toast(t.dashboard.social.sessionMissing);
                return;
              }
              const profile = getProfile(user.id);
              const newPost = createPost({ content: quickPost.trim(), profile });
              const saveResult = savePost(newPost, user.id);
              if (!saveResult.ok) {
                toast(t.dashboard.social.quickPostStorageError);
                return;
              }
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

      <section className="x-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.askAiKicker}</p>
            <h2 className="text-base font-semibold">{t.dashboard.social.askAiTitle}</h2>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="x-input flex-1 px-4 py-3 text-sm placeholder:text-white/40"
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
        <div className="pt-3 border-t border-[#2f3336] sm:pt-4">
          <DashboardMarketBoard />
        </div>

        <div className="pt-4 border-t border-[#2f3336]">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/65">Payments</h2>
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

        <div className="pt-4 border-t border-[#2f3336]">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/65">Trade</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title="ELTX Swap" href="/trade" icon={ArrowLeftRight} />
            <SectionCard title="Spot Trade" href="/trade/spot" icon={CandlestickChart} />
            <SectionCard title={t.dashboard.cards.p2p.title} href="/p2p" icon={Handshake} />
          </div>
        </div>

        <div className="pt-4 border-t border-[#2f3336]">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/65">Earn</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title="Staking" href="/staking" icon={Coins} />
            <SectionCard title={t.dashboard.cards.invite.title} href="/referrals" icon={Gift} />
          </div>
        </div>

        <div className="pt-4 border-t border-[#2f3336]">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/65">{t.dashboard.ai.kicker}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard
              title={t.dashboard.cards.aiAgent.title}
              href="/ai"
              icon={Sparkles}
              badge={t.dashboard.ai.kicker}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-[#2f3336]">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/65">Social</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title={t.dashboard.cards.profile.title} href="/profile" icon={UserRound} />
            <SectionCard title={t.dashboard.cards.editProfile.title} href="/profile/edit" icon={PencilLine} />
          </div>
        </div>

        <div className="pt-4 border-t border-[#2f3336]">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/65">Profile</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <SectionCard title={t.dashboard.cards.settings.title} href="/settings" icon={Settings} />
            <SectionCard title={t.dashboard.cards.faq.title} href="/faq" icon={HelpCircle} />
            <SectionCard title={t.dashboard.cards.support.title} href="/support" icon={LifeBuoy} />
            <SectionCard title={t.dashboard.cards.kyc.title} href="/kyc" icon={ShieldCheck} />
          </div>
        </div>

        <div className="pt-4 border-t border-[#2f3336] space-y-4">
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
        className="fixed bottom-24 left-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#c9a75c] text-white shadow-lg transition hover:brightness-110 sm:left-6"
        onClick={() => router.push('/posts/new')}
        aria-label={t.dashboard.social.newPostCta}
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
