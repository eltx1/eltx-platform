import type { Metadata } from 'next';
import SignupContent from './SignupContent';

export const metadata: Metadata = {
  title: 'Sign up | ELTX crypto exchange onboarding',
  description:
    'Create your ELTX account to start trading on the crypto exchange, buy crypto instantly, send global transfers, accept payments, and stake securely.',
  keywords: [
    'ELTX signup',
    'create crypto account',
    'buy crypto instantly',
    'crypto payments gateway',
    'staking account',
    'global transfers',
    'Arabic crypto platform',
  ],
};

export default function SignupPage() {
  return <SignupContent />;
}
