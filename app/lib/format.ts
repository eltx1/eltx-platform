export function formatWei(wei: string | null | undefined, decimals: number, precision = 6): string {
  if (!wei) return '0';
  try {
    const normalized = wei.toString();
    const sanitized = normalized.includes('.') ? normalized.split('.')[0] : normalized;
    const value = BigInt(sanitized);
    const base = 10n ** BigInt(decimals);
    const integer = value / base;
    let fraction = (value % base).toString().padStart(decimals, '0');
    if (precision >= 0) {
      fraction = fraction.slice(0, precision).replace(/0+$/, '');
    } else {
      fraction = fraction.replace(/0+$/, '');
    }
    return fraction ? `${integer}.${fraction}` : integer.toString();
  } catch {
    return '0';
  }
}
