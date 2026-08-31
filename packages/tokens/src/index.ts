/**
 * Shared design tokens.
 *
 * Consumed by both apps:
 *  - web   : via `tokens.css` custom properties (Tailwind v4 `@theme` maps onto them)
 *  - mobile: via the raw TS objects below, fed into React Native StyleSheet
 *
 * Keep the two in sync — `tokens.css` is the CSS mirror of `palette`.
 */

export type ThemeMode = 'light' | 'dark';

export interface ColorScale {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  ring: string;
}

export const palette: Record<ThemeMode, ColorScale> = {
  light: {
    background: '#ffffff',
    foreground: '#0b1220',
    card: '#ffffff',
    cardForeground: '#0b1220',
    muted: '#f1f5f9',
    mutedForeground: '#64748b',
    border: '#e2e8f0',
    input: '#e2e8f0',
    primary: '#1d4ed8',
    primaryForeground: '#f8fafc',
    secondary: '#f1f5f9',
    secondaryForeground: '#0f172a',
    accent: '#eef2ff',
    accentForeground: '#1e293b',
    destructive: '#dc2626',
    destructiveForeground: '#f8fafc',
    success: '#16a34a',
    successForeground: '#f0fdf4',
    warning: '#d97706',
    warningForeground: '#fffbeb',
    ring: '#1d4ed8',
  },
  dark: {
    background: '#0b1220',
    foreground: '#e2e8f0',
    card: '#111a2e',
    cardForeground: '#e2e8f0',
    muted: '#1e293b',
    mutedForeground: '#94a3b8',
    border: '#1e293b',
    input: '#1e293b',
    primary: '#60a5fa',
    primaryForeground: '#0b1220',
    secondary: '#1e293b',
    secondaryForeground: '#e2e8f0',
    accent: '#1e293b',
    accentForeground: '#e2e8f0',
    destructive: '#ef4444',
    destructiveForeground: '#0b1220',
    success: '#22c55e',
    successForeground: '#052e16',
    warning: '#f59e0b',
    warningForeground: '#1c1206',
    ring: '#60a5fa',
  },
};

/** 4px base spacing scale. */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof fontSize;

export const tokens = { palette, spacing, radius, fontSize, fontWeight } as const;

export default tokens;
