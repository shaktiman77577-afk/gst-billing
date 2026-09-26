// Pure GST statutory deadline computation — no DB reads, no network, no Date.now().
// Takes "today" as a parameter so it is trivially unit-testable.
//
// Covers the two monthly returns for regular (monthly) filers:
//   GSTR-1  — outward supplies, due on the 11th of the following month
//   GSTR-3B — summary return + tax payment, due on the 20th of the following month
//
// Rollover rule: the cycle whose due date falls in the current calendar month is
// the active one. While its due date is in the future it is "upcoming"
// (daysLeft > 0, or 0 = due today); once the due date passes it is "overdue"
// (daysLeft < 0) for the rest of that month. On the 1st of the next month the
// next cycle becomes active automatically, so the overdue cycle rolls away.

import { toIsoDate } from './dates';

export type GstFilingCode = 'GSTR-1' | 'GSTR-3B';

export interface GstDeadline {
  /** Filing form, e.g. 'GSTR-1'. */
  code: GstFilingCode;
  /** Sales month the return covers (1-12). */
  periodMonth: number;
  /** Sales year the return covers. */
  periodYear: number;
  /** Due date as local YYYY-MM-DD. */
  dueIso: string;
  /** Calendar days from today to the due date: >0 upcoming, 0 due today, <0 overdue. */
  daysLeft: number;
}

// Month names shared by both app languages (Hinglish uses English month names).
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 'August 2026' style label for the sales period a deadline covers. */
export function periodLabel(periodYear: number, periodMonth: number): string {
  return `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function deadlineFor(code: GstFilingCode, dueDay: number, today: Date): GstDeadline {
  // Due on `dueDay` of the current calendar month, covering the previous month's sales.
  // `new Date(y, m, d)` rolls over years automatically (e.g. Jan → Dec of prior year).
  const due = new Date(today.getFullYear(), today.getMonth(), dueDay);
  const period = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return {
    code,
    periodMonth: period.getMonth() + 1,
    periodYear: period.getFullYear(),
    dueIso: toIsoDate(due),
    daysLeft: Math.round((startOfDay(due).getTime() - startOfDay(today).getTime()) / DAY_MS),
  };
}

/** The currently active deadline for each monthly GST filing, given "today". */
export function getGstDeadlines(today: Date): GstDeadline[] {
  return [deadlineFor('GSTR-1', 11, today), deadlineFor('GSTR-3B', 20, today)];
}

/** Red highlight when 3 or fewer days remain — overdue deadlines included. */
export function isUrgent(deadline: GstDeadline): boolean {
  return deadline.daysLeft <= 3;
}
