import { useSessionStore } from '@shop/state';
import { fontSize, fontWeight, palette, radius, spacing, type ColorScale } from '@shop/tokens';

/**
 * NativeWind v4 still pins Tailwind v3, and the web app is on Tailwind v4 — so
 * per the Phase 1 risk note, mobile consumes the shared tokens directly through
 * StyleSheet instead. The tokens (and therefore the visual language) are the
 * same objects the web app compiles into CSS variables.
 */
export function useTheme(): ColorScale {
  const mode = useSessionStore((s) => s.theme);
  return palette[mode];
}

export function useThemeMode() {
  return useSessionStore((s) => s.theme);
}

export { fontSize, fontWeight, radius, spacing };
export type { ColorScale };

/**
 * Touch target sizes. This app is used one-handed, at a counter, often in a
 * hurry and sometimes on a cheap phone — so every interactive element is at
 * least `touch.min`, comfortably clear of the 44pt / 48dp platform floors.
 * `touch.lg` is for the primary action on a screen; `touch.xl` for the ones a
 * cashier hits hundreds of times a day.
 */
export const touch = { sm: 40, min: 48, lg: 56, xl: 64 } as const;

/** Elevation that reads on both themes — shadow on iOS, elevation on Android. */
export const elevation = {
  card: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
} as const;

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

export const money = (value: number) => inr.format(value);

/** Compact money for tiles where the full figure would wrap — ₹1.2L, ₹34.5k. */
export const moneyShort = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return inr.format(value);
};

export const qty = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '');

export const shortTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/** Today as `YYYY-MM-DD`, which is the shape the closing hooks expect. */
export const today = () => new Date().toISOString().slice(0, 10);
