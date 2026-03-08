'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Bell, Link2, MessageCircle, Search } from 'lucide-react';
import PostCard from '../../../../components/social/PostCard';
import { useAuth } from '../../../lib/auth';
import { dict, useLang } from '../../../lib/i18n';
import {
  addPostComment,
  getAllPosts,
  getPostInteractionSummary,
  getProfile,
  isFollowingHandle,
  toggleFollowHandle,
  togglePostLike,
  togglePostRepost,
  type SocialPost,
  type SocialProfile,
} from '../../../lib/social-store';
import { useToast } from '../../../lib/toast';

type CreatorProfilePageProps = {
  params: { handle: string };
};

function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export default function CreatorProfilePage({ params }: CreatorProfilePageProps) {
  const { user } = useAuth();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const decodedRouteHandle = decodeURIComponent(params.handle || '');
  const normalizedRouteHandle = normalizeHandle(decodedRouteHandle);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'media'>('posts');

  useEffect(() => {
    setPosts(getAllPosts(user?.id));
    setProfile(getProfile(user?.id));
  }, [user?.id]);

  const creatorPosts = useMemo(
    () => posts.filter((post) => normalizeHandle(post.handle) === normalizedRouteHandle),
    [posts, normalizedRouteHandle]
  );

  const creatorData = useMemo(() => {
    const latestPost = creatorPosts[0] || null;
    if (!latestPost) return null;

    const aggregate = creatorPosts.reduce(
      (acc, post) => {
        const summary = getPostInteractionSummary(post, user?.id);
        acc.likes += summary.likes;
        acc.comments += summary.comments;
        acc.reposts += summary.reposts;
        return acc;
      },
      { likes: 0, comments: 0, reposts: 0 }
    );

    return {
      handle: latestPost.handle,
      authorName: latestPost.authorName,
      avatarUrl: latestPost.avatarUrl || '/assets/img/logo-new.svg',
      bio: lang === 'ar'
        ? 'كريتور نشط على LordAI. انضم علشان تتابع البوستات أول بأول.'
        : 'Active creator on LordAI. Follow to keep up with every update.',
      followers: latestPost.authorFollowers || 0,
      postsCount: creatorPosts.length,
      followFallback: Boolean(latestPost.isFollowed),
      ...aggregate,
    };
  }, [creatorPosts, lang, user?.id]);

  const isOwnProfile = Boolean(profile) && normalizeHandle(profile.handle) === normalizedRouteHandle;
  const isFollowing = creatorData
    ? isFollowingHandle(creatorData.handle, creatorData.followFallback, user?.id)
    : false;

  const postsWithMedia = creatorPosts.filter((post) => Boolean(post.imageUrl));
  const shownPosts = activeTab === 'posts' ? creatorPosts : postsWithMedia;

  if (!creatorData) {
    return (
      <section className="x-card p-5 text-sm text-white/70">
        {lang === 'ar' ? 'لم نعثر على هذا الكريتور.' : 'Creator profile not found.'}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-[#2f3336] bg-black">
        <div className="h-36 bg-[radial-gradient(circle_at_top,_#334155,_#0a0a0a_65%)] p-4">
          <div className="flex items-center justify-between">
            <Link href="/social" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/85 hover:bg-black/70">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/85 hover:bg-black/70"><Search className="h-4 w-4" /></button>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/85 hover:bg-black/70"><Bell className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-black bg-[#111]">
              <Image src={creatorData.avatarUrl} alt={creatorData.authorName} width={96} height={96} className="h-full w-full object-cover" />
            </div>

            {!isOwnProfile && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/messages?compose=${encodeURIComponent(creatorData.handle.replace('@', ''))}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#2f3336] text-white/85 hover:border-[#c9a75c]/60"
                >
                  <MessageCircle className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const result = toggleFollowHandle(creatorData.handle, creatorData.followFallback, user?.id);
                    if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                    setPosts(getAllPosts(user?.id));
                    toast(result.isFollowed
                      ? (lang === 'ar' ? 'تمت المتابعة بنجاح.' : 'Following successfully.')
                      : (lang === 'ar' ? 'تم إلغاء المتابعة.' : 'Unfollowed successfully.'));
                  }}
                  className={`inline-flex min-w-28 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isFollowing
                      ? 'border border-[#2f3336] text-white hover:border-rose-400/70 hover:text-rose-300'
                      : 'bg-white text-black hover:bg-white/90'
                  }`}
                >
                  {isFollowing ? (lang === 'ar' ? 'إلغاء المتابعة' : 'Following') : (lang === 'ar' ? 'متابعة' : 'Follow')}
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <h1 className="text-xl font-bold text-white">{creatorData.authorName}</h1>
            <p className="text-sm text-white/60">{creatorData.handle}</p>
            <p className="text-sm text-white/80">{creatorData.bio}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/75">
              <span>
                <strong className="text-white">{creatorData.postsCount}</strong> {lang === 'ar' ? 'منشور' : 'Posts'}
              </span>
              <span>
                <strong className="text-white">{creatorData.followers.toLocaleString()}</strong> {lang === 'ar' ? 'متابع' : 'Followers'}
              </span>
              <span className="inline-flex items-center gap-1 text-white/55">
                <Link2 className="h-3.5 w-3.5" /> lordai.net/{creatorData.handle.replace('@', '')}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-[#2f3336]">
          <div className="grid grid-cols-2 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('posts')}
              className={`px-4 py-3 font-semibold transition ${activeTab === 'posts' ? 'border-b-2 border-[#1d9bf0] text-white' : 'text-white/60 hover:text-white'}`}
            >
              {lang === 'ar' ? 'المنشورات' : 'Posts'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('media')}
              className={`px-4 py-3 font-semibold transition ${activeTab === 'media' ? 'border-b-2 border-[#1d9bf0] text-white' : 'text-white/60 hover:text-white'}`}
            >
              {lang === 'ar' ? 'الصور والفيديو' : 'Media'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {shownPosts.length === 0 ? (
          <div className="x-card p-5 text-sm text-white/70">
            {activeTab === 'posts'
              ? (lang === 'ar' ? 'لا توجد منشورات حتى الآن.' : 'No posts yet.')
              : (lang === 'ar' ? 'لا يوجد ميديا لهذا الحساب.' : 'No media posts yet.')}
          </div>
        ) : (
          shownPosts.map((post) => {
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
                labels={t.dashboard.social.postMeta}
                onLike={(targetPost) => {
                  const result = togglePostLike(targetPost, user?.id);
                  if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                  setPosts((prev) => [...prev]);
                }}
                onRepost={(targetPost) => {
                  const result = togglePostRepost(targetPost, user?.id);
                  if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                  setPosts((prev) => [...prev]);
                }}
                onComment={(targetPost, content) => {
                  if (!profile || !user?.id) return toast(t.dashboard.social.sessionMissing);
                  if (!content.trim()) return toast(t.dashboard.social.commentEmpty);
                  const result = addPostComment(targetPost, content, profile, user.id);
                  if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                  setPosts((prev) => [...prev]);
                  toast(t.dashboard.social.commentSuccess);
                }}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
