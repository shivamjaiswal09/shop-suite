# Routes

Config-based routing with **react-router v7** (`<Routes>` declared in
`apps/web/src/app.tsx`). Auth is a gate, not a route guard: when the session
store has no user, only `/login` renders; everything else redirects there.

| Path | Component | Layout | Notes |
|---|---|---|---|
| `/login` | `pages/login.tsx` | none (full-bleed) | Mock login, email only |
| `/` | `pages/home.tsx` | `AppShell` | Business dashboard, date filter |
| `/sales` | → `/sales/billing` | `AppShell` | redirect |
| `/sales/billing` | `pages/sales/quick-billing.tsx` | `AppShell` | **The core screen.** Scan → cart → tender → invoice |
| `/sales/invoices` | `pages/sales/invoices.tsx` | `AppShell` | List + row click opens `invoice-detail` modal |
| `/inventory` | → `/inventory/overview` | `AppShell` | redirect |
| `/inventory/overview` | `pages/inventory/stock-overview.tsx` | `AppShell` | Warehouse / Branch-total toggle, Adjust action |
| `/inventory/products` | `pages/inventory/products.tsx` | `AppShell` | Catalogue + New SKU modal |
| `/inventory/transfers` | `pages/inventory/transfers.tsx` | `AppShell` | Dispatch / receive / cancel |
| `/inventory/movements` | `pages/inventory/movements.tsx` | `AppShell` | The raw ledger |
| `/purchases` | `pages/purchases.tsx` | `AppShell` | Read-only in Phase 1 |
| `/closing` | `pages/closing/day-end.tsx` | `AppShell` | Day-end + discrepancies |
| `/admin` | `pages/administration.tsx` | `AppShell` | 4 tabs, read-only |
| `*` | → `/` | `AppShell` | catch-all |

## Sidebar taxonomy (`apps/web/src/components/nav.ts`)

Six top-level modules; children render only for the active module.

1. **Home** `/`
2. **Sales** `/sales` → Quick Billing, Invoices
3. **Inventory** `/inventory` → Stock Overview, Products & SKUs, Transfers, Stock Movements
4. **Purchases** `/purchases`
5. **Closing & Reconciliation** `/closing`
6. **Administration** `/admin`

The Expo app mirrors this taxonomy (currently only Login + Stock Overview built).

## Full router source

See `layouts.md` → `apps/web/src/app.tsx`.
