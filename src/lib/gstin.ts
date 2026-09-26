const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(value: string): string {
  return value.replace(/\s/g, '').toUpperCase();
}

function checkDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

// Checks the format and the last (check) character.
export function isValidGstin(value: string): boolean {
  const gstin = normalizeGstin(value);
  if (!GSTIN_PATTERN.test(gstin)) return false;
  return checkDigit(gstin.slice(0, 14)) === gstin[14];
}

export function stateCodeFromGstin(gstin: string): string {
  return normalizeGstin(gstin).slice(0, 2);
}

export function panFromGstin(gstin: string): string {
  return normalizeGstin(gstin).slice(2, 12);
}
