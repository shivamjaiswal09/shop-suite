# Shop Suite — Design System

## Product context
A sales & inventory system for Indian retail shops. Two very different users
share it: a **cashier at the counter** (all day, one screen, speed and glance-
ability decide everything) and an **owner/supervisor** doing stock, purchasing
and day-end reconciliation (dense tables, comparison, accuracy).

The current UI treats both identically — header, stat tiles, wide table — which
serves the second user adequately and the first one poorly.

## Current design language (the baseline being redesigned)

- **Colour:** cool blue-slate neutrals; one saturated blue (`#1d4ed8`) as the
  only brand accent; semantic green/amber/red. Light + dark via a `.dark` class.
- **Surface:** flat. 1px `border` separates everything; no shadow tokens at all
  (the modal's `shadow-xl` is the sole exception).
- **Type:** system UI stack, 11–34px, weights 400–700. Money and quantity use
  `tabular-nums`.
- **Geometry:** 4pt spacing scale; radius 4/8/12/16; cards `rounded-xl`,
  controls `rounded-md`, badges `rounded-full`.
- **Density:** high. Stock Overview reaches 10 columns; nine of ten screens are
  header → stat tiles → wide table.
- **Motion:** none beyond CSS colour transitions.

Full token values and raw source: `.superdesign/init/theme.md`.

## Constraints the redesign must respect

1. **Tokens are shared with a React Native app.** `packages/tokens` is consumed
   by both web (CSS variables) and Expo (StyleSheet objects). Any new palette or
   scale has to survive as plain values — no CSS-only tricks in the token layer.
2. **Light and dark are both first-class**, driven by a class on `<html>`.
3. **Numbers must stay aligned and scannable** — tabular figures, right-aligned
   money and quantity columns. This is an accounting surface.
4. **Semantic colour is load-bearing**: out-of-stock, below-min, reorder,
   in-transit, variance, paid/unpaid all read as status, not decoration.
5. **Six-module taxonomy stays** (Home, Sales, Inventory, Purchases, Closing &
   Reconciliation, Administration) — it is mirrored by the mobile app.
6. **Barcode scanning is keyboard-wedge**: the scan field must hold focus and
   treat Enter as submit. Nothing may steal focus during billing.
7. Tailwind v4, configured in `index.css` via `@theme inline`. No
   `tailwind.config.*` file exists.

## Known weaknesses to fix

- Quick Billing — where a cashier lives all day — carries the same visual
  weight as Administration.
- No hierarchy: flat borders everywhere mean nothing looks more important.
- No responsive story below `lg` (1024px). The sidebar is `hidden lg:flex` and
  nothing replaces it, so navigation vanishes on a phone or small tablet.
- Missing primitives: no Tabs (Administration fakes them with a Button row),
  no Toast, Tooltip, Skeleton, Drawer or Pagination.
- Feedback after a destructive or successful action is text-only and easy to
  miss at a busy counter.

## Style source

No reference site was named. The Superdesign style library
(`search-prompts --tags style`) returned 20 landing-page aesthetics —
brutalist e-commerce, glassmorphism, cinematic, aurora hero and similar. None
targets a dense operational tool, so **no library style prompt is applied**;
grafting a marketing aesthetic onto a POS would fight every constraint above.
