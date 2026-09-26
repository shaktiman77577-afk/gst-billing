// All bill maths in one place. Money is always in paise (integers).

export type DiscountType = 'pct' | 'amt';

export type LineInput = {
  qty: number;
  ratePaise: number; // price per unit as entered
  rateWithTax: boolean; // true = rate already includes GST
  discountType: DiscountType;
  discountValue: number; // % (e.g. 10) or paise for the whole line
  gstRate: number; // e.g. 18
};

export type LineResult = {
  grossPaise: number; // rate × qty (as entered)
  discountPaise: number;
  taxablePaise: number; // value before GST
  taxPaise: number;
  amountPaise: number; // taxable + tax
};

export function calcLine(line: LineInput, applyGst: boolean): LineResult {
  const rate = applyGst ? line.gstRate : 0;
  const gross = Math.round(line.ratePaise * line.qty);
  let discount =
    line.discountType === 'pct'
      ? Math.round((gross * Math.min(Math.max(line.discountValue, 0), 100)) / 100)
      : Math.round(Math.max(line.discountValue, 0));
  discount = Math.min(discount, Math.max(gross, 0));
  const net = gross - discount;

  let taxable: number;
  let tax: number;
  if (line.rateWithTax) {
    taxable = Math.round((net * 100) / (100 + rate));
    tax = net - taxable;
  } else {
    taxable = net;
    tax = Math.round((net * rate) / 100);
  }
  return { grossPaise: gross, discountPaise: discount, taxablePaise: taxable, taxPaise: tax, amountPaise: taxable + tax };
}

export type TaxRow = { rate: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };

export type BillTotals = {
  lines: LineResult[];
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  chargesPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  taxRows: TaxRow[]; // one row per GST rate (for the tax summary table)
};

export function calcBill(
  lines: LineInput[],
  opts: { applyGst: boolean; isIgst: boolean; chargesPaise: number; roundOff: boolean },
): BillTotals {
  const results = lines.map((l) => calcLine(l, opts.applyGst));
  const byRate = new Map<number, { taxable: number; tax: number }>();
  results.forEach((r, i) => {
    const rate = opts.applyGst ? lines[i].gstRate : 0;
    const g = byRate.get(rate) ?? { taxable: 0, tax: 0 };
    g.taxable += r.taxablePaise;
    g.tax += r.taxPaise;
    byRate.set(rate, g);
  });

  const taxRows: TaxRow[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g]) => {
      if (opts.isIgst) return { rate, taxablePaise: g.taxable, cgstPaise: 0, sgstPaise: 0, igstPaise: g.tax };
      const cgst = Math.round(g.tax / 2);
      return { rate, taxablePaise: g.taxable, cgstPaise: cgst, sgstPaise: g.tax - cgst, igstPaise: 0 };
    });

  const sum = (f: (r: TaxRow) => number) => taxRows.reduce((s, r) => s + f(r), 0);
  const taxable = sum((r) => r.taxablePaise);
  const cgst = sum((r) => r.cgstPaise);
  const sgst = sum((r) => r.sgstPaise);
  const igst = sum((r) => r.igstPaise);
  const tax = cgst + sgst + igst;
  const charges = Math.max(0, Math.round(opts.chargesPaise));
  const beforeRound = taxable + tax + charges;
  const rounded = opts.roundOff ? Math.round(beforeRound / 100) * 100 : beforeRound;

  return {
    lines: results,
    discountPaise: results.reduce((s, r) => s + r.discountPaise, 0),
    taxablePaise: taxable,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    taxPaise: tax,
    chargesPaise: charges,
    roundOffPaise: rounded - beforeRound,
    totalPaise: rounded,
    taxRows,
  };
}

// Financial year label for a YYYY-MM-DD date: 2026-09-26 → "26-27".
export function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  const a = String(start % 100).padStart(2, '0');
  const b = String((start + 1) % 100).padStart(2, '0');
  return `${a}-${b}`;
}

export function invoiceNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${seq}`;
}

// ---- Amount in words (Indian system: thousand, lakh, crore) ----
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

function wholeToWords(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  return [
    crore ? `${wholeToWords(crore)} Crore` : '',
    lakh ? `${twoDigits(lakh)} Lakh` : '',
    thousand ? `${twoDigits(thousand)} Thousand` : '',
    rest ? threeDigits(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function amountInWords(paise: number): string {
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const words = `${wholeToWords(rupees)} ${rupees === 1 ? 'Rupee' : 'Rupees'}${p ? ` and ${twoDigits(p)} Paise` : ''} Only`;
  return paise < 0 ? `Minus ${words}` : words;
}
