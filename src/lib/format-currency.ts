export function formatUSD(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return rounded % 1 === 0 ? `$${rounded}` : `$${rounded.toFixed(1)}`;
}
export function formatUSDWithKRW(amount: number, country?: string): string {
  const base = formatUSD(amount);
  if (country === 'KR') return `${base} (₩${Math.round(amount * 1380).toLocaleString()})`;
  return base;
}
