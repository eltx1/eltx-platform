import Decimal from "decimal.js";

export function toWeiString(amount: string | number, decimals = 18): string {
  const s = String(amount).trim();
  if (s.includes(".")) return new Decimal(s).mul(new Decimal(10).pow(decimals)).toFixed(0);
  // لو رقم صغير جدًا (مش wei غالبًا) حوّله:
  if (new Decimal(s).lessThan("1000000000000")) return new Decimal(s).mul(new Decimal(10).pow(decimals)).toFixed(0);
  return s; // اعتبره wei بالفعل
}
