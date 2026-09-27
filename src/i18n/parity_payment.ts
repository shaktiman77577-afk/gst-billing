// Dashboard quick-payment strings (Worker D, 2026-09-27).
// Do NOT edit src/i18n/strings.ts — this module is merged at runtime by the
// screens that need it, keyed off useApp().language.
export const parityPayment = {
  en: {
    receivePayment: 'Received Payment',
    paymentOutAction: 'Payment Out',
    chooseParty: 'Select party',
    errSelectParty: 'Please select a party first',
  },
  hi: {
    receivePayment: 'भुगतान प्राप्त',
    paymentOutAction: 'भुगतान किया',
    chooseParty: 'पार्टी चुनें',
    errSelectParty: 'कृपया पहले पार्टी चुनें',
  },
} as const;

export type ParityPaymentKey = keyof (typeof parityPayment)['en'];
