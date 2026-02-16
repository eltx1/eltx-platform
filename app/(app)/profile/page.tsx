'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { dict, useLang } from '../../lib/i18n';
import PostCard from '../../../components/social/PostCard';
import { getAllPosts, getProfile, type SocialPost, type SocialProfile } from '../../lib/social-store';

export default function ProfilePage() {
  const { lang } = useLang();
  const t = dict[lang];
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);

  useEffect(() => {
    setProfile(getProfile());
    setPosts(getAllPosts());
  }, []);

  const userPosts = useMemo(() => {
    if (!profile) return [];
    return posts.filter((post) => post.handle === profile.handle);
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
            <h1 className="text-xl font-semibold">{profile.publicName}</h1>
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
          userPosts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </div>
  );
}
