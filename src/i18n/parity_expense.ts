// Parity worker: expense audit — custom categories + daybook quick-add.
// The coordinator merges these into src/i18n/strings.ts later; do not import
// AppContext's t() for these keys (they are not in StringKey yet).
export const en = {
  pe_manage: 'Manage',
  pe_manageCategories: 'Manage categories',
  pe_default: 'Default',
  pe_yours: 'Your categories',
  pe_categoryName: 'Category name',
  pe_categoryNamePh: 'e.g. Fuel, Packaging',
  pe_addCategory: 'Add category',
  pe_noCustom: 'No custom categories yet',
  pe_noCustomHint: 'Add your own below — e.g. Fuel, Staff food, Packaging.',
  pe_newChip: '+ New',
  pe_delTitle: 'Delete category?',
  pe_delMsg: 'It will no longer appear as an option. Existing expenses keep this category.',
  pe_exists: 'This category already exists',
  pe_empty: 'Type a category name first',
  pe_defaultsNote: 'Default categories cannot be deleted.',
};
export type ParityExpenseKey = keyof typeof en;
export const hi: Record<ParityExpenseKey, string> = {
  pe_manage: 'Manage karo',
  pe_manageCategories: 'Categories manage karo',
  pe_default: 'Default',
  pe_yours: 'Tumhari categories',
  pe_categoryName: 'Category ka naam',
  pe_categoryNamePh: 'jaise Fuel, Packaging',
  pe_addCategory: 'Category jodo',
  pe_noCustom: 'Abhi koi custom category nahi hai',
  pe_noCustomHint: 'Neeche apni jodo — jaise Fuel, Staff ka khana, Packaging.',
  pe_newChip: '+ Nayi',
  pe_delTitle: 'Category hatayein?',
  pe_delMsg: 'Ye option me nahi dikhegi. Purane kharchon me ye category bani rahegi.',
  pe_exists: 'Ye category pehle se hai',
  pe_empty: 'Pehle category ka naam likho',
  pe_defaultsNote: 'Default categories hatayi nahi ja sakti.',
};
