import type { Metadata } from 'next';
import { Suspense } from 'react';
import SignupContent from './SignupContent';

export const metadata: Metadata = {
  title: 'Sign up | LordAi.Net social network onboarding',
  description:
    'Create your LordAi.Net account to publish posts, chat with friends, and trade, stake, and send payments securely.',
  keywords: [
    'LordAi.Net signup',
    'AI social network',
    'create crypto account',
    'buy crypto instantly',
    'crypto payments gateway',
    'staking account',
    'global transfers',
    'Arabic crypto platform',
  ],
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
