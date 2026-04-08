import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostDetailsClient from './PostDetailsClient';
import { getPublicSocialPostById } from '../../lib/social-posts.server';
import { buildPostJsonLd, buildPostMetadata } from '../../lib/post-seo';
import { getBaseUrl } from '../../lib/seo.server';

export async function generateMetadata({ params }: { params: { postId: string } }): Promise<Metadata> {
  const post = await getPublicSocialPostById(decodeURIComponent(params.postId || ''));
  if (!post) {
    return {
      title: 'Post details',
      description: 'View this public post on LordAi.Net.',
      alternates: {
        canonical: `${getBaseUrl()}/posts/${encodeURIComponent(params.postId || '')}`,
      },
      robots: { index: false, follow: true },
    };
  }

  return buildPostMetadata(post, getBaseUrl());
}

export default async function PostDetailsPage({ params }: { params: { postId: string } }) {
  const decodedPostId = decodeURIComponent(params.postId || '');
  const post = await getPublicSocialPostById(decodedPostId);
  if (!post) {
    notFound();
  }

  const jsonLd = buildPostJsonLd(post, getBaseUrl());
  const initialPost = {
    ...post,
    likes: 0,
    comments: 0,
    reposts: 0,
    views: 0,
    authorFollowers: 0,
    authorPremiumFollowers: 0,
    isFollowed: false,
    isPremium: false,
    viewerLiked: false,
    viewerReposted: false,
    commentsList: [],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PostDetailsClient postId={decodedPostId} initialPost={initialPost} />
    </>
  );
}
