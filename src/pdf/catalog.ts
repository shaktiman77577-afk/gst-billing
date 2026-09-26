// Price-list (catalog) PDF for one-tap WhatsApp sharing: one page of
// ACTIVE items with GST-inclusive sale rates. Pure functions — no React or
// expo imports, so this stays testable like the other pdf builders.
// The PDF bytes are made by the existing sharePdfOnWhatsApp() in ./share.
import { Business } from '../db/businesses';
import { Item } from '../db/items';
import type { StringKey } from '../i18n/strings';
import { formatDate, todayIso } from '../lib/dates';
import { formatPaise } from '../lib/money';

// GST-inclusive sale rate in paise, honouring the item's pricing flag:
// the stored rate is shown as-is when it already includes GST,
// otherwise GST is added and rounded back to paise.
export function catalogInclusiveRate(item: Item): number {
  if (item.sales_price_with_tax) return item.sales_price_paise;
  return Math.round((item.sales_price_paise * (100 + item.gst_rate)) / 100);
}

const esc = (s: string | null | undefined): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// items must be the active, priced, name-sorted rows for this business
// (see the caller in app/(tabs)/items.tsx).
export function catalogHtml(business: Business, items: Item[], t: (key: StringKey) => string): string {
  const rows = items
    .map(
      (item, idx) => `
      <tr>
        <td class="c small muted" style="width:30px">${idx + 1}</td>
        <td>
          <div class="b">${esc(item.name)}</div>
          ${item.hsn ? `<div class="small muted">HSN: ${esc(item.hsn)}</div>` : ''}
        </td>
        <td class="c nowrap">${esc(item.unit)}</td>
        <td class="r b nowrap">${formatPaise(catalogInclusiveRate(item))}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(t('cat_title'))}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Roboto', 'Noto Sans', Arial, sans-serif; font-size: 11px; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; }
  .r { text-align: right; } .c { text-align: center; }
  .b { font-weight: 700; } .muted { color: #6b7280; } .small { font-size: 9.5px; }
  .nowrap { white-space: nowrap; }
  .brand { font-size: 18px; font-weight: 800; color: #111827; }
  .title { font-size: 14px; font-weight: 800; color: #1e3a8a; margin-top: 6px; }
  thead th { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #6b7280;
    border-bottom: 2px solid #1e3a8a; padding: 6px 8px; }
  tbody td { border-bottom: 1px solid #eef2f7; padding: 7px 8px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .footer { margin-top: 10px; text-align: center; font-size: 9px; color: #9ca3af; }
</style></head>
<body>
  <div class="brand">${esc(business.name)}</div>
  ${business.phone ? `<div>Mobile: ${esc(business.phone)}</div>` : ''}
  ${business.gstin ? `<div>GSTIN: ${esc(business.gstin)}</div>` : ''}
  <div class="title">${esc(t('cat_title'))}</div>
  <div class="small muted">${esc(t('cat_asOn').replace('{date}', formatDate(todayIso())))}</div>

  <table style="margin-top:10px">
    <thead><tr>
      <th class="c">#</th>
      <th>${esc(t('cat_item'))}</th>
      <th class="c">${esc(t('cat_unit'))}</th>
      <th class="r">${esc(t('cat_rate'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="small muted" style="margin-top:8px">${esc(t('cat_inclGstNote'))}</div>
  <div class="footer">${esc(t('appName'))}</div>
</body></html>`;
}
