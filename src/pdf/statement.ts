// Party statement (khata) as a simple A4 PDF — shared from the party ledger.
import type { Business } from '../db/businesses';
import type { LedgerEntry } from '../db/invoices';
import type { Party } from '../db/parties';
import { formatDate } from '../lib/dates';
import { formatPaise } from '../lib/money';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/**
 * `entries` oldest first. `label` turns an entry into its row title
 * (the same wording the app shows). Amounts: + = bill (party owes more),
 * − = payment / return.
 */
export function statementHtml(
  business: Business,
  party: Party,
  entries: LedgerEntry[],
  balance: number,
  label: (e: LedgerEntry) => string,
  words: { title: string; entry: string; debit: string; credit: string; balance: string; closing: string; toCollect: string; toPay: string },
): string {
  const rows = entries
    .map((e) => {
      const up = e.amount_paise > 0;
      const amt = e.amount_paise === 0 ? '' : formatPaise(Math.abs(e.amount_paise));
      return `<tr${e.cancelled ? ' class="x"' : ''}>
        <td>${esc(formatDate(e.date))}</td>
        <td>${esc(label(e))}</td>
        <td class="n">${up ? amt : ''}</td>
        <td class="n">${up ? '' : amt}</td>
        <td class="n b">${formatPaise(e.balance_paise)}</td>
      </tr>`;
    })
    .join('');
  const closingLabel = balance >= 0 ? words.toCollect : words.toPay;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Helvetica', 'Arial', sans-serif; color: #0F172A; font-size: 11px; }
  .top { display: flex; justify-content: space-between; border-bottom: 2px solid #1E3A8A; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 16px; margin: 0; } h2 { font-size: 13px; margin: 0; color: #1E3A8A; letter-spacing: 1px; }
  .muted { color: #5B6472; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1E3A8A; color: #fff; font-weight: 600; text-align: left; padding: 6px; font-size: 10px; }
  td { padding: 6px; border-bottom: 1px solid #E5E7EB; }
  .n { text-align: right; font-variant-numeric: tabular-nums; } .b { font-weight: 600; }
  tr.x td { color: #8A94A3; text-decoration: line-through; }
  .close { margin-top: 12px; display: flex; justify-content: flex-end; }
  .close div { background: #F1F3F6; border-radius: 6px; padding: 8px 12px; font-size: 13px; font-weight: 700; }
</style></head><body>
  <div class="top">
    <div><h1>${esc(business.name)}</h1>${business.gstin ? `<div class="muted">GSTIN ${esc(business.gstin)}</div>` : ''}</div>
    <div style="text-align:right"><h2>${esc(words.title)}</h2><div class="muted">${esc(formatDate(new Date().toISOString().slice(0, 10)))}</div></div>
  </div>
  <div style="margin-bottom:12px"><div class="b" style="font-size:13px">${esc(party.name)}</div>
    ${party.gstin ? `<div class="muted">GSTIN ${esc(party.gstin)}</div>` : ''}${party.phone ? `<div class="muted">${esc(party.phone)}</div>` : ''}</div>
  <table><thead><tr><th>Date</th><th>${esc(words.entry)}</th><th class="n">${esc(words.debit)}</th><th class="n">${esc(words.credit)}</th><th class="n">${esc(words.balance)}</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="close"><div>${esc(words.closing)} · ${esc(closingLabel)}: ${formatPaise(Math.abs(balance))}</div></div>
</body></html>`;
}
