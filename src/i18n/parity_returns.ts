// Worker B (sales return + purchase return) strings. Mirrors src/i18n/strings.ts
// conventions: 'hi' = Hinglish (Hindi in English letters). Do NOT edit
// strings.ts — the coordinator merges these into STRINGS separately.
import type { Language } from './strings';

export const en = {
  // Sales return
  salesReturn: 'Sales return',
  salesReturns: 'Sales returns',
  newSalesReturn: 'New sales return',
  createSalesReturn: 'Create sales return',
  saveSalesReturn: 'Save sales return',
  againstBill: 'Against bill',
  linkBill: 'Link original bill',
  linkBillHint: 'Pick the bill this return is raised against. Returnable quantity is capped at billed minus already returned.',
  changeBill: 'Change bill',
  noBillsToLink: 'No bills found to link',
  salesReturnHint: 'Goods returned by the customer. Stock comes back in and the party balance is reduced.',
  overReturn: 'Return quantity is more than what can be returned',
  errNothingReturnedSR: 'Enter a return quantity for at least one item',
  savedSalesReturn: 'Sales return saved',

  // Purchase return
  purchaseReturn: 'Purchase return',
  purchaseReturns: 'Purchase returns',
  newPurchaseReturn: 'New purchase return',
  createPurchaseReturn: 'Create purchase return',
  savePurchaseReturn: 'Save purchase return',
  againstPurchase: 'Against purchase',
  linkPurchase: 'Link original purchase',
  linkPurchaseHint: 'Pick the purchase this return is raised against.',
  changePurchase: 'Change purchase',
  noPurchasesToLink: 'No purchases found to link',
  purchaseReturnHint: 'Goods sent back to the supplier. Stock goes out; it is not counted in kharid totals.',
  errNothingReturnedPR: 'Enter a return quantity for at least one item',
  returnNo: 'Return no.',
  savedPurchaseReturn: 'Purchase return saved',

  // Shared
  returnItems: 'Items to return',
} as const;

export type ParityReturnsKey = keyof typeof en;

export const hi: Record<ParityReturnsKey, string> = {
  // Sales return
  salesReturn: 'Sales return',
  salesReturns: 'Sales returns',
  newSalesReturn: 'New sales return',
  createSalesReturn: 'Sales return banao',
  saveSalesReturn: 'Sales return save karo',
  againstBill: 'Bill ke against',
  linkBill: 'Original bill jodo',
  linkBillHint: 'Wo bill chuno jis ke against return ban raha hai. Return quantity billed minus pehle se returned se zyada nahi ho sakti.',
  changeBill: 'Bill badlo',
  noBillsToLink: 'Jodne ke liye koi bill nahi mila',
  salesReturnHint: 'Customer ne samaan wapas kiya. Stock wapas aayega aur party ka balance kam hoga.',
  overReturn: 'Return quantity wapas ho sakne wali quantity se zyada hai',
  errNothingReturnedSR: 'Kam se kam ek item ki return quantity daalo',
  savedSalesReturn: 'Sales return save ho gaya',

  // Purchase return
  purchaseReturn: 'Purchase return',
  purchaseReturns: 'Purchase returns',
  newPurchaseReturn: 'New purchase return',
  createPurchaseReturn: 'Purchase return banao',
  savePurchaseReturn: 'Purchase return save karo',
  againstPurchase: 'Purchase ke against',
  linkPurchase: 'Original purchase jodo',
  linkPurchaseHint: 'Wo purchase chuno jis ke against return ban raha hai.',
  changePurchase: 'Purchase badlo',
  noPurchasesToLink: 'Jodne ke liye koi purchase nahi mili',
  purchaseReturnHint: 'Supplier ko samaan wapas bheja. Stock bahar jayega; kharid total me count nahi hoga.',
  errNothingReturnedPR: 'Kam se kam ek item ki return quantity daalo',
  returnNo: 'Return no.',
  savedPurchaseReturn: 'Purchase return save ho gaya',

  // Shared
  returnItems: 'Wapas karne wale items',
};

/** Shape the coordinator merges into STRINGS: { en: {...}, hi: {...} }. */
export const parityReturns = { en, hi };

/** Typed lookup for the returns strings, given the app language. */
export function trReturns(lang: Language | null | undefined, key: ParityReturnsKey): string {
  return parityReturns[lang ?? 'en'][key];
}
