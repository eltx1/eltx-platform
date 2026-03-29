'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Repeat2, ExternalLink } from 'lucide-react';
import { dict, useLang } from '../../app/lib/i18n';
import { apiFetch } from '../../app/lib/api';
import { fetchAllPosts, getForYouFeedPage, getPostInteractionSummary, type SocialPost } from '../../app/lib/social-store';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, type FeedAlgorithmSettings } from '../../app/lib/feed-algorithm';

export default function HomeForYouPreview() {
  const { lang } = useLang();
  const t = dict[lang].home.feedPreview;
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [feedSettings, setFeedSettings] = useState<FeedAlgorithmSettings>(DEFAULT_FEED_ALGORITHM_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const loadedPosts = await fetchAllPosts(undefined);
        if (!cancelled) setPosts(loadedPosts);
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const postList = useMemo(
    () =>
      getForYouFeedPage(posts, {
        settings: feedSettings,
        offset: 0,
        limit: 3,
      }).items,
    [feedSettings, posts],
  );

  return (
    <section className="border-b border-[#2f3336] py-10 text-white md:py-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
        <div className="x-card space-y-2 p-4 md:p-5">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">{t.eyebrow}</p>
          <h2 className="text-xl font-semibold md:text-2xl">{t.title}</h2>
          <p className="text-sm text-white/70">{t.subtitle}</p>
          <p className="text-xs text-[#f4deae]">{t.loginHint}</p>
        </div>

        {loading && (
          <div className="x-card p-4 text-sm text-white/70">{lang === 'ar' ? 'جاري تحميل المعاينة...' : 'Loading feed preview...'}</div>
        )}

        {!loading && postList.length === 0 && <div className="x-card p-4 text-sm text-white/70">{t.empty}</div>}

        {!loading &&
          postList.map((post) => {
            const summary = getPostInteractionSummary(post);
            return (
              <article key={post.id} className="x-card space-y-3 p-4 md:p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{post.authorName}</p>
                  <p className="text-xs text-white/60">{post.handle}</p>
                </div>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 hover:border-[#c9a75c]/60 hover:text-[#f4deae]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t.openPost}
                </Link>
              </div>

              <p className="text-sm leading-6 text-white/90">{post.content}</p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <Link href="/login" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 hover:border-[#c9a75c]/60 hover:text-[#f4deae]">
                  <Heart className="h-3.5 w-3.5" />
                  {t.like} · {summary.likes}
                </Link>
                <Link href="/login" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 hover:border-[#c9a75c]/60 hover:text-[#f4deae]">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {t.comment} · {summary.comments}
                </Link>
                <Link href="/login" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 hover:border-[#c9a75c]/60 hover:text-[#f4deae]">
                  <Repeat2 className="h-3.5 w-3.5" />
                  {t.repost} · {summary.reposts}
                </Link>
              </div>
            </article>
            );
          })}

        <div className="flex justify-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-[#c9a75c]/70 bg-[#1a1508] px-5 py-2 text-sm font-semibold text-[#f4deae] hover:bg-[#221b0d]"
          >
            <ExternalLink className="h-4 w-4" />
            {t.viewAll}
          </Link>
        </div>
      </div>
    </section>
  );
}
