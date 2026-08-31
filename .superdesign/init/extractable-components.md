# Extractable components

Candidates for reuse as Superdesign `DraftComponent` entities.

## Layout components (appear on every authenticated page)

## AppShell
- Source: `apps/web/src/components/app-shell.tsx`
- Category: layout
- Description: Sidebar + top bar frame wrapping all authenticated routes
- Extractable props: activeModule (string, default: "/"), showSubNav (boolean, default: true)
- Hardcoded: Store logo mark, six nav labels, lucide icon names, all CSS

## Sidebar
- Source: `apps/web/src/components/app-shell.tsx` (the `<aside>`)
- Category: layout
- Description: Fixed 256px module nav with inline child links for the active module
- Extractable props: activeItem (string, default: "/"), collapsed (boolean, default: false)
- Hardcoded: NAV array, icons, user footer block

## TopBar
- Source: `apps/web/src/components/app-shell.tsx` (the `<header>`)
- Category: layout
- Description: Branch/warehouse switcher on the left, theme toggle on the right
- Extractable props: theme ("light" | "dark", default: "light")
- Hardcoded: icon names, spacing

## BranchSwitcher
- Source: `apps/web/src/components/branch-switcher.tsx`
- Category: layout
- Description: Two selects binding the session's branch and warehouse context
- Extractable props: branchName (string), warehouseName (string), disabled (boolean, default: false)
- Hardcoded: Building2 / Warehouse icons, select widths

## PageHeader
- Source: `apps/web/src/components/page-header.tsx`
- Category: layout
- Description: Page title, optional description, right-aligned action slot
- Extractable props: title (string), description (string), hasActions (boolean, default: false)
- Hardcoded: type sizes, margins

## Basic components (used across pages)

## Button
- Source: `apps/web/src/components/ui/button.tsx`
- Category: basic
- Description: CVA button — 6 variants (default/secondary/outline/ghost/destructive/success), 4 sizes
- Extractable props: variant (string, default: "default"), size (string, default: "md"), disabled (boolean, default: false)
- Hardcoded: all Tailwind classes, focus ring treatment

## Card
- Source: `apps/web/src/components/ui/card.tsx`
- Category: basic
- Description: Bordered surface with optional header (title/description/action) and body
- Extractable props: title (string), description (string), hasAction (boolean, default: false)
- Hardcoded: rounded-xl, border, padding scale

## Stat
- Source: `apps/web/src/components/ui/stat.tsx`
- Category: basic
- Description: KPI tile — label, large tabular value, optional hint and icon, 4 tones
- Extractable props: label (string), value (string), hint (string), tone (string, default: "default")
- Hardcoded: icon slot, text sizes

## Badge
- Source: `apps/web/src/components/ui/badge.tsx`
- Category: basic
- Description: Pill status chip, 5 tones (neutral/info/success/warning/danger)
- Extractable props: tone (string, default: "neutral")
- Hardcoded: rounded-full, 11px type

## Table / Th / Td / EmptyRow
- Source: `apps/web/src/components/ui/table.tsx`
- Category: basic
- Description: Horizontally scrollable table with uppercase header cells and an empty state row
- Extractable props: columnCount (number), isEmpty (boolean, default: false)
- Hardcoded: border-bottom rows, uppercase tracking on Th

## Input / Select / Label
- Source: `apps/web/src/components/ui/input.tsx`
- Category: basic
- Description: 36px form controls sharing one class string, plus a small muted label
- Extractable props: placeholder (string), disabled (boolean, default: false), invalid (boolean, default: false)
- Hardcoded: height, ring treatment

## Modal
- Source: `apps/web/src/components/ui/modal.tsx`
- Category: basic
- Description: Centred dialog, scrim, header with close, scrollable body, footer slot
- Extractable props: title (string), description (string), hasFooter (boolean, default: true)
- Hardcoded: max-w-2xl, max-h-90vh, shadow-xl

## Notes for redesign
- There is **no** Tabs primitive (Administration fakes tabs with a Button row),
  no Toast, no Tooltip, no Skeleton, no Drawer, no Pagination.
- `Modal` is the only component using a shadow; everything else is flat + 1px border.
- Every table is dense and wide; Stock Overview reaches 10 columns.
- No responsive story below `lg`.
