import Decimal from 'decimal.js';

export const ZERO = new Decimal(0);

export function trimDecimal(value: string): string {
  if (!value) return '0';
  if (!value.includes('.')) return value;
  const trimmed = value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return normalized.length ? normalized : '0';
}

export function safeDecimal(value: string | number | null | undefined): Decimal {
  try {
    if (value === null || value === undefined) return ZERO;
    const normalized = typeof value === 'string' && value.trim() === '' ? '0' : value;
    return new Decimal(normalized as Decimal.Value);
  } catch {
    return ZERO;
  }
}

export function formatWithPrecision(value: Decimal, precision: number): string {
  const places = Math.min(Math.max(0, precision), 8);
  return trimDecimal(value.toFixed(places, Decimal.ROUND_DOWN));
}
