import Hero from '../components/home/Hero';
import ScrollToTopOnLoad from '../components/ScrollToTopOnLoad';
import type { Metadata } from 'next';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'AI Social Media Platform | LordAi.Net',
  description:
    'LordAi.Net combines AI-powered social networking with creator tools, communities, and secure digital services in English and Arabic.',
  keywords: [
    'AI social media platform',
    'social media for creators',
    'bilingual social app',
    'LordAi.Net',
    'AI community platform',
    'منصة تواصل اجتماعي بالذكاء الاصطناعي',
  ],
  alternates: {
    canonical: '/',
    languages: {
      en: '/?lang=en',
      ar: '/?lang=ar',
    },
  },
  openGraph: {
    title: 'LordAi.Net | AI Social Platform',
    description:
      'Join LordAi.Net to post, chat, and build your audience with an AI-powered social platform available in English and Arabic.',
    url: '/',
    type: 'website',
  },
};

export default async function Page() {
  return (
    <main className="flex flex-col">
      <ScrollToTopOnLoad />
      <Hero />
    </main>
  );
}
