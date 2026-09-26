import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, nowIso } from '../lib/id';

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

export const EXPENSE_MODES: ExpenseMode[] = ['cash', 'upi', 'bank'];

export type Expense = {
  id: string;
  business_id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
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
    category: ExpenseCategory;
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
    category: ExpenseCategory;
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
}

// Soft delete — keeps history intact for reports and sync.
export async function deleteExpense(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
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
