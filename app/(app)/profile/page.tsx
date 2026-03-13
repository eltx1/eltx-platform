'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { dict, useLang } from '../../lib/i18n';
import { BadgeCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import PostCard from '../../../components/social/PostCard';
import { addPostComment, fetchAllPosts, getPostInteractionSummary, getProfile, togglePostLike, togglePostRepost, type SocialPost, type SocialProfile } from '../../lib/social-store';
import { useToast } from '../../lib/toast';

function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export default function ProfilePage() {
  const { lang } = useLang();
  const { user } = useAuth();
  const t = dict[lang];
  const toast = useToast();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      const loaded = await fetchAllPosts(user.id);
      if (!cancelled) setPosts(loaded);
    };
    setProfile(getProfile(user.id, user));
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user]);

  const userPosts = useMemo(() => {
    if (!profile) return [];
    const currentUserHandle = normalizeHandle(profile.handle);
    return posts.filter((post) => normalizeHandle(post.handle) === currentUserHandle);
  }, [posts, profile]);

  if (!profile) {
    return null;
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-4xl">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden border border-white/10 bg-white/10">
            <Image src={profile.avatarUrl} alt={profile.publicName} width={64} height={64} className="h-full w-full object-cover" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold flex items-center gap-2">{profile.publicName}{user?.is_premium ? <BadgeCheck className="h-5 w-5 text-sky-400" /> : null}</h1>
            <p className="text-sm text-white/60">{profile.handle}</p>
          </div>
        </div>
        <p className="text-sm text-white/70">{profile.bio}</p>
        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          {t.dashboard.social.profileBadges.map((badge) => (
            <span key={badge} className="rounded-full border border-white/10 px-3 py-1">
              {badge}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/profile/edit" className="btn btn-primary px-4 py-2 text-xs">
            {t.dashboard.cards.editProfile.title}
          </Link>
          <Link href="/posts/new" className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/10">
            {t.dashboard.social.newPostCta}
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t.dashboard.social.forYouTitle}</h2>
        {userPosts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            {t.dashboard.social.profileEmpty}
          </div>
        ) : (
          userPosts.map((post) => {
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
                }}
                onComment={async (targetPost, content) => {
                  if (!user?.id) return toast(t.dashboard.social.sessionMissing);
                  if (!content.trim()) return toast(t.dashboard.social.commentEmpty);
                  const result = await addPostComment(targetPost, content, profile, user.id);
                  if (!result.ok) return toast(t.dashboard.social.quickPostStorageError);
                  const loaded = await fetchAllPosts(user?.id);
                  setPosts(loaded);
                  toast(t.dashboard.social.commentSuccess);
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
