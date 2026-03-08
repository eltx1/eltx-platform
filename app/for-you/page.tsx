'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { dict, useLang } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import PostCard from '../../components/social/PostCard';
import { apiFetch } from '../lib/api';
import {
  getAllPosts,
  getForYouFeedPage,
  getPostInteractionSummary,
  type SocialPost,
} from '../lib/social-store';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, type FeedAlgorithmSettings } from '../lib/feed-algorithm';

const FALLBACK_BATCH_SIZE = 50;

export default function ForYouPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang];
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [feedSettings, setFeedSettings] = useState<FeedAlgorithmSettings>(DEFAULT_FEED_ALGORITHM_SETTINGS);
  const [visible, setVisible] = useState<SocialPost[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPosts(getAllPosts(user?.id));
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

  const pageSize = Math.max(10, feedSettings.forYouPageItems || FALLBACK_BATCH_SIZE);
  const forYouAll = useMemo(
    () => getForYouFeedPage(posts, {
      userId: user?.id,
      settings: feedSettings,
      limit: 500,
      offset: 0,
    }),
    [posts, feedSettings, user?.id],
  );

  const loadNext = useCallback(() => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;

    const page = getForYouFeedPage(posts, {
      userId: user?.id,
      settings: feedSettings,
      offset,
      limit: pageSize,
    });

    setVisible((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const unique = page.items.filter((item) => !existingIds.has(item.id));
      return [...prev, ...unique];
    });
    setOffset(page.nextOffset);
    setHasMore(page.hasMore);
    loadingMoreRef.current = false;
  }, [feedSettings, hasMore, offset, pageSize, posts, user?.id]);

  useEffect(() => {
    setVisible([]);
    setOffset(0);
    setHasMore(true);
  }, [pageSize, posts, feedSettings]);

  useEffect(() => {
    if (!posts.length) return;
    if (!visible.length) loadNext();
  }, [posts, visible.length, loadNext]);

  useEffect(() => {
    const node = loaderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) loadNext();
      },
      { rootMargin: '200px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNext]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-4">
      <section className="x-card flex items-center justify-between p-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">{lang === 'ar' ? 'تدفق المحتوى' : 'Social feed'}</p>
          <h1 className="text-lg font-semibold">{t.dashboard.social.forYouTitle}</h1>
          <p className="text-xs text-white/65">{t.dashboard.social.forYouSubtitle}</p>
        </div>
        <Link href="/dashboard" className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:border-[#c9a75c]/60 hover:text-[#f4deae]">
          {lang === 'ar' ? 'الداشبورد' : 'Dashboard'}
        </Link>
      </section>

      <section className="space-y-3">
        {visible.map((post) => {
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
            />
          );
        })}
        {forYouAll.total === 0 && <div className="x-card p-4 text-sm text-white/70">{lang === 'ar' ? 'لا توجد منشورات حالياً.' : 'No posts available yet.'}</div>}
        {hasMore && <div ref={loaderRef} className="h-10" />}
      </section>
    </main>
  );
}
