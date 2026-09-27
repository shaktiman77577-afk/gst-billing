import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';
import { markDirty } from '../lib/backup';
import { getMeta, setMeta } from './meta';

export type ExpenseCategory = 'rent' | 'salary' | 'utilities' | 'transport' | 'marketing' | 'other';
export type ExpenseMode = 'cash' | 'upi' | 'bank';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'rent',
  'salary',
  'utilities',
  'transport',
  'marketing',
  'other',
];

/** Custom (user-added) categories are stored in the TEXT column with this
 *  prefix so they can never collide with built-in slugs. No schema migration
 *  needed — the column was always plain TEXT. */
export const CUSTOM_CATEGORY_PREFIX = 'custom:';

export function isCustomCategory(category: string): boolean {
  return category.startsWith(CUSTOM_CATEGORY_PREFIX);
}

export function isBuiltinCategory(category: string): category is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category);
}

/** The user's own name for a custom category (built-ins pass through). */
export function customCategoryName(category: string): string {
  return isCustomCategory(category) ? category.slice(CUSTOM_CATEGORY_PREFIX.length) : category;
}

/** Display label for an expense category value: built-ins go through i18n
 *  (e_cat_*), customs show the user's own name in either language. */
export function expenseCategoryLabel(
  category: string,
  t: (key: `e_cat_${ExpenseCategory}`) => string,
): string {
  if (isCustomCategory(category)) return customCategoryName(category);
  if (isBuiltinCategory(category)) return t(`e_cat_${category}`);
  return category; // legacy/unknown value: show raw rather than a missing key
}

export const EXPENSE_MODES: ExpenseMode[] = ['cash', 'upi', 'bank'];

export type Expense = {
  id: string;
  business_id: string;
  date: string; // YYYY-MM-DD
  category: string; // built-in slug ('rent', ...) or 'custom:<user name>'
  amount_paise: number;
  note: string | null;
  payment_mode: ExpenseMode;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// First and last day (YYYY-MM-DD) of a calendar month. month0 is 0-based.
export function monthBounds(year: number, month0: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month0 + 1)}-01`;
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const to = `${year}-${pad(month0 + 1)}-${pad(lastDay)}`;
  return { from, to };
}

export async function addExpense(
  db: SQLiteDatabase,
  e: {
    businessId: string;
    date: string;
    category: string;
    amountPaise: number;
    note: string | null;
    paymentMode: ExpenseMode;
  },
): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO expenses (id, business_id, date, category, amount_paise, note, payment_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    e.businessId,
    e.date,
    e.category,
    e.amountPaise,
    e.note,
    e.paymentMode,
    now,
    now,
  );
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
  return id;
}

export async function getExpense(db: SQLiteDatabase, id: string): Promise<Expense | null> {
  return (
    (await db.getFirstAsync<Expense>('SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL', id)) ?? null
  );
}

export async function updateExpense(
  db: SQLiteDatabase,
  id: string,
  e: {
    date: string;
    category: string;
    amountPaise: number;
    note: string | null;
    paymentMode: ExpenseMode;
  },
): Promise<void> {
  await db.runAsync(
    `UPDATE expenses SET date = ?, category = ?, amount_paise = ?, note = ?, payment_mode = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    e.date,
    e.category,
    e.amountPaise,
    e.note,
    e.paymentMode,
    nowIso(),
    id,
  );
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

// Soft delete — keeps history intact for reports and sync.
export async function deleteExpense(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

export async function listExpenses(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<Expense[]> {
  return db.getAllAsync<Expense>(
    `SELECT * FROM expenses
     WHERE business_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?
     ORDER BY date DESC, created_at DESC`,
    businessId,
    from,
    to,
  );
}

export async function totalExpenses(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(amount_paise) AS total FROM expenses
     WHERE business_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?`,
    businessId,
    from,
    to,
  );
  return row?.total ?? 0;
}

export async function expensesByCategory(
  db: SQLiteDatabase,
  businessId: string,
  from: string,
  to: string,
): Promise<{ category: string; total: number }[]> {
  return db.getAllAsync<{ category: string; total: number }>(
    `SELECT category, SUM(amount_paise) AS total FROM expenses
     WHERE business_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?
     GROUP BY category ORDER BY total DESC`,
    businessId,
    from,
    to,
  );
}

// ---------------------------------------------------------------------------
// Custom (user-added) expense categories.
//
// Stored as JSON in app_meta under 'expense_categories':
//   { "<businessId>": ["Fuel", "Packaging", ...] }
// The expenses.category column holds 'custom:<name>'. No schema migration
// needed. Deleting a category only removes it from the selectable list —
// existing expenses keep their 'custom:<name>' value and still render.
// ---------------------------------------------------------------------------

type CustomCategoryMap = Record<string, string[]>; // businessId -> names

async function readCustomCategoryMap(db: SQLiteDatabase): Promise<CustomCategoryMap> {
  const raw = await getMeta(db, 'expense_categories');
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: CustomCategoryMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v)) out[k] = v.filter((s): s is string => typeof s === 'string');
      }
      return out;
    }
  } catch {
    // Corrupted value: start fresh rather than crash the expenses screen.
  }
  return {};
}

async function writeCustomCategories(
  db: SQLiteDatabase,
  businessId: string,
  names: string[],
): Promise<void> {
  const map = await readCustomCategoryMap(db);
  map[businessId] = names;
  await setMeta(db, 'expense_categories', JSON.stringify(map));
  // Cloud backup: mark data as changed (debounced upload, never blocks the UI).
  markDirty(db);
}

/** User-added category names for this business (raw names, no prefix). */
export async function getCustomCategories(
  db: SQLiteDatabase,
  businessId: string,
): Promise<string[]> {
  return (await readCustomCategoryMap(db))[businessId] ?? [];
}

/** All selectable category values: built-in slugs first, then 'custom:<name>'. */
export async function getAllCategories(db: SQLiteDatabase, businessId: string): Promise<string[]> {
  const customs = await getCustomCategories(db, businessId);
  return [...EXPENSE_CATEGORIES, ...customs.map((n) => `${CUSTOM_CATEGORY_PREFIX}${n}`)];
}

/** Adds a custom category name. ':' is stripped (it is the storage separator),
 *  names are capped at 30 chars, and case-insensitive duplicates are ignored.
 *  Returns the updated name list. */
export async function addCustomCategory(
  db: SQLiteDatabase,
  businessId: string,
  name: string,
): Promise<string[]> {
  const clean = name.trim().replace(/:/g, '').slice(0, 30);
  if (!clean) throw new Error('empty category name');
  const cur = await getCustomCategories(db, businessId);
  if (!cur.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    cur.push(clean);
    await writeCustomCategories(db, businessId, cur);
  }
  return cur;
}

/** Removes a custom category from the selectable list. Existing expenses that
 *  used it keep their value and still render. Returns the updated name list. */
export async function removeCustomCategory(
  db: SQLiteDatabase,
  businessId: string,
  name: string,
): Promise<string[]> {
  const cur = (await getCustomCategories(db, businessId)).filter((c) => c !== name);
  await writeCustomCategories(db, businessId, cur);
  return cur;
}
