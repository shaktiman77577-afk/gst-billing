// Indian number format: 1,23,456.00
export function formatINR(amount: number, withSymbol = true): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, paise] = fixed.split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  const text = paise === '00' ? grouped : `${grouped}.${paise}`;
  return `${amount < 0 ? '-' : ''}${withSymbol ? '₹' : ''}${text}`;
}
