import type { TextStyle } from 'react-native';

// One place for all colours, sizes, fonts and shadows.
// Design language (v2): calm, professional, "big org" look —
// white surfaces, hairline borders, almost no shadows, refined type
// (IBM Plex Sans, weights 400/500/600 only), tabular numbers for money.
export const colors = {
  primary: '#1E3A8A', // brand navy
  primaryDark: '#172554',
  primarySoft: '#EEF2FA', // icon chips, selected chip fill
  primaryLight: '#DCE4F5', // selected rows / light primary fills
  primaryTint: '#F4F6FB',
  accent: '#F59E0B', // saffron — highlights only
  accentSoft: '#FEF3C7',
  text: '#0F172A',
  textSecondary: '#334155', // secondary labels, button text on white
  muted: '#5B6472', // captions, field labels
  faint: '#8A94A3', // placeholders, chevrons, inactive tabs
  border: '#E5E7EB', // card + header borders
  borderStrong: '#D9DDE3', // input borders
  divider: '#EEF0F3', // rows inside a card
  background: '#F6F7F9',
  card: '#FFFFFF',
  surfaceAlt: '#F1F3F6', // muted surface — search bars, segmented control
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  white: '#FFFFFF',
  whiteSoft: 'rgba(255,255,255,0.85)', // text on dark surfaces
  whiteFaint: 'rgba(255,255,255,0.65)',
};

// Smaller, tighter corners. xl is kept for bottom sheets only.
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };

// Cards rely on hairline borders now, so the default shadows are off.
// The names stay so existing screens keep compiling.
export const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
};

export const shadowSm = shadow;

// Floating things only (FAB, sheets) — soft.
export const shadowLg = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

// Refined, smaller scale. Body text is 14.
export const text = { xs: 12, sm: 13, md: 14, lg: 16, xl: 18, xxl: 22, display: 26 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

// Standard control heights.
export const sizes = { control: 44, button: 48, tabBar: 60, header: 56 };

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------
// Family names registered in app/_layout.tsx. English uses IBM Plex Sans;
// Hindi uses IBM Plex Sans Devanagari (same design, and it also has Latin
// letters and numbers, so mixed Hindi + English text looks consistent).
export const fonts = {
  en: { regular: 'PlexSans-Regular', medium: 'PlexSans-Medium', semibold: 'PlexSans-SemiBold' },
  hi: { regular: 'PlexDeva-Regular', medium: 'PlexDeva-Medium', semibold: 'PlexDeva-SemiBold' },
};

type Lang = keyof typeof fonts;

// Custom fonts need one file per weight (fontWeight alone does not work on
// Android), so a style's fontWeight is turned into the matching family.
// Only three weights exist in the new design:
//   400 and below → regular, 500/600 → medium, 700 and above → semibold.
export function fontFamilyFor(weight: TextStyle['fontWeight'] | undefined, lang: Lang = 'en'): string {
  const f = fonts[lang] ?? fonts.en;
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight);
  if (Number.isNaN(w) || w < 500) return f.regular;
  if (w < 700) return f.medium;
  return f.semibold;
}

// Ready-made text styles (weights follow fontFamilyFor: '500' = medium,
// '700' = semibold). Use these instead of hand-written fontSize/fontWeight.
export const textStyles = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400', color: colors.muted },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.muted },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400', color: colors.text },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  amount: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  amountLg: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
} satisfies Record<string, TextStyle>;

// Add to any style that shows money so digits line up in columns.
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
