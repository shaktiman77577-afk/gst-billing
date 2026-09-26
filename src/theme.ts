// One place for all colours, sizes and shadows.
// Design language: modern professional — calm light theme, white surfaces,
// hairline borders, soft shadows, generous whitespace.
export const colors = {
  primary: '#1E3A8A', // brand navy
  primaryDark: '#172554',
  primarySoft: '#E8EEFB',
  primaryTint: '#F2F5FC',
  accent: '#F59E0B', // saffron — highlights only
  accentSoft: '#FEF3C7',
  text: '#0F172A',
  muted: '#5B6B82',
  faint: '#94A3B8',
  border: '#E4E9F1',
  background: '#F7F9FC',
  card: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FCEAEA',
  success: '#16A34A',
  successSoft: '#E6F7EC',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  white: '#FFFFFF',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

// Default card shadow — soft and calm.
export const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Extra-subtle shadow for small tiles and chips.
export const shadowSm = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.04,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

export const text = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, display: 30 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
