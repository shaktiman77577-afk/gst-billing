import qrcode from 'qrcode-generator';

// UPI payment link, e.g. upi://pay?pa=shop@upi&pn=Sharma%20General%20Store&am=1250.00&cu=INR&tn=INV%2F26-27%2F5
export function upiLink(upiId: string, payeeName: string, amountPaise: number, note: string): string {
  const params = [
    `pa=${encodeURIComponent(upiId.trim())}`,
    `pn=${encodeURIComponent(payeeName)}`,
    amountPaise > 0 ? `am=${(amountPaise / 100).toFixed(2)}` : '',
    'cu=INR',
    `tn=${encodeURIComponent(note)}`,
  ].filter(Boolean);
  return `upi://pay?${params.join('&')}`;
}

// QR code as an inline <svg> string ('' if it cannot be made).
export function qrSvg(text: string): string {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag(4, 0);
  } catch {
    return '';
  }
}

// QR code as a data-URL image for React Native <Image> ('' if it cannot be made).
export function qrDataUrl(text: string): string {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 0);
  } catch {
    return '';
  }
}
