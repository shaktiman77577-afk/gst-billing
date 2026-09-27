// Date-range picker strings, en+hi parity.
// DO NOT edit src/i18n/strings.ts for this feature — the coordinator merges
// these keys into strings.ts later. Components read them through drT() below
// using useApp().language, the same way t() reads STRINGS.

import type { Language } from './strings';
import type { DatePreset } from '../lib/dateRange';

export const parity_daterange = {
  en: {
    dr_title: 'Date range',
    dr_preset_today: 'Today',
    dr_preset_yesterday: 'Yesterday',
    dr_preset_thisWeek: 'This week',
    dr_preset_last7Days: 'Last 7 days',
    dr_preset_thisMonth: 'This month',
    dr_preset_lastMonth: 'Last month',
    dr_preset_thisQuarter: 'This quarter',
    dr_preset_lastQuarter: 'Last quarter',
    dr_preset_currentFY: 'Current FY',
    dr_preset_previousFY: 'Previous FY',
    dr_preset_last365Days: 'Last 365 days',
    dr_preset_custom: 'Custom range',
    dr_from: 'From',
    dr_to: 'To',
    dr_apply: 'Apply',
    dr_filter: 'Dates',
    dr_clear: 'Clear',
    dr_invalidRange: 'End date must be on or after start date',
  },
  hi: {
    dr_title: 'Tareekh range',
    dr_preset_today: 'Aaj',
    dr_preset_yesterday: 'Kal',
    dr_preset_thisWeek: 'Is hafte',
    dr_preset_last7Days: 'Pichhle 7 din',
    dr_preset_thisMonth: 'Is mahine',
    dr_preset_lastMonth: 'Pichhle mahine',
    dr_preset_thisQuarter: 'Is quarter',
    dr_preset_lastQuarter: 'Pichhla quarter',
    dr_preset_currentFY: 'Is FY',
    dr_preset_previousFY: 'Pichhli FY',
    dr_preset_last365Days: 'Pichhle 365 din',
    dr_preset_custom: 'Apni tareekh',
    dr_from: 'Se',
    dr_to: 'Tak',
    dr_apply: 'Lagao',
    dr_filter: 'Tareekh',
    dr_clear: 'Saaf karo',
    dr_invalidRange: 'Aakhri tareekh pehli tareekh ke baad honi chahiye',
  },
} as const;

export type DrKey = keyof typeof parity_daterange.en;

// Compile-time en+hi parity: every English key must exist in Hindi.
const _hiParity: Record<DrKey, string> = parity_daterange.hi;
void _hiParity;

// Preset → label key. Kept here with the strings; the date math stays in
// src/lib/dateRange.ts.
export const DR_PRESET_LABELS: Record<DatePreset, DrKey> = {
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

/**
 * Same contract as t() from useApp(), but for this feature's keys:
 * const tr = drT(language); tr('dr_title').
 */
export function drT(language: Language | null | undefined): (key: DrKey) => string {
  const pack = parity_daterange[language ?? 'en'];
  return (key: DrKey) => pack[key];
}
