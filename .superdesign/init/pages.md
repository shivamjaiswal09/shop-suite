# Page dependency trees

Local imports only (`@/...` and relative); `@shop/*` workspace packages are the
data/logic layer and carry no UI. Every page below also depends on
`src/components/page-header.tsx` and `src/lib/utils.ts`.

## /sales/billing — Quick Billing (the core screen)
Entry: `apps/web/src/pages/sales/quick-billing.tsx`
Dependencies:
- src/components/page-header.tsx
- src/components/ui/badge.tsx
- src/components/ui/button.tsx
- src/components/ui/card.tsx
- src/components/ui/input.tsx
- src/components/ui/table.tsx
- src/lib/utils.ts
Layout: three stacked cards in the left column (scan bar, cart table, live stock
panel) + a right rail (bill summary, payment, last invoice receipt).
Exports `StockBadge`, reused by stock-overview.

## / — Home dashboard
Entry: `apps/web/src/pages/home.tsx`
Dependencies:
- src/components/page-header.tsx
- src/components/ui/badge.tsx
- src/components/ui/card.tsx
- src/components/ui/input.tsx
- src/components/ui/stat.tsx
- src/components/ui/table.tsx
- recharts (BarChart)
Layout: 4 stat tiles, then a 2-col grid of 4 cards (payment-method chart,
alerts, recent invoices, activity).

## /inventory/overview — Stock Overview
Entry: `apps/web/src/pages/inventory/stock-overview.tsx`
Dependencies:
- src/pages/inventory/adjust-stock-dialog.tsx
  - src/components/ui/modal.tsx
  - src/components/ui/button.tsx
  - src/components/ui/input.tsx
- src/pages/sales/quick-billing.tsx (StockBadge only)
- src/components/ui/{badge,button,card,input,stat,table}.tsx
Layout: scope toggle in header, 4 stat tiles, filter bar, wide table (10 cols).

## /inventory/transfers — Stock Transfers
Entry: `apps/web/src/pages/inventory/transfers.tsx`
Dependencies:
- src/pages/inventory/new-transfer-dialog.tsx
  - src/components/ui/{modal,button,input,badge,table}.tsx
- src/pages/inventory/receive-transfer-dialog.tsx
  - src/components/ui/{modal,button,input,badge,table}.tsx
- src/components/ui/{badge,button,card,stat,table}.tsx

## /inventory/products — Products & SKUs
Entry: `apps/web/src/pages/inventory/products.tsx`
Dependencies:
- src/pages/inventory/new-sku-dialog.tsx
  - src/components/ui/{modal,button,input}.tsx
- src/components/ui/{badge,button,card,input,table}.tsx

## /sales/invoices — Invoices
Entry: `apps/web/src/pages/sales/invoices.tsx`
Dependencies:
- src/pages/sales/invoice-detail.tsx
  - src/components/ui/{modal,button,input,badge,table}.tsx
- src/components/ui/{badge,card,input,table}.tsx

## /closing — Day-End Closing
Entry: `apps/web/src/pages/closing/day-end.tsx`
Dependencies:
- src/pages/closing/discrepancies-card.tsx
  - src/components/ui/{badge,button,card,input,table}.tsx
- src/components/ui/{badge,button,card,input,stat,table}.tsx
Layout: 4 stat tiles, then 2-col split — left column of cards, right rail form.

## /inventory/movements — Stock Movements
Entry: `apps/web/src/pages/inventory/movements.tsx`
Dependencies: src/components/ui/{badge,card,input,table}.tsx

## /admin — Administration
Entry: `apps/web/src/pages/administration.tsx`
Dependencies: src/components/ui/{badge,button,card,table}.tsx
Layout: button-row tabs (not a real tab primitive) over 4 sub-views.

## /purchases — Purchases
Entry: `apps/web/src/pages/purchases.tsx`
Dependencies: src/components/ui/{badge,card,table}.tsx

## /login — Login
Entry: `apps/web/src/pages/login.tsx`
Dependencies: src/components/ui/{button,input}.tsx
Layout: centred card on muted background, full-bleed (no AppShell).
