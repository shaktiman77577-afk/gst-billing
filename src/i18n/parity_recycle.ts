// Recycle bin / recover-deleted-invoices strings (Worker C).
// Deliberately NOT merged into src/i18n/strings.ts (per task). Screens read
// these directly: `import { parity_recycle } from '../../src/i18n/parity_recycle'`
// then `parity_recycle[language ?? 'en'].rc_title`.
// 'hi' = Hinglish (Hindi in English letters), matching the app's convention.

export const parity_recycle = {
  en: {
    // Settings menu entry
    rc_menuTitle: 'Recover deleted invoices',
    rc_menuHint: 'Restore cancelled bills, credit notes and purchases — or delete them forever',
    // Screen
    rc_title: 'Recycle bin',
    rc_hint: 'Cancelled bills and deleted purchases stay here until you restore or delete them forever.',
    rc_empty: 'Nothing here. Cancelled bills and deleted purchases will show up in this list.',
    rc_sectionInvoices: 'Cancelled bills',
    rc_sectionCreditNotes: 'Cancelled credit notes',
    rc_sectionQuotations: 'Cancelled quotations',
    rc_sectionPurchases: 'Deleted purchases',
    rc_restore: 'Restore',
    rc_deleteForever: 'Delete forever',
    rc_restored: 'Restored. The document is live again.',
    rc_restoreFailed: 'Could not restore. Please try again.',
    // Restore confirmation
    rc_restoreTitle: 'Restore this document?',
    rc_restoreMsg: 'It will become live again and its stock effect will be re-applied.',
    rc_restoreConfirm: 'Restore',
    // Permanent delete: two-step confirmation
    rc_deleteTitle: 'Delete forever?',
    rc_deleteMsg1: 'This permanently removes the document from your phone. This cannot be undone.',
    rc_deleteTitle2: 'Are you really sure?',
    rc_deleteMsg2:
      'Delete {no} forever? Its number can be used again for a new bill after this.',
    rc_deleteConfirm: 'Yes, delete forever',
    rc_deleted: 'Deleted forever.',
    rc_deleteFailed: 'Could not delete. Please try again.',
    // Errors
    rc_notCancelled: 'This document is already live.',
    rc_notDeleted: 'This purchase is not deleted.',
    // Row meta
    rc_paidAdvanceNote: 'Payments received on this bill stay with the party as an advance.',
  },
  hi: {
    // Settings menu entry
    rc_menuTitle: 'Delete kiye bills wapas layein',
    rc_menuHint: 'Cancelled bill, credit note aur purchase restore karein — ya hamesha ke liye delete karein',
    // Screen
    rc_title: 'Recycle bin',
    rc_hint: 'Cancelled bill aur deleted purchase yahan rahenge jab tak aap restore na karein ya hamesha ke liye delete na karein.',
    rc_empty: 'Yahan kuch nahi hai. Cancelled bill aur deleted purchase isi list me dikhenge.',
    rc_sectionInvoices: 'Cancelled bill',
    rc_sectionCreditNotes: 'Cancelled credit notes',
    rc_sectionQuotations: 'Cancelled quotations',
    rc_sectionPurchases: 'Deleted purchases',
    rc_restore: 'Wapas layein',
    rc_deleteForever: 'Hamesha ke liye delete',
    rc_restored: 'Wapas aa gaya. Document phir se live hai.',
    rc_restoreFailed: 'Restore nahi ho paya. Phir se try karein.',
    // Restore confirmation
    rc_restoreTitle: 'Document wapas layein?',
    rc_restoreMsg: 'Ye phir se live ho jayega aur iska stock asar dobara lagega.',
    rc_restoreConfirm: 'Wapas layein',
    // Permanent delete: two-step confirmation
    rc_deleteTitle: 'Hamesha ke liye delete karein?',
    rc_deleteMsg1: 'Ye document phone se hamesha ke liye hat jayega. Ye wapas nahi aa sakta.',
    rc_deleteTitle2: 'Kya aap pakke sure hain?',
    rc_deleteMsg2:
      '{no} ko hamesha ke liye delete karein? Iske baad iska number naye bill ke liye dobara use ho sakta hai.',
    rc_deleteConfirm: 'Haan, hamesha ke liye delete',
    rc_deleted: 'Hamesha ke liye delete ho gaya.',
    rc_deleteFailed: 'Delete nahi ho paya. Phir se try karein.',
    // Errors
    rc_notCancelled: 'Ye document pehle se hi live hai.',
    rc_notDeleted: 'Ye purchase deleted nahi hai.',
    // Row meta
    rc_paidAdvanceNote: 'Is bill par mila paisa party ke advance me hi rahega.',
  },
} as const;

export type RecycleLanguage = keyof typeof parity_recycle; // 'en' | 'hi'
export type RecycleKey = keyof (typeof parity_recycle)['en'];
export type RecycleStrings = (typeof parity_recycle)['en'];
