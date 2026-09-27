// Tally export strings (phase-2 parity batch).
// The coordinator merges these into src/i18n/strings.ts later — do NOT edit
// strings.ts here. Components read these through a tiny local helper
// (language === 'hi' ? hi : en)[key] instead of t(), because the keys do not
// exist in strings.ts yet.
export const en = {
  tal_title: 'Tally export',
  tal_hint: 'Sales, purchases, payments and expenses as a Tally XML file. Import it via Gateway of Tally > Import Data > Vouchers.',
  tal_export: 'Export for Tally',
  tal_noDataTitle: 'Nothing to export',
  tal_noData: 'No sales, purchases, payments or expenses in this date range.',
  tal_doneTitle: 'Tally file ready',
  tal_done: 'Share the XML file, then import it in Tally: Gateway of Tally > Import Data > Vouchers.',
  tal_failedTitle: 'Export failed',
  tal_failed: 'Could not build the Tally file. Please try again.',
};
export type ParityTallyKey = keyof typeof en;
export const hi: Record<ParityTallyKey, string> = {
  tal_title: 'Tally export',
  tal_hint: 'Sales, purchases, payments aur expenses Tally XML file me. Gateway of Tally > Import Data > Vouchers se import karo.',
  tal_export: 'Tally ke liye export',
  tal_noDataTitle: 'Export karne ko kuch nahi',
  tal_noData: 'Is date range me koi sales, purchases, payments ya expenses nahi hai.',
  tal_doneTitle: 'Tally file taiyaar',
  tal_done: 'XML file share karo, phir Tally me import karo: Gateway of Tally > Import Data > Vouchers.',
  tal_failedTitle: 'Export fail ho gaya',
  tal_failed: 'Tally file nahi ban payi. Dobara try karo.',
};
