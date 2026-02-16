import type { Metadata } from 'next';
import LoginContent from './LoginContent';

export const metadata: Metadata = {
  title: 'Login | LordAi.Net social network & crypto services',
  description:
    'Sign in to LordAi.Net to publish posts, chat with creators, and access trading, payments, and staking tools.',
  keywords: [
    'LordAi.Net login',
    'AI social network',
    'crypto exchange sign in',
    'buy crypto',
    'staking platform',
    'global transfers',
    'crypto payments gateway',
    'Arabic crypto platform',
  ],
};

export default function LoginPage() {
  return <LoginContent />;
}
