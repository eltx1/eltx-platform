'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { dict, useLang } from '../../../lib/i18n';
import { getAllPosts, getProfile, getPostInteractionSummary } from '../../../lib/social-store';

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
  const decodedRouteHandle = decodeURIComponent(params.handle || '');
  const normalizedRouteHandle = normalizeHandle(decodedRouteHandle);

  const creatorData = useMemo(() => {
    const posts = getAllPosts(user?.id);
    const byCreator = posts.filter((post) => normalizeHandle(post.handle) === normalizedRouteHandle);
    const latestPost = byCreator[0] || null;

    if (!latestPost) return null;

    const aggregate = byCreator.reduce(
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
      bio: lang === 'ar' ? 'كريتور نشط على LordAI.' : 'Active creator on LordAI.',
      followers: latestPost.authorFollowers || 0,
      postsCount: byCreator.length,
      ...aggregate,
    };
  }, [lang, normalizedRouteHandle, user?.id]);

  const selfProfile = getProfile(user?.id);
  const isOwnProfile = normalizeHandle(selfProfile.handle) === normalizedRouteHandle;

  if (!creatorData) {
    return (
      <section className="x-card p-5 text-sm text-white/70">
        {lang === 'ar' ? 'لم نعثر على هذا الكريتور.' : 'Creator profile not found.'}
      </section>
    );
  }

  return (
    <section className="x-card space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 overflow-hidden rounded-full border border-[#2f3336] bg-[#111]">
            <Image src={creatorData.avatarUrl} alt={creatorData.authorName} width={56} height={56} className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{creatorData.authorName}</h1>
            <p className="text-sm text-white/60">{creatorData.handle}</p>
          </div>
        </div>

        {!isOwnProfile && (
          <Link
            href={`/messages?compose=${encodeURIComponent(creatorData.handle.replace('@', ''))}`}
            className="inline-flex items-center gap-2 rounded-full border border-[#c9a75c]/50 bg-[#c9a75c]/10 px-3 py-2 text-xs font-semibold text-[#f4deae] transition hover:bg-[#c9a75c]/20"
          >
            <MessageCircle className="h-4 w-4" />
            {lang === 'ar' ? 'مراسلة' : 'Message'}
          </Link>
        )}
      </div>

      <p className="text-sm text-white/75">{creatorData.bio}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><p className="text-white/50">{lang === 'ar' ? 'المتابعين' : 'Followers'}</p><p className="mt-1 text-sm font-semibold">{creatorData.followers.toLocaleString()}</p></div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><p className="text-white/50">{lang === 'ar' ? 'المنشورات' : 'Posts'}</p><p className="mt-1 text-sm font-semibold">{creatorData.postsCount}</p></div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><p className="text-white/50">{lang === 'ar' ? 'اللايكات' : 'Likes'}</p><p className="mt-1 text-sm font-semibold">{creatorData.likes}</p></div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><p className="text-white/50">{lang === 'ar' ? 'التعليقات' : 'Comments'}</p><p className="mt-1 text-sm font-semibold">{creatorData.comments}</p></div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><p className="text-white/50">{lang === 'ar' ? 'الريبوست' : 'Reposts'}</p><p className="mt-1 text-sm font-semibold">{creatorData.reposts}</p></div>
      </div>

      <div className="text-xs text-white/60">{isOwnProfile ? t.dashboard.cards.editProfile.title : (lang === 'ar' ? 'ادخل الرسائل للتواصل مع الكريتور.' : 'Go to Messages to start chatting with this creator.')}</div>
    </section>
  );
}
