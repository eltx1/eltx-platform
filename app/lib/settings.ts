'use client';

const SPOT_SLIPPAGE_KEY = 'spot.defaultSlippageBps';

function parseEnvDefault(): number {
  if (typeof process === 'undefined' || !process.env) return 50;
  const explicit = process.env.NEXT_PUBLIC_SPOT_SLIPPAGE_BPS || process.env.NEXT_PUBLIC_SPOT_DEFAULT_SLIPPAGE_BPS;
  if (!explicit) return 50;
  const parsed = Number.parseInt(explicit, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
}

export function getDefaultSpotSlippageBps(): number {
  if (typeof window === 'undefined') return parseEnvDefault();
  const stored = window.localStorage.getItem(SPOT_SLIPPAGE_KEY);
  if (stored) {
    const parsed = Number.parseInt(stored, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return parseEnvDefault();
}

export function setDefaultSpotSlippageBps(value: number) {
  if (typeof window === 'undefined') return;
  const normalized = Number.isFinite(value) && value >= 0 ? Math.round(value) : parseEnvDefault();
  window.localStorage.setItem(SPOT_SLIPPAGE_KEY, String(normalized));
  window.dispatchEvent(new CustomEvent('spot-slippage-change', { detail: normalized }));
}

export function subscribeSpotSlippage(callback: (value: number) => void) {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<number>;
    const next = typeof custom.detail === 'number' ? custom.detail : getDefaultSpotSlippageBps();
    callback(next);
  };
  window.addEventListener('spot-slippage-change', handler as EventListener);
  return () => window.removeEventListener('spot-slippage-change', handler as EventListener);
}

