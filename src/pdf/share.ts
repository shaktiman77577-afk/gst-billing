import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { Business } from '../db/businesses';
import { Invoice, InvoiceLine } from '../db/invoices';
import { buildDoc } from './data';
import { renderInvoiceHtml } from './templates';

export function invoiceHtml(business: Business, invoice: Invoice, lines: InvoiceLine[]): string {
  const doc = buildDoc(business, invoice, lines, { color: business.theme_color, showFooter: true });
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
  const { uri } = await Print.printToFileAsync({ html });
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

// Opens WhatsApp chat with the party and a ready message.
export async function whatsappMessage(phone: string, text: string): Promise<void> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  await Linking.openURL(`https://wa.me/91${digits}?text=${encodeURIComponent(text)}`);
}
