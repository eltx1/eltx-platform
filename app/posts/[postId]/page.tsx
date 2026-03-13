'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import AppBottomNav from '../../../components/layout/AppBottomNav';
import AppShell from '../../../components/layout/AppShell';
import PostCard from '../../../components/social/PostCard';
import { useAuth } from '../../lib/auth';
import { dict, useLang } from '../../lib/i18n';
import { useToast } from '../../lib/toast';
import {
  addPostComment,
  fetchAllPosts,
  getPostInteractionSummary,
  getProfile,
  togglePostLike,
  togglePostRepost,
  type SocialPost,
} from '../../lib/social-store';
import { trackPostView } from '../../lib/monetization';

export default function PostDetailsPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const params = useParams<{ postId: string }>();
  const [posts, setPosts] = useState<SocialPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const loaded = await fetchAllPosts(user?.id);
      if (!cancelled) setPosts(loaded);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const post = useMemo(() => {
    const postId = decodeURIComponent(params.postId || '');
    return posts.find((item) => item.id === postId);
  }, [params.postId, posts]);

  return (
    <>
      <AppShell>
        <main className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-4">
          <section className="x-card flex items-center justify-between p-3">
            <div className="space-y-1">
              <Link href="/for-you" className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white">
                <ArrowLeft className="h-3.5 w-3.5" />
                {lang === 'ar' ? 'الرجوع إلى For You' : 'Back to For You'}
              </Link>
              <h1 className="text-lg font-semibold">{lang === 'ar' ? 'تفاصيل المنشور' : 'Post details'}</h1>
            </div>
            {!user && (
              <Link href="/login" className="rounded-full border border-[#c9a75c]/60 px-3 py-1.5 text-xs text-[#f4deae] hover:border-[#c9a75c]">
                {lang === 'ar' ? 'سجّل دخول للتفاعل' : 'Login to interact'}
              </Link>
            )}
          </section>

          {!post && <section className="x-card p-4 text-sm text-white/75">{lang === 'ar' ? 'المنشور غير موجود.' : 'Post not found.'}</section>}

          {post && (
            <section className="space-y-3">
              <PostCard
                post={post}
                postHref={`/posts/${encodeURIComponent(post.id)}`}
                likeState={{ liked: Boolean(post.viewerLiked), likes: Number(post.likes || 0) }}
                repostState={{ reposted: Boolean(post.viewerReposted), reposts: Number(post.reposts || 0) }}
                commentsState={getPostInteractionSummary(post)}
                commentPlaceholder={t.dashboard.social.commentPlaceholder}
                commentSubmitLabel={t.dashboard.social.commentSubmit}
                labels={t.dashboard.social.postMeta}
                onLike={async (targetPost) => {
                  if (!user?.id) return toast(t.dashboard.social.sessionMissing);
                  const result = await togglePostLike(targetPost, user.id);
                  if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                  const loaded = await fetchAllPosts(user.id);
                  setPosts(loaded);
                }}
                onRepost={async (targetPost) => {
                  if (!user?.id) return toast(t.dashboard.social.sessionMissing);
                  const result = await togglePostRepost(targetPost, user.id);
                  if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                  const loaded = await fetchAllPosts(user.id);
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
                  const profile = getProfile(user.id);
                  const result = await addPostComment(targetPost, content, profile, user.id);
                  if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                  const loaded = await fetchAllPosts(user.id);
                  setPosts(loaded);
                  toast(t.dashboard.social.commentSuccess);
                }}
              />
            </section>
          )}
        </main>
      </AppShell>
      <AppBottomNav />
    </>
  );
}
