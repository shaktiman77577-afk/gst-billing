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

// "1,234.50" or "1234.5" → 123450 paise. Empty/invalid → null.
export function toPaise(text: string): number | null {
  const clean = text.replace(/[,₹\s]/g, '');
  if (!clean) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [rupees, paise = ''] = clean.split('.');
  return Number(rupees) * 100 + Number((paise + '00').slice(0, 2));
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

// Paise → plain editable text for inputs ("1234.5" style, no commas).
export function paiseToInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  const r = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  return p === 0 ? String(r) : `${r}.${String(p).padStart(2, '0')}`;
}

export function formatPaise(paise: number, withSymbol = true): string {
  return formatINR(paise / 100, withSymbol);
}
