// Five bill designs. Each returns a complete HTML page (A4) for printing / PDF.
import { Doc } from './data';
import { PLAY_STORE_URL } from '../lib/config';

export type TemplateId = 'simple' | 'stylish' | 'luxury' | 'advance' | 'tally';

export const TEMPLATES: { id: TemplateId; name: string; premium: boolean }[] = [
  { id: 'simple', name: 'Simple', premium: false },
  { id: 'stylish', name: 'Stylish', premium: false },
  { id: 'luxury', name: 'Luxury', premium: true },
  { id: 'advance', name: 'Advance GST', premium: true },
  { id: 'tally', name: 'Advance GST (Tally)', premium: true },
];

export const THEME_COLORS = ['#111827', '#3F7D20', '#1E3A8A', '#0E6BA8', '#7E22CE', '#B91C1C', '#4F46E5', '#B7791F'];

// ---------- shared pieces ----------

const BASE_CSS = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Roboto', 'Noto Sans', Arial, sans-serif; font-size: 11px; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; }
  .r { text-align: right; } .c { text-align: center; }
  .b { font-weight: 700; } .muted { color: #6b7280; } .small { font-size: 9.5px; }
  .nowrap { white-space: nowrap; }
  .logo { max-width: 110px; max-height: 70px; object-fit: contain; }
  .sign { max-width: 150px; max-height: 55px; object-fit: contain; }
  .qr svg { width: 92px; height: 92px; }
  .footer { margin-top: auto; padding-top: 10px; text-align: center; font-size: 9px; color: #9ca3af; }
  .sheet { display: flex; flex-direction: column; min-height: 272mm; }
  .grow { flex: 1; display: flex; flex-direction: column; }
  .grow > table { table-layout: fixed; }
  .grow > table.fillt { flex: 1; }
  .page { position: relative; }
  .void { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 110px; font-weight: 900;
    color: rgba(220, 38, 38, 0.16); transform: rotate(-24deg); letter-spacing: 8px; z-index: 10; pointer-events: none; }
`;

function footerHtml(d: Doc): string {
  if (!d.showFooter) return '';
  const link = (inner: string) =>
    `<a href="${PLAY_STORE_URL}" style="color:#9ca3af;text-decoration:none">${inner}</a>`;
  // Pro (white-label): business logo as a linked image; small linked text when no logo.
  if (d.isPro && d.seller.logo)
    return `<div class="footer">${link(
      `<img src="${d.seller.logo}" style="height:30px;max-width:180px;object-fit:contain" alt=""/>`,
    )}</div>`;
  if (d.isPro) return `<div class="footer">${link(d.footerLinkText)}</div>`;
  // Free: existing branding, now a link too.
  return `<div class="footer">${link('Invoice created using <b>GST Billing</b> · Made with 🤎 in India')}</div>`;
}

function page(title: string, css: string, body: string, d: Doc): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title><style>${BASE_CSS}${css}</style></head>
<body><div class="page sheet">${d.cancelled ? '<div class="void">CANCELLED</div>' : ''}${body}${footerHtml(d)}</div></body></html>`;
}

const line = (label: string, value: string) => (value ? `<div><span class="muted">${label}</span> ${value}</div>` : '');

function sellerBlock(d: Doc, nameStyle = '') {
  const s = d.seller;
  return `
    <div class="b" style="font-size:17px;${nameStyle}">${s.name}</div>
    ${s.tagline ? `<div class="muted">${s.tagline}</div>` : ''}
    ${s.address ? `<div>${s.address}</div>` : ''}
    <div>${[s.gstin ? `<b>GSTIN:</b> ${s.gstin}` : '', s.pan ? `<b>PAN:</b> ${s.pan}` : ''].filter(Boolean).join(' &nbsp; ')}</div>
    ${s.phone ? `<div><b>Mobile:</b> ${s.phone}</div>` : ''}`;
}

function buyerBlock(d: Doc, heading = 'BILL TO') {
  const b = d.buyer;
  return `
    <div class="small b muted">${heading}</div>
    <div class="b" style="font-size:13px">${b.name}</div>
    ${b.address ? `<div>${b.address}</div>` : ''}
    ${b.phone ? `<div><b>Mobile:</b> ${b.phone}</div>` : ''}
    ${b.gstin ? `<div><b>GSTIN:</b> ${b.gstin}</div>` : ''}
    ${d.applyGst ? `<div><b>Place of Supply:</b> ${d.meta.placeOfSupply}</div>` : ''}`;
}

function shipBlock(d: Doc) {
  const addr = d.buyer.shipping || d.buyer.address;
  if (!addr) return '';
  return `<div class="small b muted">SHIP TO</div><div class="b">${d.buyer.name}</div><div>${addr}</div>`;
}

function metaItems(d: Doc): [string, string][] {
  const m = d.meta;
  return (
    [
      [d.isCreditNote ? 'Credit Note No.' : 'Invoice No.', m.invoiceNo],
      [d.isCreditNote ? 'Date' : 'Invoice Date', m.date],
      ['Against Invoice', m.refNo],
      ['Due Date', m.dueDate],
      ['P.O. No.', m.poNo],
      ['Vehicle No.', m.vehicleNo],
    ] as [string, string][]
  ).filter(([, v]) => v);
}

function totalsRows(d: Doc, opts: { strongColor?: string } = {}) {
  const t = d.totals;
  const rows: string[] = [];
  const row = (l: string, v: string, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r nowrap">${v}</td></tr>`;
  rows.push(row('Taxable Amount', t.taxable));
  if (t.discountRaw > 0) rows.push(row('Discount', `- ${t.discount}`, 'muted'));
  d.taxLines.forEach((x) => rows.push(row(x.label, x.amount)));
  if (t.chargesRaw > 0) rows.push(row(t.chargesLabel, t.charges));
  if (t.roundOffRaw !== 0) rows.push(row('Round Off', t.roundOff));
  rows.push(
    `<tr class="grand"><td class="b">Total Amount</td><td class="r b nowrap" style="${
      opts.strongColor ? `color:${opts.strongColor}` : ''
    }">${t.total}</td></tr>`,
  );
  if (d.isCreditNote) {
    if (t.receivedRaw > 0) rows.push(row('Refund Paid', t.received));
  } else if (t.receivedRaw > 0 || t.creditedRaw > 0) {
    if (t.receivedRaw > 0) rows.push(row('Received Amount', t.received));
    if (t.creditedRaw > 0) rows.push(row('Credit Note', `- ${t.credited}`));
    rows.push(row('Balance Due', t.balance, 'b'));
  }
  return rows.join('');
}

function bankBlock(d: Doc) {
  const k = d.bank;
  if (!k && !d.qr) return '';
  return `
    <table class="bankq"><tr>
      ${
        k
          ? `<td><div class="b" style="margin-bottom:3px">Bank Details</div>
        <table class="kv">
          <tr><td class="muted">Name</td><td>${k.name}</td></tr>
          ${k.accountNo ? `<tr><td class="muted">Account No.</td><td>${k.accountNo}</td></tr>` : ''}
          ${k.ifsc ? `<tr><td class="muted">IFSC</td><td>${k.ifsc}</td></tr>` : ''}
          ${k.bankName ? `<tr><td class="muted">Bank</td><td>${k.bankName}</td></tr>` : ''}
        </table></td>`
          : ''
      }
      ${
        d.qr
          ? `<td style="width:110px" class="c"><div class="qr">${d.qr}</div>
        <div class="small muted">Scan to pay (UPI)</div><div class="small">${d.upiId}</div></td>`
          : ''
      }
    </tr></table>`;
}

function termsBlock(d: Doc) {
  return `
    ${d.notes ? `<div class="b">Notes</div><div style="margin-bottom:6px">${d.notes}</div>` : ''}
    ${
      d.terms.length
        ? `<div class="b">Terms &amp; Conditions</div><ol class="terms">${d.terms.map((x) => `<li>${x}</li>`).join('')}</ol>`
        : ''
    }`;
}

function signBlock(d: Doc, boxed = false) {
  return `<div class="c sign-wrap" style="${boxed ? 'border:1px solid #d1d5db;border-radius:8px;padding:8px;' : ''}">
    <div style="height:58px;display:flex;align-items:flex-end;justify-content:center">
      ${d.seller.signature ? `<img class="sign" src="${d.seller.signature}"/>` : ''}
    </div>
    <div class="small b">Authorised Signatory</div>
    <div class="small">For ${d.seller.name}</div>
  </div>`;
}

function hsnTable(d: Doc, border: string) {
  if (!d.applyGst) return '';
  const head = d.isIgst
    ? `<th>HSN/SAC</th><th class="r">Taxable Value</th><th class="r">IGST Rate</th><th class="r">IGST Amount</th><th class="r">Total Tax</th>`
    : `<th>HSN/SAC</th><th class="r">Taxable Value</th><th class="r">CGST Rate</th><th class="r">CGST Amt</th><th class="r">SGST Rate</th><th class="r">SGST Amt</th><th class="r">Total Tax</th>`;
  const rows = d.hsn
    .map((h) =>
      d.isIgst
        ? `<tr><td>${h.hsn}</td><td class="r">${h.taxable}</td><td class="r">${h.rate}</td><td class="r">${h.igst}</td><td class="r">${h.tax}</td></tr>`
        : `<tr><td>${h.hsn}</td><td class="r">${h.taxable}</td><td class="r">${h.rate}</td><td class="r">${h.cgst}</td><td class="r">${h.rate}</td><td class="r">${h.sgst}</td><td class="r">${h.tax}</td></tr>`,
    )
    .join('');
  return `<table class="hsn" style="margin-top:8px"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
  <style>.hsn th,.hsn td{border:1px solid ${border};padding:4px 6px;font-size:10px}.hsn th{background:${d.tint}}</style>`;
}

// ---------- 1. Simple ----------
function simple(d: Doc): string {
  const css = `
    .top { border-top: 5px solid ${d.color}; padding-top: 12px; }
    .title { color:${d.color}; font-size: 20px; font-weight: 800; letter-spacing: 1px; }
    .tag { display:inline-block; border:1px solid #9ca3af; color:#6b7280; font-size:9px; padding:1px 6px; margin-top:4px; }
    .meta td { padding: 2px 0; }
    .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
    .items th { background: ${d.tint}; color: ${d.color}; text-transform: uppercase; font-size: 9.5px; padding: 7px 6px; border-bottom: 2px solid ${d.color}; }
    .items td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; }
    .sum td { padding: 4px 0; } .sum .grand td { border-top: 2px solid ${d.color}; padding-top: 7px; font-size: 14px; }
    .kv td { padding: 1px 8px 1px 0; } .terms { margin: 2px 0 0 16px; padding: 0; }
  `;
  const gstCols = d.applyGst;
  const body = `
  <div class="top"><table><tr>
    <td style="width:${d.seller.logo ? '120px' : '0'}">${d.seller.logo ? `<img class="logo" src="${d.seller.logo}"/>` : ''}</td>
    <td>${sellerBlock(d)}</td>
    <td class="r" style="width:190px"><div class="title">${d.title}</div><div class="tag">${d.copyLabel}</div>
      <table class="meta" style="margin-top:8px">${metaItems(d)
        .map(([k, v]) => `<tr><td class="muted">${k}</td><td class="r b">${v}</td></tr>`)
        .join('')}</table></td>
  </tr></table></div>
  <table style="margin-top:12px"><tr>
    <td class="box" style="width:50%">${buyerBlock(d)}</td>
    ${shipBlock(d) ? `<td style="width:10px"></td><td class="box">${shipBlock(d)}</td>` : '<td></td>'}
  </tr></table>
  <table class="items" style="margin-top:12px"><thead><tr>
    <th class="c" style="width:28px">#</th><th style="text-align:left">Item</th>
    ${gstCols ? '<th>HSN</th>' : ''}<th class="r">Qty</th><th class="r">Rate</th>
    ${gstCols ? '<th class="r">GST</th>' : ''}<th class="r">Amount</th></tr></thead><tbody>
    ${d.lines
      .map(
        (l) => `<tr><td class="c">${l.sno}</td><td><div class="b">${l.name}</div>${
          l.discount ? `<div class="small muted">Disc. ${l.discountPct || '₹' + l.discount}</div>` : ''
        }</td>${gstCols ? `<td class="c">${l.hsn}</td>` : ''}<td class="r nowrap">${l.qty}</td><td class="r">${l.rate}</td>${
          gstCols ? `<td class="r">${l.gstRate}</td>` : ''
        }<td class="r b">${l.amount}</td></tr>`,
      )
      .join('')}
  </tbody></table>
  <table style="margin-top:10px"><tr>
    <td style="width:55%;padding-right:16px">
      <div class="b">Amount in words</div><div style="margin-bottom:8px">${d.totals.words}</div>
      ${bankBlock(d)}<div style="margin-top:8px">${termsBlock(d)}</div>
    </td>
    <td><table class="sum">${totalsRows(d, { strongColor: d.color })}</table>
      <div style="margin-top:18px">${signBlock(d)}</div></td>
  </tr></table>`;
  return page(d.meta.invoiceNo, css, body, d);
}

// ---------- 2. Stylish ----------
function stylish(d: Doc): string {
  const css = `
    .band { background: ${d.color}; color: #fff; border-radius: 10px; padding: 16px 18px; }
    .band .muted { color: rgba(255,255,255,0.8); }
    .band .logo { background:#fff; border-radius:8px; padding:4px; }
    .title { font-size: 22px; font-weight: 800; letter-spacing: 2px; }
    .pill { display:inline-block; background: rgba(255,255,255,0.18); padding: 2px 8px; border-radius: 10px; font-size: 9px; }
    .cards td.card { background: ${d.tint}; border-radius: 8px; padding: 10px 12px; }
    .items th { color: #6b7280; font-size: 9.5px; text-transform: uppercase; padding: 8px 6px; border-bottom: 1px solid #d1d5db; }
    .items td { padding: 8px 6px; border-bottom: 1px dashed #e5e7eb; }
    .sum td { padding: 4px 0; }
    .sum .grand td { background: ${d.color}; color: #fff !important; padding: 8px 10px; font-size: 14px; }
    .sum .grand td:first-child { border-radius: 6px 0 0 6px; } .sum .grand td:last-child { border-radius: 0 6px 6px 0; }
    .kv td { padding: 1px 8px 1px 0; } .terms { margin: 2px 0 0 16px; padding: 0; }
  `;
  const meta = metaItems(d);
  const body = `
  <div class="band"><table><tr>
    ${d.seller.logo ? `<td style="width:100px"><img class="logo" src="${d.seller.logo}"/></td>` : ''}
    <td>${sellerBlock(d, 'color:#fff;font-size:19px')}</td>
    <td class="r" style="width:180px"><div class="title">${d.title}</div><div class="pill">${d.copyLabel}</div></td>
  </tr></table></div>
  <table class="cards" style="margin-top:12px;border-collapse:separate;border-spacing:8px 0;margin-left:-8px;width:calc(100% + 16px)"><tr>
    <td class="card" style="width:50%">${buyerBlock(d)}${shipBlock(d) ? `<div style="margin-top:6px">${shipBlock(d)}</div>` : ''}</td>
    <td class="card"><table>${meta
      .map(([k, v]) => `<tr><td class="muted" style="padding:2px 0">${k}</td><td class="r b">${v}</td></tr>`)
      .join('')}</table></td>
  </tr></table>
  <table class="items" style="margin-top:12px"><thead><tr>
    <th class="c" style="width:28px">No</th><th style="text-align:left">Items</th>
    ${d.applyGst ? '<th>HSN</th>' : ''}<th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc.</th>
    ${d.applyGst ? '<th class="r">Tax</th>' : ''}<th class="r">Total</th></tr></thead><tbody>
    ${d.lines
      .map(
        (l) => `<tr><td class="c">${l.sno}</td><td class="b">${l.name}</td>${d.applyGst ? `<td class="c">${l.hsn}</td>` : ''}
        <td class="r nowrap">${l.qty}</td><td class="r">${l.rate}</td>
        <td class="r">${l.discount ? `${l.discount}${l.discountPct ? `<div class="small muted">(${l.discountPct})</div>` : ''}` : '-'}</td>
        ${d.applyGst ? `<td class="r">${l.tax}<div class="small muted">(${l.gstRate})</div></td>` : ''}
        <td class="r b">${l.amount}</td></tr>`,
      )
      .join('')}
  </tbody></table>
  <table style="margin-top:12px"><tr>
    <td style="width:55%;padding-right:16px">${termsBlock(d)}<div style="margin-top:8px">${bankBlock(d)}</div></td>
    <td><table class="sum">${totalsRows(d)}</table>
      <div class="small muted" style="margin-top:6px">Total amount (in words)</div><div class="small b">${d.totals.words}</div>
      <div style="margin-top:14px">${signBlock(d, true)}</div></td>
  </tr></table>`;
  return page(d.meta.invoiceNo, css, body, d);
}

// ---------- 3. Luxury ----------
function luxury(d: Doc): string {
  const gold = '#C9A646';
  const css = `
    .frame { border: 2px solid ${gold}; outline: 1px solid ${gold}; outline-offset: -7px; padding: 18px 20px; min-height: 265mm; position: relative; }
    .corner { position:absolute; width:26px; height:26px; border-color:${gold}; border-style:solid; }
    .tl{top:10px;left:10px;border-width:2px 0 0 2px}.tr{top:10px;right:10px;border-width:2px 2px 0 0}
    .bl{bottom:10px;left:10px;border-width:0 0 2px 2px}.br{bottom:10px;right:10px;border-width:0 2px 2px 0}
    .serif { font-family: 'Noto Serif', Georgia, 'Times New Roman', serif; }
    .title { font-size: 15px; letter-spacing: 3px; color: ${d.color}; font-weight: 700; }
    .tag { display:inline-block; border:1px solid ${gold}; color:#6b7280; font-size:8.5px; padding:1px 6px; margin-top:4px; }
    .rule { border-top: 1px solid ${gold}; margin: 12px 0; }
    .items th { background: ${d.tint}; font-size: 9.5px; padding: 7px 5px; color:#374151; }
    .items td { padding: 7px 5px; border-bottom: 1px solid #efe7cf; }
    .sum td { padding: 3px 0; } .sum .grand td { border-top: 1px solid ${gold}; border-bottom: 1px solid ${gold}; padding: 7px 0; font-size: 14px; }
    .kv td { padding: 1px 8px 1px 0; } .terms { margin: 2px 0 0 16px; padding: 0; }
  `;
  const body = `<div class="frame">
  <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
  <table><tr>
    ${d.seller.logo ? `<td style="width:120px"><img class="logo" src="${d.seller.logo}"/></td>` : ''}
    <td>${sellerBlock(d, `font-family:'Noto Serif',Georgia,serif;font-size:21px;letter-spacing:1px;color:${d.color};text-transform:uppercase`)}</td>
    <td class="r" style="width:170px"><div class="title serif">${d.title}</div><div class="tag">${d.copyLabel}</div></td>
  </tr></table>
  <div class="rule"></div>
  <table><tr>${metaItems(d)
    .map(([k, v]) => `<td><div class="b small">${k}</div><div>${v}</div></td>`)
    .join('')}</tr></table>
  <div class="rule"></div>
  <table><tr><td style="width:50%">${buyerBlock(d, 'Bill To')}</td><td>${shipBlock(d)}</td></tr></table>
  <table class="items" style="margin-top:12px"><thead><tr>
    <th class="c">No</th><th style="text-align:left">Items</th>${d.applyGst ? '<th>HSN</th>' : ''}
    <th class="r">Qty.</th><th class="r">Rate</th><th class="r">Disc.</th>${d.applyGst ? '<th class="r">Tax</th>' : ''}<th class="r">Total</th>
  </tr></thead><tbody>${d.lines
    .map(
      (l) => `<tr><td class="c">${l.sno}</td><td>${l.name}</td>${d.applyGst ? `<td class="c">${l.hsn}</td>` : ''}
      <td class="r nowrap">${l.qty}</td><td class="r">${l.rate}</td><td class="r">${l.discount || '-'}${
        l.discountPct ? `<div class="small muted">(${l.discountPct})</div>` : ''
      }</td>${d.applyGst ? `<td class="r">${l.tax}<div class="small muted">(${l.gstRate})</div></td>` : ''}<td class="r b">${l.amount}</td></tr>`,
    )
    .join('')}</tbody></table>
  <table style="margin-top:12px"><tr>
    <td style="width:52%;padding-right:18px">${termsBlock(d)}<div style="margin-top:10px">${bankBlock(d)}</div></td>
    <td><table class="sum serif">${totalsRows(d, { strongColor: d.color })}</table>
      <div class="small b" style="margin-top:8px">Total Amount (in words)</div><div class="small">${d.totals.words}</div>
      <div style="margin-top:14px;border:1px solid ${gold};border-radius:8px;padding:6px">${signBlock(d)}</div></td>
  </tr></table></div>`;
  return page(d.meta.invoiceNo, css, body, d);
}

// ---------- 4. Advance GST (full grid) ----------
function gridCss(d: Doc) {
  return `
    .grid { border: 1px solid #111; }
    .grid td, .grid th { border: 1px solid #111; padding: 4px 6px; }
    .grid th { background: ${d.tint}; font-size: 9.5px; text-transform: uppercase; }
    .items td { border-top: none; border-bottom: none; }
    .items td { overflow-wrap: anywhere; }
    .items tr.tot td { border-top: 1px solid #111; background: ${d.tint}; font-weight: 700; }
    .head-title { color: ${d.color}; }
    .kv td { border: none !important; padding: 1px 8px 1px 0 !important; } .terms { margin: 2px 0 0 16px; padding: 0; }
    .noborder td { border: none !important; }
    .bankq td { border: none !important; padding: 0 !important; }
  `;
}

function gridHeader(d: Doc) {
  const m = d.meta;
  const cell = (k: string, v: string) =>
    `<td class="c" style="padding:6px 4px"><div class="b">${k}</div><div>${v || '--'}</div></td>`;
  const ship = shipBlock(d);
  return `
  <table class="noborder" style="margin-bottom:6px"><tr>
    <td><span class="b" style="font-size:13px">${d.title}</span>
      <span style="border:1px solid #9ca3af;color:#6b7280;font-size:9px;padding:1px 6px;margin-left:8px">${d.copyLabel}</span></td>
    ${d.seller.tagline ? `<td class="r b" style="color:${d.color}">${d.seller.tagline}</td>` : ''}
  </tr></table>
  <table class="grid"><tr>
    <td style="width:50%" rowspan="2"><table class="noborder"><tr>
      ${d.seller.logo ? `<td style="width:90px"><img class="logo" style="max-width:80px" src="${d.seller.logo}"/></td>` : ''}
      <td>${sellerBlock(d, `font-size:15px;color:${d.color};text-transform:uppercase`)}</td></tr></table></td>
    <td style="padding:0"><table class="noborder"><tr>
      ${cell(d.isCreditNote ? 'Credit Note No.' : 'Invoice No.', m.invoiceNo)}
      ${cell(d.isCreditNote ? 'Date' : 'Invoice Date', m.date)}
      ${d.isCreditNote ? cell('Against Invoice', m.refNo) : ''}
    </tr></table></td></tr>
    <tr><td style="padding:0"><table class="noborder"><tr>
      ${cell('P.O. No.', m.poNo)}${cell('Vehicle No.', m.vehicleNo)}${cell('Due Date', m.dueDate)}
    </tr></table></td></tr>
    <tr>${ship ? `<td>${buyerBlock(d)}</td><td>${ship}</td>` : `<td colspan="2">${buyerBlock(d)}</td>`}</tr>
  </table>`;
}

// Terms/notes + bank/QR side by side (bank cell only when there is something to show).
function gridBottom(d: Doc, leftExtra = '') {
  const bank = bankBlock(d);
  return `<table class="grid" style="border-top:none"><tr>
    <td ${bank ? 'style="width:50%"' : 'colspan="2"'}>${termsBlock(d)}</td>${bank ? `<td>${bank}</td>` : ''}</tr>
    <tr><td class="small muted" style="width:50%">${leftExtra}</td><td>${signBlock(d)}</td></tr></table>`;
}

// Items table in three parts sharing the same column widths:
// rows | empty space that stretches to fill the page | totals.
function stretchTable(widths: number[], head: string, rows: string, tail: string) {
  const cols = `<colgroup>${widths.map((w) => `<col style="width:${w}%"/>`).join('')}</colgroup>`;
  const empty = `<tr>${widths.map(() => '<td></td>').join('')}</tr>`;
  return `<div class="grow">
    <table class="grid items" style="border-top:none;border-bottom:none">${cols}<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <table class="grid items fillt" style="border-top:none;border-bottom:none">${cols}<tbody>${empty}</tbody></table>
    <table class="grid items" style="border-top:none">${cols}<tbody>${tail}</tbody></table>
  </div>`;
}

function discCell(l: Doc['lines'][number]) {
  return `<td class="r">${l.discount || '-'}${l.discountPct ? `<div class="small muted">(${l.discountPct})</div>` : ''}</td>`;
}

// ---------- 4. Advance GST (full grid) ----------
function advance(d: Doc): string {
  const g = d.applyGst;
  const widths = g ? [6, 27, 9, 9, 9, 9, 10, 7, 14] : [7, 43, 12, 12, 12, 14];
  const n = widths.length;
  const head = `<th>S.No.</th><th>Items</th>${g ? '<th>HSN</th>' : ''}<th>Qty.</th><th>Rate</th><th>Disc.</th>${
    g ? '<th>Tax</th><th>GST %</th>' : ''
  }<th>Amount</th>`;
  const rows = d.lines
    .map(
      (l) => `<tr><td class="c">${l.sno}</td><td>${l.name}</td>${g ? `<td class="c">${l.hsn}</td>` : ''}
      <td class="r nowrap">${l.qty}</td><td class="r">${l.rate}</td>${discCell(l)}${
        g ? `<td class="r">${l.tax}</td><td class="c">${l.gstRate}</td>` : ''
      }<td class="r">${l.amount}</td></tr>`,
    )
    .join('');
  const extra = (label: string, value: string) =>
    `<tr><td></td><td class="r"><i>${label}</i></td>${'<td></td>'.repeat(n - 3)}<td class="r">${value}</td></tr>`;
  const tail = `
    ${d.totals.chargesRaw > 0 ? extra(d.totals.chargesLabel, d.totals.charges) : ''}
    ${d.totals.roundOffRaw !== 0 ? extra('Round Off', d.totals.roundOff) : ''}
    <tr class="tot"><td></td><td class="r">TOTAL</td>${g ? '<td></td>' : ''}<td class="r">${d.totalQty}</td><td></td>
      <td class="r">${d.totals.discountRaw ? d.totals.discount : ''}</td>${g ? `<td class="r">${d.totals.taxTotal}</td><td></td>` : ''}
      <td class="r">${d.totals.total}</td></tr>
    ${
      d.totals.receivedRaw > 0
        ? `<tr class="tot"><td></td><td class="r">${d.isCreditNote ? 'REFUND PAID' : 'RECEIVED AMOUNT'}</td>${'<td></td>'.repeat(
            n - 3,
          )}<td class="r">${d.totals.received}</td></tr>`
        : ''
    }`;
  const body = `${gridHeader(d)}
  ${stretchTable(widths, head, rows, tail)}
  ${hsnTable(d, '#111')}
  <table class="grid" style="margin-top:8px"><tr><td><span class="b">Total Amount (in words):</span> ${d.totals.words}</td>
    ${
      !d.isCreditNote && (d.totals.receivedRaw > 0 || d.totals.creditedRaw > 0)
        ? `<td class="r nowrap" style="width:200px">Balance Due: <b>${d.totals.balance}</b></td>`
        : ''
    }</tr></table>
  ${gridBottom(d)}`;
  return page(d.meta.invoiceNo, gridCss(d), body, d);
}

// ---------- 5. Advance GST (Tally style: taxes as rows in the item table) ----------
function tally(d: Doc): string {
  const g = d.applyGst;
  const widths = g ? [6, 36, 11, 11, 11, 11, 14] : [7, 43, 12, 12, 12, 14];
  const n = widths.length;
  const head = `<th>S.No.</th><th>Items</th>${g ? '<th>HSN</th>' : ''}<th>Qty.</th><th>Rate</th><th>Disc.</th><th>Amount</th>`;
  const rows = d.lines
    .map(
      (l) => `<tr><td class="c">${l.sno}</td><td>${l.name}</td>${g ? `<td class="c">${l.hsn}</td>` : ''}
      <td class="r nowrap">${l.qty}</td><td class="r">${l.rate}</td>${discCell(l)}<td class="r">${l.taxable}</td></tr>`,
    )
    .join('');
  const extra = (label: string, value: string) =>
    `<tr><td></td><td class="r"><i>${label}</i></td>${'<td></td>'.repeat(n - 3)}<td class="r">${value}</td></tr>`;
  const tail = `
    ${d.totals.chargesRaw > 0 ? extra(d.totals.chargesLabel, d.totals.charges) : ''}
    ${d.taxLines.map((x) => extra(x.label, x.amount)).join('')}
    ${d.totals.roundOffRaw !== 0 ? extra('Round Off', d.totals.roundOff) : ''}
    <tr class="tot"><td></td><td class="r">TOTAL</td>${g ? '<td></td>' : ''}<td class="r">${d.totalQty}</td><td></td>
      <td class="r">${d.totals.discountRaw ? d.totals.discount : ''}</td><td class="r">${d.totals.total}</td></tr>`;
  const body = `${gridHeader(d)}
  ${stretchTable(widths, head, rows, tail)}
  ${hsnTable(d, '#111')}
  <table class="grid" style="margin-top:8px"><tr><td><span class="b">Total Amount (in words):</span> ${d.totals.words}</td>
    ${
      !d.isCreditNote && (d.totals.receivedRaw > 0 || d.totals.creditedRaw > 0)
        ? `<td class="r nowrap" style="width:220px">Received: <b>${d.totals.received}</b><br/>Balance: <b>${d.totals.balance}</b></td>`
        : ''
    }</tr></table>
  ${gridBottom(
    d,
    'Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  )}`;
  return page(d.meta.invoiceNo, gridCss(d), body, d);
}

export function renderInvoiceHtml(d: Doc, template: string): string {
  switch (template) {
    case 'stylish':
      return stylish(d);
    case 'luxury':
      return luxury(d);
    case 'advance':
      return advance(d);
    case 'tally':
      return tally(d);
    default:
      return simple(d);
  }
}
