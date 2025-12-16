import type { Metadata } from 'next';
import LoginContent from './LoginContent';

export const metadata: Metadata = {
  title: 'Login | ELTX crypto exchange & payments platform',
  description:
    'Sign in to ELTX to access crypto exchange tools, buy crypto, send global transfers, accept payments, and stake assets securely.',
  keywords: [
    'ELTX login',
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
