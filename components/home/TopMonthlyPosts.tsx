'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PostCard from '../social/PostCard';
import { dict, useLang } from '../../app/lib/i18n';
import { apiFetch } from '../../app/lib/api';
import { getAllPosts, getForYouFeed, getPostInteractionSummary, type SocialPost } from '../../app/lib/social-store';
import { DEFAULT_FEED_ALGORITHM_SETTINGS, type FeedAlgorithmSettings } from '../../app/lib/feed-algorithm';

export default function TopMonthlyPosts() {
  const { lang } = useLang();
  const t = dict[lang];
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [feedSettings, setFeedSettings] = useState<FeedAlgorithmSettings>(DEFAULT_FEED_ALGORITHM_SETTINGS);

  useEffect(() => {
    setPosts(getAllPosts(undefined));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const res = await apiFetch<{ settings: FeedAlgorithmSettings }>('/api/admin/feed-algorithm');
      if (!cancelled && res.ok && res.data?.settings) setFeedSettings(res.data.settings);
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const topPosts = useMemo(() => {
    const monthly = getForYouFeed(posts, { settings: feedSettings });
    return monthly.slice(0, feedSettings.topMonthlyItems);
  }, [posts, feedSettings]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-3 px-4 py-6 sm:px-6 lg:px-8">
      <div className="x-card flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#f4deae]/80">{lang === 'ar' ? 'الأقوى هذا الشهر' : 'Trending this month'}</p>
          <h2 className="text-xl font-semibold">{lang === 'ar' ? 'Top Monthly Posts' : 'Top Monthly Posts'}</h2>
        </div>
        <Link href="/for-you" className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/85 hover:border-[#c9a75c]/70 hover:text-[#f4deae]">
          {lang === 'ar' ? 'عرض الكل' : 'View all'}
        </Link>
      </div>
      <div className="space-y-3">
        {topPosts.map((post) => {
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
            />
          );
        })}
      </div>
    </section>
  );
}
