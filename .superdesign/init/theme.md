# Theme & Design Tokens

Tokens are defined once in `packages/tokens` and consumed twice: the web app
imports `tokens.css` (CSS custom properties, mapped into Tailwind v4 via
`@theme inline`), and the Expo app imports the TypeScript objects into
`StyleSheet`. Dark mode is a `.dark` class on `<html>`, driven by the Zustand
session store.

## Part 1 — Compact token summary

### Colour palette

| Token | Light | Dark |
|---|---|---|
| background | `#ffffff` | `#0b1220` |
| foreground | `#0b1220` | `#e2e8f0` |
| card | `#ffffff` | `#111a2e` |
| card-foreground | `#0b1220` | `#e2e8f0` |
| muted | `#f1f5f9` | `#1e293b` |
| muted-foreground | `#64748b` | `#94a3b8` |
| border | `#e2e8f0` | `#1e293b` |
| input | `#e2e8f0` | `#1e293b` |
| primary | `#1d4ed8` | `#60a5fa` |
| primary-foreground | `#f8fafc` | `#0b1220` |
| secondary | `#f1f5f9` | `#1e293b` |
| secondary-foreground | `#0f172a` | `#e2e8f0` |
| accent | `#eef2ff` | `#1e293b` |
| accent-foreground | `#1e293b` | `#e2e8f0` |
| destructive | `#dc2626` | `#ef4444` |
| destructive-foreground | `#f8fafc` | `#0b1220` |
| success | `#16a34a` | `#22c55e` |
| success-foreground | `#f0fdf4` | `#052e16` |
| warning | `#d97706` | `#f59e0b` |
| warning-foreground | `#fffbeb` | `#1c1206` |
| ring | `#1d4ed8` | `#60a5fa` |

Character: cool blue-slate neutrals, a single saturated blue as the only brand
accent, semantic green/amber/red. No gradients, no decorative colour.

### Type scale (px)
`xs 11 · sm 13 · base 15 · lg 18 · xl 22 · 2xl 28 · 3xl 34`
Weights: `400 / 500 / 600 / 700`. Font: system UI stack.
Money and quantity columns use `font-variant-numeric: tabular-nums` (`.tabular`).

### Spacing scale (px, 4pt base)
`none 0 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 48`

### Radius (px)
`sm 4 · md 8 · lg 12 · xl 16 · full 9999`
Cards use `rounded-xl`, controls `rounded-md`, badges `rounded-full`.

### Elevation & breakpoints
No shadow tokens — surfaces are separated by 1px `border` only (the single
exception is the modal, which uses `shadow-xl`).
Tailwind default breakpoints; the shell switches layout at `lg` (1024px).

## Part 2 — Raw source


### `packages/tokens/src/tokens.css`

```css
/* CSS mirror of packages/tokens/src/index.ts — keep both in sync. */

:root {
  --background: #ffffff;
  --foreground: #0b1220;
  --card: #ffffff;
  --card-foreground: #0b1220;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --primary: #1d4ed8;
  --primary-foreground: #f8fafc;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --accent: #eef2ff;
  --accent-foreground: #1e293b;
  --destructive: #dc2626;
  --destructive-foreground: #f8fafc;
  --success: #16a34a;
  --success-foreground: #f0fdf4;
  --warning: #d97706;
  --warning-foreground: #fffbeb;
  --ring: #1d4ed8;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}

.dark {
  --background: #0b1220;
  --foreground: #e2e8f0;
  --card: #111a2e;
  --card-foreground: #e2e8f0;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --border: #1e293b;
  --input: #1e293b;
  --primary: #60a5fa;
  --primary-foreground: #0b1220;
  --secondary: #1e293b;
  --secondary-foreground: #e2e8f0;
  --accent: #1e293b;
  --accent-foreground: #e2e8f0;
  --destructive: #ef4444;
  --destructive-foreground: #0b1220;
  --success: #22c55e;
  --success-foreground: #052e16;
  --warning: #f59e0b;
  --warning-foreground: #1c1206;
  --ring: #60a5fa;
}
```

### `packages/tokens/src/index.ts`

```ts
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
```

### `apps/web/src/index.css`

```css
@import 'tailwindcss';
@import '@shop/tokens/tokens.css';

/* Dark mode is driven by a class on <html>, toggled from the session store. */
@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-ring: var(--ring);

  --radius-card: var(--radius-lg);
}

@layer base {
  * {
    border-color: var(--border);
  }

  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family:
      ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 15px;
    -webkit-font-smoothing: antialiased;
  }

  /* Tabular figures keep money columns aligned. */
  .tabular {
    font-variant-numeric: tabular-nums;
  }
}
```

### `apps/web/vite.config.ts`

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Workspace packages export raw TS from src/ — let Vite compile them, don't prebundle.
  optimizeDeps: {
    exclude: ['@shop/core', '@shop/data', '@shop/state', '@shop/tokens'],
  },
  server: {
    // Not Vite's default 5173: another local app on this machine has a service
    // worker registered on that origin, which intercepts navigation and serves
    // its own cached shell instead of this app.
    port: 5273,
    strictPort: true,
    // Default binding resolved to [::1] only on this machine, which Chrome
    // could not reach via `localhost`. Binding all interfaces keeps both IPv4
    // and IPv6 working (and lets a phone open it for the mobile comparison).
    host: true,
  },
});
```

Note: there is no `tailwind.config.*` — Tailwind v4 is configured entirely in `index.css` via `@theme inline` plus the `@tailwindcss/vite` plugin.
