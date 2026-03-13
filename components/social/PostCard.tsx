'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Eye, Heart, MessageCircle, Repeat2, Send, Share2, ShieldCheck } from 'lucide-react';
import type { SocialComment, SocialPost } from '../../app/lib/social-store';
import { dict, useLang } from '../../app/lib/i18n';
import { useToast } from '../../app/lib/toast';

type PostCardProps = {
  post: SocialPost;
  likeState?: { liked: boolean; likes: number };
  repostState?: { reposted: boolean; reposts: number };
  commentsState?: { comments: number; commentsList: SocialComment[] };
  onLike?: (post: SocialPost) => void;
  onRepost?: (post: SocialPost) => void;
  onComment?: (post: SocialPost, content: string) => void;
  commentPlaceholder?: string;
  commentSubmitLabel?: string;
  onViewed?: (post: SocialPost) => void;
  labels?: {
    trustHigh?: string;
    trustTrusted?: string;
    trustGrowing?: string;
    trustNew?: string;
    followers?: string;
    mediaAlt?: string;
    share?: string;
    shareSuccess?: string;
    openPost?: string;
  };
  postHref?: string;
};

export default function PostCard({
  post,
  likeState,
  repostState,
  commentsState,
  onLike,
  onRepost,
  onComment,
  commentPlaceholder = 'Write a comment',
  commentSubmitLabel = 'Reply',
  onViewed,
  labels,
  postHref,
}: PostCardProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = dict[lang];
  const toast = useToast();
  const [openComposer, setOpenComposer] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [localLikeState, setLocalLikeState] = useState({ liked: false, likes: post.likes });
  const [localRepostState, setLocalRepostState] = useState({ reposted: false, reposts: post.reposts });
  const [localCommentsState, setLocalCommentsState] = useState<{ comments: number; commentsList: SocialComment[] }>({
    comments: post.comments,
    commentsList: [],
  });

  useEffect(() => {
    setLocalLikeState({ liked: false, likes: post.likes });
    setLocalRepostState({ reposted: false, reposts: post.reposts });
    setLocalCommentsState({ comments: post.comments, commentsList: [] });
  }, [post.id, post.likes, post.reposts, post.comments]);

  const effectiveLikeState = likeState ?? localLikeState;
  const effectiveRepostState = repostState ?? localRepostState;
  const effectiveCommentsState = commentsState ?? localCommentsState;


  const trustLevel = useMemo(() => {
    const followers = post.authorFollowers || 0;
    if (followers >= 5000) return labels?.trustHigh || (lang === 'ar' ? 'ثقة عالية' : 'High trust');
    if (followers >= 1000) return labels?.trustTrusted || (lang === 'ar' ? 'موثوق' : 'Trusted');
    if (followers >= 200) return labels?.trustGrowing || (lang === 'ar' ? 'في نمو' : 'Growing');
    return labels?.trustNew || (lang === 'ar' ? 'صانع محتوى جديد' : 'New creator');
  }, [labels?.trustGrowing, labels?.trustHigh, labels?.trustNew, labels?.trustTrusted, lang, post.authorFollowers]);

  const isExternalMedia = useMemo(() => {
    const value = String(post.imageUrl || '').trim();
    if (!value) return false;
    return /^https?:\/\//i.test(value) || value.startsWith('data:image/');
  }, [post.imageUrl]);

  const dateLabel = useMemo(() => {
    try {
      return new Date(post.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US');
    } catch {
      return post.createdAt;
    }
  }, [lang, post.createdAt]);

  const profileHref = `/creators/${encodeURIComponent(post.handle.replace(/^@/, '').trim())}`;
  const resolvedPostHref = postHref || `/posts/${encodeURIComponent(post.id)}`;

  const articleRef = useRef<HTMLElement | null>(null);
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    viewTrackedRef.current = false;
  }, [post.id]);

  useEffect(() => {
    const node = articleRef.current;
    if (!node || !onViewed) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting && !viewTrackedRef.current && !viewTimerRef.current) {
        viewTimerRef.current = setTimeout(() => {
          if (!viewTrackedRef.current) {
            onViewed(post);
            viewTrackedRef.current = true;
          }
          viewTimerRef.current = null;
        }, 5000);
      }
      if (!entry.isIntersecting && viewTimerRef.current) {
        clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    }, { threshold: 0.65 });

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    };
  }, [onViewed, post]);

  return (
    <article
      ref={articleRef}
      className="cursor-pointer rounded-3xl border border-[#2f3336] bg-black p-4 space-y-3 transition hover:bg-[#121417]"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        router.push(resolvedPostHref);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        event.preventDefault();
        router.push(resolvedPostHref);
      }}
      role="link"
      tabIndex={0}
      aria-label={labels?.openPost || (lang === 'ar' ? 'فتح المنشور' : 'Open post')}
    >
      <div className="flex items-start gap-3">
        <Link href={profileHref} className="h-10 w-10 overflow-hidden rounded-full border border-[#2f3336] bg-[#111] transition hover:border-[#c9a75c]/60">
          <Image src={post.avatarUrl || '/assets/img/logo-new.svg'} alt={post.authorName} width={40} height={40} className="h-full w-full object-cover" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={profileHref} className="font-semibold text-white underline-offset-2 hover:underline">{post.authorName}</Link>
            {post.isPremium && <BadgeCheck className="h-4 w-4 text-sky-400" aria-label={lang === 'ar' ? 'عضو موثق' : 'Verified premium member'} />}
            <Link href={profileHref} className="text-white/60 underline-offset-2 hover:text-white/80 hover:underline">{post.handle}</Link>
            <span className="text-white/40">•</span>
            <span className="text-white/50 text-xs">{dateLabel}</span>
          </div>
          <p className="mt-2 text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{post.content}</p>
          {post.imageUrl && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-[#2f3336]">
              {isExternalMedia ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.imageUrl}
                  alt={labels?.mediaAlt || (lang === 'ar' ? 'وسائط المنشور' : 'Post media')}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Image src={post.imageUrl} alt={labels?.mediaAlt || (lang === 'ar' ? 'وسائط المنشور' : 'Post media')} width={680} height={380} className="h-auto w-full object-cover" />
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-white/60">
        <button
          className={`inline-flex items-center gap-2 transition ${effectiveLikeState.liked ? 'text-rose-300' : 'hover:text-[#f91880]'}`}
          onClick={() => {
            if (onLike) {
              onLike(post);
              return;
            }
            setLocalLikeState((prev) => ({
              liked: !prev.liked,
              likes: prev.likes + (prev.liked ? -1 : 1),
            }));
          }}
          aria-pressed={Boolean(effectiveLikeState.liked)}
        >
          <Heart className="h-4 w-4" />
          <span>{effectiveLikeState.likes}</span>
        </button>
        <button
          className="inline-flex items-center gap-2 hover:text-[#c9a75c] transition"
          onClick={() => setOpenComposer((prev) => !prev)}
        >
          <MessageCircle className="h-4 w-4" />
          <span>{effectiveCommentsState.comments}</span>
        </button>
        <button
          className={`inline-flex items-center gap-2 transition ${effectiveRepostState.reposted ? 'text-emerald-400' : 'hover:text-[#00ba7c]'}`}
          onClick={() => {
            if (onRepost) {
              onRepost(post);
              return;
            }
            setLocalRepostState((prev) => ({
              reposted: !prev.reposted,
              reposts: prev.reposts + (prev.reposted ? -1 : 1),
            }));
          }}
        >
          <Repeat2 className="h-4 w-4" />
          <span>{effectiveRepostState.reposts}</span>
        </button>
        <button
          className="inline-flex items-center gap-2 transition hover:text-[#1d9bf0]"
          onClick={async () => {
            const shareUrl = `${window.location.origin}${resolvedPostHref}`;
            if (navigator.share) {
              try {
                await navigator.share({ url: shareUrl, title: post.authorName, text: post.content.slice(0, 120) });
                return;
              } catch {
                return;
              }
            }
            await navigator.clipboard.writeText(shareUrl);
            toast(labels?.shareSuccess || (lang === 'ar' ? 'تم نسخ رابط المنشور' : 'Post link copied'));
          }}
          aria-label={labels?.share || (lang === 'ar' ? 'مشاركة المنشور' : 'Share post')}
          title={labels?.share || (lang === 'ar' ? 'مشاركة المنشور' : 'Share post')}
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>


      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-[#0d0f12] px-3 py-2 text-[11px] text-white/65">
        <span className="inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />{post.views}</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />{trustLevel}</span>
        <span>
          {(post.authorFollowers || 0).toLocaleString()}{' '}
          {labels?.followers || (lang === 'ar' ? 'متابع' : 'followers')}
        </span>
      </div>

      {openComposer && (
        <div className="space-y-3 rounded-2xl border border-[#2f3336] bg-[#0d0f12] p-3">
          <div className="flex items-center gap-2">
            <input
              className="x-input flex-1 px-3 py-2 text-xs placeholder:text-white/40"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder={commentPlaceholder}
            />
            <button
              className="btn btn-primary px-3 py-2 text-xs"
              onClick={() => {
                const normalizedDraft = commentDraft.trim();
                if (!normalizedDraft) return;

                if (onComment) {
                  onComment(post, normalizedDraft);
                } else {
                  setLocalCommentsState((prev) => ({
                    comments: prev.comments + 1,
                    commentsList: [
                      {
                        id: `local-comment-${Date.now()}`,
                        postId: post.id,
                        authorName: 'You',
                        handle: '@you',
                        content: normalizedDraft,
                        createdAt: new Date().toISOString(),
                      },
                      ...prev.commentsList,
                    ],
                  }));
                }
                setCommentDraft('');
              }}
            >
              <Send className="h-3.5 w-3.5" />
              {commentSubmitLabel}
            </button>
          </div>

          <div className="space-y-2">
            {effectiveCommentsState.commentsList?.map((comment) => (
              <div key={comment.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <p className="text-xs font-semibold text-white">{comment.authorName} <span className="text-white/50">{comment.handle}</span></p>
                <p className="mt-1 text-xs text-white/80 whitespace-pre-wrap">{comment.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
