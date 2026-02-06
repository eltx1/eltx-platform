'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react';
import type { SocialPost } from '../../app/lib/social-store';
import { useToast } from '../../app/lib/toast';

export default function PostCard({ post }: { post: SocialPost }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likes);
  const [comments, setComments] = useState(post.comments);
  const [reposts, setReposts] = useState(post.reposts);
  const toast = useToast();

  const dateLabel = useMemo(() => {
    try {
      return new Date(post.createdAt).toLocaleString();
    } catch {
      return post.createdAt;
    }
  }, [post.createdAt]);

  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full overflow-hidden bg-white/10">
          <Image src={post.avatarUrl || '/assets/img/logo.jpeg'} alt={post.authorName} width={40} height={40} className="h-full w-full object-cover" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{post.authorName}</span>
            <span className="text-white/60">{post.handle}</span>
            <span className="text-white/40">•</span>
            <span className="text-white/50 text-xs">{dateLabel}</span>
          </div>
          <p className="mt-2 text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{post.content}</p>
          {post.imageUrl && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
              <Image src={post.imageUrl} alt="Post media" width={680} height={380} className="h-auto w-full object-cover" />
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6 text-xs text-white/60">
        <button
          className={`inline-flex items-center gap-2 transition ${liked ? 'text-rose-300' : 'hover:text-white'}`}
          onClick={() => {
            setLiked((prev) => !prev);
            setLikes((prev) => (liked ? Math.max(0, prev - 1) : prev + 1));
          }}
          aria-pressed={liked}
        >
          <Heart className="h-4 w-4" />
          <span>{likes}</span>
        </button>
        <button
          className="inline-flex items-center gap-2 hover:text-white transition"
          onClick={() => {
            setComments((prev) => prev + 1);
            toast('Comment added (demo).');
          }}
        >
          <MessageCircle className="h-4 w-4" />
          <span>{comments}</span>
        </button>
        <button
          className="inline-flex items-center gap-2 hover:text-white transition"
          onClick={() => {
            setReposts((prev) => prev + 1);
            toast('Repost shared on your profile (demo).');
          }}
        >
          <Repeat2 className="h-4 w-4" />
          <span>{reposts}</span>
        </button>
      </div>
    </article>
  );
}
