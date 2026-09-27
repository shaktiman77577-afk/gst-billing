// GST rate finder screen strings. Merged into src/i18n/strings.ts by the
// coordinator; until then screens use the local en/hi maps directly.
export const en = {
  gr_title: 'GST Rate Finder',
  gr_searchPlaceholder: 'Search by HSN code or item name',
  gr_slabAll: 'All slabs',
  gr_kindAll: 'All',
  gr_goods: 'Goods',
  gr_services: 'Services',
  gr_slabLabel: 'Slab',
  gr_typeLabel: 'Type',
  gr_noResults: 'No matching HSN found. Try a different keyword.',
  gr_resultsFound: 'matches found',
  gr_tapHint: 'Tap a row to see the HSN - long-press the code to copy it',
  gr_hsnLabel: 'HSN / SAC',
  gr_disclaimer: 'Indicative rates only. Please verify on cbic.gov.in before billing.',
};
export type ParityGstRatesKey = keyof typeof en;
export const hi: Record<ParityGstRatesKey, string> = {
  gr_title: 'GST Rate Finder',
  gr_searchPlaceholder: 'HSN code ya item ka naam likho',
  gr_slabAll: 'Sabhi slab',
  gr_kindAll: 'Sabhi',
  gr_goods: 'Samaan',
  gr_services: 'Seva',
  gr_slabLabel: 'Slab',
  gr_typeLabel: 'Prakaar',
  gr_noResults: 'Koi HSN nahi mila. Koi aur shabd try karo.',
  gr_resultsFound: 'result mile',
  gr_tapHint: 'Row par tap karo - HSN code ko long-press karke copy karo',
  gr_hsnLabel: 'HSN / SAC',
  gr_disclaimer: 'Ye dar sanketik hain. Bill banane se pehle cbic.gov.in par verify karo.',
};
