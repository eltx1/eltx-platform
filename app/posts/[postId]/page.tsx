import type { Metadata } from 'next';
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
  const jsonLd = post ? buildPostJsonLd(post, getBaseUrl()) : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <PostDetailsClient postId={decodedPostId} />
    </>
  );
}
