'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
  CircleDollarSign,
  Compass,
  ChevronDown,
} from 'lucide-react';
import SectionCard from '../../../components/dashboard/SectionCard';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import PostCard from '../../../components/social/PostCard';
import {
  addPostComment,
  createPost,
  fetchAllPosts,
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
import { trackPostView } from '../../lib/monetization';

type FeedTab = 'for-you' | 'following';

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const shortcutsRef = useRef<HTMLElement | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [quickPost, setQuickPost] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [wordLimit, setWordLimit] = useState(1000);
  const [activeFeedTab, setActiveFeedTab] = useState<FeedTab>('for-you');
  const [feedSettings, setFeedSettings] = useState<FeedAlgorithmSettings>(DEFAULT_FEED_ALGORITHM_SETTINGS);
  const [forYouFeed, setForYouFeed] = useState<SocialPost[]>([]);
  const [isForYouLoading, setIsForYouLoading] = useState(true);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      router.replace('/login');
    }
  }, [user, router]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      const loaded = await fetchAllPosts(user.id);
      if (!cancelled) setPosts(loaded);
    };
    load();
    setWordLimit(getPostWordLimit());
    return () => {
      cancelled = true;
    };
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

  const followingFeed = useMemo(() => getFollowingFeed(posts), [posts]);
  const activeFeed = activeFeedTab === 'for-you' ? forYouFeed : followingFeed;

  useEffect(() => {
    let cancelled = false;
    setIsForYouLoading(true);
    const timer = window.setTimeout(() => {
      const fullForYouFeed = getForYouFeed(posts, { settings: feedSettings });
      const nextFeed = fullForYouFeed.slice(0, feedSettings.dashboardForYouItems);
      if (!cancelled) {
        setForYouFeed(nextFeed);
        setIsForYouLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [posts, feedSettings]);

  const scrollToShortcuts = () => {
    shortcutsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-2 lg:grid-cols-[220px,minmax(0,1fr),290px] lg:items-start">
        <aside className="x-card space-y-2 p-2 lg:sticky lg:top-20">
          <div className="grid grid-cols-3 gap-1.5">
            <SectionCard title={lang === 'ar' ? 'اكسبلور' : 'Explore'} href="/for-you" icon={Compass} compact />
            <button
              type="button"
              onClick={scrollToShortcuts}
              className="group relative flex items-center gap-1.5 rounded-xl border border-[#2f3336] bg-black px-1.5 py-1.5 text-left shadow-sm transition hover:border-[#c9a75c]/60 hover:bg-[#16181c]"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[#2f3336] bg-[#16181c] text-white transition group-hover:border-[#c9a75c]/70">
                <ChevronDown className="h-3 w-3" />
              </div>
              <span className="truncate text-[0.72rem] font-semibold leading-tight text-white">{lang === 'ar' ? 'المزيد..' : 'More..'}</span>
            </button>
            <SectionCard title={t.dashboard.cards.profile.title} href="/profile" icon={UserRound} compact />
            <SectionCard title={t.dashboard.cards.editProfile.title} href="/profile/edit" icon={PencilLine} compact />
            <SectionCard title={t.dashboard.cards.wallet.title} href="/wallet" icon={Wallet} compact />
            <SectionCard title={t.dashboard.cards.pay.title} href="/pay" icon={CreditCard} compact />
            <SectionCard title={lang === 'ar' ? 'بريميم' : 'Premium'} href="/premium" icon={ShieldCheck} compact />
            <SectionCard title={lang === 'ar' ? 'تحقيق الربح' : 'Monetize'} href="/monetize" icon={CircleDollarSign} compact />
          </div>
          <button
            type="button"
            onClick={() => router.push('/ai')}
            className="w-full rounded-xl border border-[#c9a75c]/35 bg-gradient-to-r from-[#0e1528] to-[#10161f] p-2 text-left transition hover:border-[#c9a75c]/65 hover:brightness-110"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#f4deae]"><Bot className="h-3 w-3" /> {lang === 'ar' ? 'اسأل LordAI 🤖' : 'Ask LordAI 🤖'}</p>
            <p className="mt-1 text-[10px] leading-4 text-white/70">{lang === 'ar' ? 'مساعد سريع للأفكار، الإجابات، وتحسين المحتوى.' : 'Fast help for ideas, answers, and content polish.'}</p>
          </button>
        </aside>

        <main className="space-y-2">
          <section className="x-card space-y-1.5 p-2">
            <h2 className="text-xs font-semibold sm:text-sm">{t.dashboard.social.askAiTitle}</h2>
            <div className="flex flex-col gap-2">
              <input
                className="x-input px-3 py-2 text-xs sm:text-sm placeholder:text-white/40"
                placeholder={t.dashboard.social.askAiPlaceholder}
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
              />
              <button
                className="btn btn-primary px-3 py-1.5 text-[11px]"
                onClick={async () => {
                  if (!aiQuestion.trim()) return toast(t.dashboard.social.askAiEmpty);
                  router.push(`/ai?q=${encodeURIComponent(aiQuestion.trim())}`);
                  setAiQuestion('');
                }}
              >
                {t.dashboard.social.askAiCta}
              </button>
            </div>
          </section>

          <section className="x-card space-y-2 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">{t.dashboard.social.quickPostKicker}</p>
                <h2 className="text-xs font-semibold sm:text-sm">{t.dashboard.social.quickPostTitle}</h2>
              </div>
              <span className="text-[10px] text-white/50">
                {wordCount}/{wordLimit} {t.dashboard.social.words}
              </span>
            </div>
            <textarea
              className="x-input min-h-[82px] p-2.5 text-xs sm:text-sm placeholder:text-white/40"
              placeholder={t.dashboard.social.quickPostPlaceholder}
              value={quickPost}
              onChange={(event) => setQuickPost(event.target.value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] text-white/60">{t.dashboard.social.quickPostHint}</div>
              <button
                className="btn btn-primary px-3 py-1.5 text-[11px]"
                onClick={async () => {
                  if (!quickPost.trim()) return toast(t.dashboard.social.quickPostEmpty);
                  if (wordCount > wordLimit) return toast(t.dashboard.social.quickPostLimit);
                  if (!user?.id) return toast(t.dashboard.social.sessionMissing);
                  const profile = getProfile(user.id, user);
                  const newPost = createPost({ content: quickPost.trim(), profile, isPremium: Boolean(user.is_premium) });
                  const saveResult = await savePost(newPost, user.id);
                  if (!saveResult.ok) return toast(t.dashboard.social.quickPostStorageError);
                  const loaded = await fetchAllPosts(user.id);
                  setPosts(loaded);
                  setQuickPost('');
                  toast(t.dashboard.social.quickPostSuccess);
                }}
              >
                <Send className="h-3.5 w-3.5" />
                {t.dashboard.social.quickPostCta}
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  className={`rounded-full border px-2.5 py-1 text-[10px] sm:text-[11px] ${activeFeedTab === 'for-you' ? 'border-[#c9a75c] bg-[#c9a75c]/20 text-[#f4deae]' : 'border-white/15 text-white/70 hover:border-white/30'}`}
                  onClick={() => setActiveFeedTab('for-you')}
                >
                  {t.dashboard.social.forYouTitle}
                </button>
                <button
                  className={`rounded-full border px-2.5 py-1 text-[10px] sm:text-[11px] ${activeFeedTab === 'following' ? 'border-[#c9a75c] bg-[#c9a75c]/20 text-[#f4deae]' : 'border-white/15 text-white/70 hover:border-white/30'}`}
                  onClick={() => setActiveFeedTab('following')}
                >
                  {t.dashboard.social.followingTitle}
                </button>
              </div>
              {activeFeedTab === 'for-you' && (
                <Link href="/for-you" className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] sm:text-[11px] text-white/80 hover:border-[#c9a75c]/60 hover:text-[#f4deae]">
                  {lang === 'ar' ? 'عرض المزيد' : 'Show More'}
                </Link>
              )}
            </div>
            <div className="space-y-2">
              {activeFeedTab === 'for-you' && isForYouLoading && (
                <div className="x-card p-3 text-xs text-white/60">{lang === 'ar' ? 'جاري تحميل فور يو…' : 'Loading For You feed…'}</div>
              )}
              {activeFeed.map((post) => {
                const summary = getPostInteractionSummary(post);
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    likeState={{ liked: summary.liked, likes: summary.likes }}
                    repostState={{ reposted: summary.reposted, reposts: summary.reposts }}
                    commentsState={{ comments: summary.comments, commentsList: summary.commentsList }}
                    commentPlaceholder={t.dashboard.social.commentPlaceholder}
                    commentSubmitLabel={t.dashboard.social.commentSubmit}
                    labels={t.dashboard.social.postMeta}
                    onLike={async (targetPost) => {
                      const result = await togglePostLike(targetPost, user?.id);
                      if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                      const loaded = await fetchAllPosts(user?.id);
                      setPosts(loaded);
                    }}
                    onRepost={async (targetPost) => {
                      const result = await togglePostRepost(targetPost, user?.id);
                      if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                      const loaded = await fetchAllPosts(user?.id);
                      setPosts(loaded);
                      toast(result.reposted ? t.dashboard.social.repostSuccess : t.dashboard.social.repostRemoved);
                    }}
                    onViewed={async (targetPost) => {
                      const counted = trackPostView(targetPost.id, user?.id);
                      if (counted) {
                        const loaded = await fetchAllPosts(user?.id);
                        setPosts(loaded);
                      }
                    }}
                    onComment={async (targetPost, content) => {
                      if (!user?.id) return toast(t.dashboard.social.sessionMissing);
                      if (!content.trim()) return toast(t.dashboard.social.commentEmpty);
                      const profile = getProfile(user.id, user);
                      const result = await addPostComment(targetPost, content, profile, user.id);
                      if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                      const loaded = await fetchAllPosts(user?.id);
                      setPosts(loaded);
                      toast(t.dashboard.social.commentSuccess);
                    }}
                  />
                );
              })}
              {activeFeedTab === 'for-you' && (
                <Link
                  href="/for-you"
                  className="mt-2 inline-flex w-full items-center justify-center rounded-2xl border border-[#c9a75c]/70 bg-[#c9a75c]/20 px-3 py-2.5 text-xs font-semibold text-[#f4deae] transition hover:bg-[#c9a75c]/30 hover:border-[#c9a75c] sm:text-sm"
                >
                  {lang === 'ar' ? 'عرض المزيد من منشورات For You' : 'Show More from For You'}
                </Link>
              )}
            </div>
          </section>
        </main>

        <aside ref={shortcutsRef} className="space-y-2 lg:sticky lg:top-20">
          <section id="dashboard-shortcuts" className="x-card space-y-2 p-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Shortcuts</h2>
            <div className="grid grid-cols-3 gap-1.5">
              <SectionCard title={t.dashboard.cards.transactions.title} href="/transactions" icon={ReceiptText} compact />
              <SectionCard title={t.dashboard.cards.p2p.title} href="/p2p" icon={Handshake} compact />
              <SectionCard title="Spot Trade" href="/trade/spot" icon={CandlestickChart} compact />
              <SectionCard title={t.dashboard.market.title} href="/market" icon={CandlestickChart} compact />
              <SectionCard title="Staking" href="/staking" icon={Coins} compact />
              <SectionCard title={t.dashboard.cards.invite.title} href="/referrals" icon={Gift} compact />
              <SectionCard title={t.dashboard.cards.aiAgent.title} href="/ai" icon={Sparkles} compact />
              <SectionCard title={lang === 'ar' ? 'بريميم' : 'Premium'} href="/premium" icon={ShieldCheck} compact />
              <SectionCard title={lang === 'ar' ? 'تحقيق الربح' : 'Monetize'} href="/monetize" icon={CircleDollarSign} compact />
              <SectionCard title={t.dashboard.cards.settings.title} href="/settings" icon={Settings} compact />
              <SectionCard title={t.dashboard.cards.faq.title} href="/faq" icon={HelpCircle} compact />
              <SectionCard title={t.dashboard.cards.support.title} href="/support" icon={LifeBuoy} compact />
              <SectionCard title={t.dashboard.cards.kyc.title} href="/kyc" icon={ShieldCheck} compact />
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
