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
  Bot,
  Clock3,
} from 'lucide-react';
import SectionCard from '../../../components/dashboard/SectionCard';
import DashboardMarketBoard from '../../../components/dashboard/DashboardMarketBoard';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import PostCard from '../../../components/social/PostCard';
import {
  addPostComment,
  createPost,
  getAllPosts,
  getFollowingFeed,
  getForYouFeed,
  getPostInteractionSummary,
  getPostWordLimit,
  getProfile,
  savePost,
  togglePostLike,
  togglePostRepost,
  type SocialPost,
} from '../../lib/social-store';
import { apiFetch } from '../../lib/api';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, type FeedAlgorithmSettings } from '../../lib/feed-algorithm';

type FeedTab = 'for-you' | 'following';

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
  const [activeFeedTab, setActiveFeedTab] = useState<FeedTab>('for-you');
  const [feedSettings, setFeedSettings] = useState<FeedAlgorithmSettings>(DEFAULT_FEED_ALGORITHM_SETTINGS);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      router.replace('/login');
    }
  }, [user, router]);

  useEffect(() => {
    if (!user?.id) return;
    setPosts(getAllPosts(user.id));
    setWordLimit(getPostWordLimit());
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const res = await apiFetch<{ settings: FeedAlgorithmSettings }>('/api/admin/feed-algorithm');
      if (!cancelled && res.ok && res.data?.settings) {
        setFeedSettings(res.data.settings);
      }
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const wordCount = useMemo(() => {
    if (!quickPost.trim()) return 0;
    return quickPost.trim().split(/\s+/).length;
  }, [quickPost]);

  const forYouFeed = useMemo(() => getForYouFeed(posts, { userId: user?.id, settings: feedSettings }), [posts, user?.id, feedSettings]);
  const followingFeed = useMemo(() => getFollowingFeed(posts), [posts]);
  const activeFeed = activeFeedTab === 'for-you' ? forYouFeed : followingFeed;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold sm:text-xl">{t.dashboard.title}</h1>

      <div className="grid gap-4 lg:grid-cols-[260px,minmax(0,1fr),320px] lg:items-start">
        <aside className="x-card space-y-3 p-4 lg:sticky lg:top-20">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Workspace</p>
          <div className="grid grid-cols-2 gap-2">
            <SectionCard title={t.dashboard.cards.profile.title} href="/profile" icon={UserRound} />
            <SectionCard title={t.dashboard.cards.editProfile.title} href="/profile/edit" icon={PencilLine} />
            <SectionCard title={t.dashboard.cards.wallet.title} href="/wallet" icon={Wallet} />
            <SectionCard title={t.dashboard.cards.pay.title} href="/pay" icon={CreditCard} />
          </div>
          <button
            type="button"
            onClick={() => router.push('/ai')}
            className="w-full rounded-2xl border border-[#c9a75c]/40 bg-gradient-to-r from-[#0e1528] to-[#10161f] p-3 text-left transition hover:border-[#c9a75c]/70 hover:brightness-110"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-[#f4deae]"><Bot className="h-4 w-4" /> {lang === 'ar' ? 'اسأل LordAI 🤖' : 'Ask LordAI 🤖'}</p>
            <p className="mt-1 text-xs text-white/70">{lang === 'ar' ? 'مساعد ذكي سريع للأفكار، الإجابات، وتحسين محتواك.' : 'Get instant help, ideas, and smart answers for your next move.'}</p>
          </button>
        </aside>

        <main className="space-y-4">
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
                  if (!quickPost.trim()) return toast(t.dashboard.social.quickPostEmpty);
                  if (wordCount > wordLimit) return toast(t.dashboard.social.quickPostLimit);
                  if (!user?.id) return toast(t.dashboard.social.sessionMissing);
                  const profile = getProfile(user.id);
                  const newPost = createPost({ content: quickPost.trim(), profile });
                  const saveResult = savePost(newPost, user.id);
                  if (!saveResult.ok) return toast(t.dashboard.social.quickPostStorageError);
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

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.forYouKicker}</p>
                <h2 className="text-base font-semibold">{t.dashboard.social.forYouTitle}</h2>
              </div>
              <span className="text-xs text-white/50">{t.dashboard.social.forYouSubtitle}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`rounded-full border px-3 py-1.5 text-xs ${activeFeedTab === 'for-you' ? 'border-[#c9a75c] bg-[#c9a75c]/20 text-[#f4deae]' : 'border-white/15 text-white/70 hover:border-white/30'}`}
                onClick={() => setActiveFeedTab('for-you')}
              >
                {t.dashboard.social.forYouTitle}
              </button>
              <button
                className={`rounded-full border px-3 py-1.5 text-xs ${activeFeedTab === 'following' ? 'border-[#c9a75c] bg-[#c9a75c]/20 text-[#f4deae]' : 'border-white/15 text-white/70 hover:border-white/30'}`}
                onClick={() => setActiveFeedTab('following')}
              >
                {t.dashboard.social.followingTitle}
              </button>
            </div>
            <div className="space-y-3">
              {activeFeed.map((post) => {
                const summary = getPostInteractionSummary(post, user?.id);
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    likeState={{ liked: summary.liked, likes: summary.likes }}
                    repostState={{ reposted: summary.reposted, reposts: summary.reposts }}
                    commentsState={{ comments: summary.comments, commentsList: summary.commentsList }}
                    commentPlaceholder={t.dashboard.social.commentPlaceholder}
                    commentSubmitLabel={t.dashboard.social.commentSubmit}
                    onLike={(targetPost) => {
                      const result = togglePostLike(targetPost, user?.id);
                      if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                      setPosts((prev) => [...prev]);
                    }}
                    onRepost={(targetPost) => {
                      const result = togglePostRepost(targetPost, user?.id);
                      if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                      setPosts((prev) => [...prev]);
                      toast(result.reposted ? t.dashboard.social.repostSuccess : t.dashboard.social.repostRemoved);
                    }}
                    onComment={(targetPost, content) => {
                      if (!user?.id) return toast(t.dashboard.social.sessionMissing);
                      if (!content.trim()) return toast(t.dashboard.social.commentEmpty);
                      const profile = getProfile(user.id);
                      const result = addPostComment(targetPost, content, profile, user.id);
                      if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                      setPosts((prev) => [...prev]);
                      toast(t.dashboard.social.commentSuccess);
                    }}
                  />
                );
              })}
            </div>
          </section>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <section className="x-card space-y-3 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">{t.dashboard.social.askAiKicker}</p>
              <h2 className="text-base font-semibold">{t.dashboard.social.askAiTitle}</h2>
            </div>
            <div className="flex flex-col gap-3">
              <input
                className="x-input px-4 py-3 text-sm placeholder:text-white/40"
                placeholder={t.dashboard.social.askAiPlaceholder}
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
              />
              <button
                className="btn btn-primary px-4 py-2 text-xs"
                onClick={() => {
                  if (!aiQuestion.trim()) return toast(t.dashboard.social.askAiEmpty);
                  router.push(`/ai?q=${encodeURIComponent(aiQuestion.trim())}`);
                  setAiQuestion('');
                }}
              >
                {t.dashboard.social.askAiCta}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/60"><Clock3 className="h-3.5 w-3.5" /> {t.dashboard.social.askAiHint}</div>
          </section>

          <section className="x-card p-4">
            <DashboardMarketBoard />
          </section>

          <section className="x-card p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/65">Shortcuts</h2>
            <div className="grid grid-cols-2 gap-2">
              <SectionCard title={t.dashboard.cards.transactions.title} href="/transactions" icon={ReceiptText} />
              <SectionCard title={t.dashboard.cards.p2p.title} href="/p2p" icon={Handshake} />
              <SectionCard title="ELTX Swap" href="/trade" icon={ArrowLeftRight} />
              <SectionCard title="Spot Trade" href="/trade/spot" icon={CandlestickChart} />
              <SectionCard title="Staking" href="/staking" icon={Coins} />
              <SectionCard title={t.dashboard.cards.invite.title} href="/referrals" icon={Gift} />
              <SectionCard title={t.dashboard.cards.aiAgent.title} href="/ai" icon={Sparkles} />
              <SectionCard title={t.dashboard.cards.settings.title} href="/settings" icon={Settings} />
              <SectionCard title={t.dashboard.cards.faq.title} href="/faq" icon={HelpCircle} />
              <SectionCard title={t.dashboard.cards.support.title} href="/support" icon={LifeBuoy} />
              <SectionCard title={t.dashboard.cards.kyc.title} href="/kyc" icon={ShieldCheck} />
            </div>
          </section>
        </aside>
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
