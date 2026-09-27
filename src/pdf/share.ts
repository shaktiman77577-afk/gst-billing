import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';
import { Business } from '../db/businesses';
import { Invoice, InvoiceLine } from '../db/invoices';
import { CopyKind, buildDoc } from './data';
import { renderInvoiceHtml } from './templates';

export type InvoiceHtmlOpts = {
  isPro?: boolean; // white-label footer (no "Made with GST Billing" branding)
  copy?: CopyKind; // ORIGINAL / DUPLICATE / TRIPLICATE header label
  footerLinkText?: string; // small linked footer text for Pro users without a logo
};

export function invoiceHtml(
  business: Business,
  invoice: Invoice,
  lines: InvoiceLine[],
  opts: InvoiceHtmlOpts = {},
): string {
  const doc = buildDoc(business, invoice, lines, { color: business.theme_color, showFooter: true, ...opts });
  return renderInvoiceHtml(doc, business.template);
}

// For the in-app preview: lay the page out at A4 width, then let WebView zoom to fit.
export function forPreview(html: string): string {
  return html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    '<meta name="viewport" content="width=820"/>',
  );
}

async function makePdf(html: string, invoiceNo: string): Promise<string> {
  // A4 in points (595 × 842). Without this Android makes US Letter pages.
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // Give the file a readable name like INV-26-27-5.pdf (shown in WhatsApp).
  try {
    const name = `${invoiceNo.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
    const src = new File(uri);
    const dest = new File(Paths.cache, name);
    if (dest.exists) dest.delete();
    src.move(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

export async function sharePdf(html: string, invoiceNo: string): Promise<void> {
  const uri = await makePdf(html, invoiceNo);
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: invoiceNo });
}

export async function printBill(html: string): Promise<void> {
  await Print.printAsync({ html });
}

// One-tap share: opens WhatsApp directly with the bill PDF attached.
// When a phone number is given, the party's chat opens straight away
// (via WhatsApp's "jid" extra). The caption rides along as the message.
// Falls back to the system share sheet when WhatsApp isn't installed
// or the direct intent fails for any reason.
export async function sharePdfOnWhatsApp(
  html: string,
  invoiceNo: string,
  phone?: string | null,
  caption?: string,
): Promise<void> {
  const uri = await makePdf(html, invoiceNo);
  if (Platform.OS === 'android') {
    try {
      const file = new File(uri);
      const contentUri = (file as { contentUri?: string }).contentUri ?? uri;
      const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
      await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
        type: 'application/pdf',
        packageName: 'com.whatsapp',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION — lets WhatsApp read the PDF
        extra: {
          'android.intent.extra.STREAM': contentUri,
          ...(caption ? { 'android.intent.extra.TEXT': caption } : {}),
          ...(digits ? { jid: `91${digits}@s.whatsapp.net` } : {}),
        },
      });
      return;
    } catch {
      // WhatsApp not installed or intent failed — fall through to the share sheet.
    }
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: invoiceNo });
}

// Builds the "your bill is ready" caption sent along with the PDF.
export function billWhatsappText(
  t: (key: string) => string,
  p: { name: string; no: string; date: string; amount: string; balance?: string; business?: string },
): string {
  let text = t('waMessage')
    .replace('{name}', p.name)
    .replace('{no}', p.no)
    .replace('{date}', p.date)
    .replace('{amount}', p.amount);
  if (p.balance) text += `\n${t('waBalance').replace('{balance}', p.balance)}`;
  if (p.business) text += `\n\n– ${p.business}`;
  return text;
}

// Opens WhatsApp chat with the party and a ready message.
export async function whatsappMessage(phone: string, text: string): Promise<void> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  await Linking.openURL(`https://wa.me/91${digits}?text=${encodeURIComponent(text)}`);
}
