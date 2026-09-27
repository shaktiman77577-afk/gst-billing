// Date-range presets shared by the dashboard transactions, bills list, daybook
// and reports screens.
//
// All ranges are inclusive and returned as local YYYY-MM-DD strings (see
// src/lib/dates.ts: local dates, never UTC, so late-night bills land on the
// right day). Weeks start on Monday (Indian convention — same as
// reportRange() in src/lib/reports.ts). Financial-year boundaries follow
// financialYear() in src/lib/gst.ts (April–March). Quarters are calendar
// quarters (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec), the GST return convention.

import { todayIso, toIsoDate } from './dates';
import type { StringKey } from '../i18n/strings';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'last7Days'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'currentFY'
  | 'previousFY'
  | 'last365Days'
  | 'custom';

export type DateRange = {
  preset: DatePreset;
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
};

export const DATE_PRESETS: DatePreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'last7Days',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'currentFY',
  'previousFY',
  'last365Days',
  'custom',
];

// Date shifted by a day delta, keeping the wall-clock local date.
function shiftDay(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
}

// First year of the FY the date falls in: April–March, same rule as
// financialYear() in src/lib/gst.ts (month >= April → current year).
function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * Resolve a preset to an inclusive { from, to } range of YYYY-MM-DD strings.
 * Pass `now` to test against a fixed date. For 'custom', pass the chosen
 * { from, to } explicitly.
 */
export function presetRange(
  preset: DatePreset,
  now: Date = new Date(),
  custom?: { from: string; to: string },
): { from: string; to: string } {
  const today = toIsoDate(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = toIsoDate(shiftDay(now, -1));
      return { from: y, to: y };
    }
    case 'thisWeek': {
      // Monday-first, Indian convention.
      const mondayOffset = (now.getDay() + 6) % 7; // 0 = Monday
      return { from: toIsoDate(shiftDay(now, -mondayOffset)), to: today };
    }
    case 'last7Days':
      return { from: toIsoDate(shiftDay(now, -6)), to: today };
    case 'thisMonth':
      return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last day of prev month
      return { from: toIsoDate(first), to: toIsoDate(last) };
    }
    case 'thisQuarter': {
      const q = Math.floor(now.getMonth() / 3);
      return { from: toIsoDate(new Date(now.getFullYear(), q * 3, 1)), to: today };
    }
    case 'lastQuarter': {
      const q = Math.floor(now.getMonth() / 3);
      const lq = q === 0 ? 3 : q - 1;
      const ly = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const first = new Date(ly, lq * 3, 1);
      const last = new Date(ly, lq * 3 + 3, 0); // day 0 of next quarter's first month
      return { from: toIsoDate(first), to: toIsoDate(last) };
    }
    case 'currentFY': {
      const start = fyStartYear(now);
      return { from: toIsoDate(new Date(start, 3, 1)), to: today };
    }
    case 'previousFY': {
      const start = fyStartYear(now) - 1;
      return { from: toIsoDate(new Date(start, 3, 1)), to: toIsoDate(new Date(start + 1, 2, 31)) };
    }
    case 'last365Days':
      return { from: toIsoDate(shiftDay(now, -364)), to: today };
    case 'custom':
      if (!custom) throw new Error('presetRange: custom range needs { from, to }');
      return { from: custom.from, to: custom.to };
  }
}

/** Build a full DateRange from a preset (today's date for built-ins). */
export function makeRange(
  preset: Exclude<DatePreset, 'custom'>,
  now: Date = new Date(),
): DateRange {
  return { preset, ...presetRange(preset, now) };
}

/** Build a custom DateRange; throws on an inverted range. */
export function makeCustomRange(from: string, to: string): DateRange {
  if (from > to) throw new Error('makeCustomRange: from must be on or before to');
  return { preset: 'custom', from, to };
}

// Convenience: today's ISO date (re-exported so screens import from one place).
export { todayIso };

// Preset -> STRINGS label key (moved from the merged parity_daterange module).
export const DR_PRESET_LABELS: Record<DatePreset, StringKey> = {
  today: 'dr_preset_today',
  yesterday: 'dr_preset_yesterday',
  thisWeek: 'dr_preset_thisWeek',
  last7Days: 'dr_preset_last7Days',
  thisMonth: 'dr_preset_thisMonth',
  lastMonth: 'dr_preset_lastMonth',
  thisQuarter: 'dr_preset_thisQuarter',
  lastQuarter: 'dr_preset_lastQuarter',
  currentFY: 'dr_preset_currentFY',
  previousFY: 'dr_preset_previousFY',
  last365Days: 'dr_preset_last365Days',
  custom: 'dr_preset_custom',
};
