# Shop Suite

Sales & inventory management for retail shops. Web + native mobile share one
TypeScript logic layer. Phase 1 is front-end first: all data sits behind
repository interfaces backed by a seeded in-memory store, so a real API drops in
later without touching a single screen.

## The one invariant

**Stock is never a stored mutable number.** Every stock-changing event appends a
row to a `StockMovement` ledger; `onHand`, `reserved`, `available`, `damaged` and
`value` are folded from that ledger by `deriveInventoryLevel()`. Reconciliation
is correct by construction and the audit trail comes for free.

```
opening + receipt + sale_return + transfer_in   → adds
sale + transfer_out + damage                    → removes
adjustment                                      → signed by the caller
active reservations                             → reduce available, not on-hand
```

## Where stock lives

```
                 Company
        ┌───────────┴───────────┐
      Store                 Warehouse        ← independent peers
      (sells)               (holds bulk)
        └──── many-to-many link ────┘

  transfers:  warehouse → store   (replenish)
              store → store       (rebalance)
              warehouse → warehouse
```

Stores and warehouses are **not** nested — they are independent `StockLocation`
records sharing one id space, distinguished by `kind`. That single id space is
what lets a transfer be plain `location → location` with no special-casing.
Every `StockMovement` keys to `locationId`.

A `StoreWarehouseLink` maps the two many-to-many: a warehouse may supply several
stores, and a store may draw on several warehouses. The seed wires Peenya
Central to both stores, with Hosur Road as a secondary source for Indiranagar.

**A store sells only from its own shelf.** The link governs replenishment
routing and stock visibility — it does *not* let a store bill against warehouse
stock. An empty shelf blocks at the counter and is the signal to transfer stock
in.

Inventory is split into three screens rather than one screen with a global
location switch, so the two kinds of stock are never side by side pretending to
be comparable:

| Screen | Shows | Actionable |
|---|---|---|
| **Store Stock** | shelf stock, per store or all stores combined | yes, on a single store |
| **Warehouse Stock** | bulk stock, per warehouse or all combined | yes, on a single warehouse |
| **Total Inventory** | every location together | read-only rollup |

Picking one location makes stock adjustable and shows its inbound in-transit
column; a combined view is deliberately read-only, because a quantity spread
across locations is not something you can adjust in one place. The top bar
carries only the **selling store** — inventory screens scope themselves, so
there is never a second stock context to disagree with.

The **SKU catalogue is company-wide**: `Sku → Product → Category → companyId`,
with no location scoping. Category is a master, not a string on the product —
it carries merchandising order and the default tax a new SKU inherits. Every store bills the same SKUs, the same barcodes and (today)
the same prices — there is no per-store price override yet.

**Transfers move stock between any two locations in two steps.** Dispatch writes
`transfer_out` at the source; receipt writes `transfer_in` at the destination.
In between the goods are *in transit*, owned by neither location and shown as
such. Receiving less than was dispatched raises a stock Discrepancy against the
receiving location rather than quietly absorbing the loss, and cancelling an
in-transit run reverses it back to the source (the ledger is append-only, so a
reversal is the only way back). The dispatcher may tick **Receive immediately**
on any route to collapse both movements into one action; it is off by default.

## Getting started

pnpm must live under a user prefix on this machine (`/usr/local` is not writable):

```bash
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"   # add to ~/.zshrc
npm install -g pnpm
```

```bash
pnpm install
pnpm turbo run typecheck    # all packages + both apps
pnpm turbo run test         # shared-layer unit tests
pnpm --filter @shop/web dev      # http://localhost:5273
pnpm --filter @shop/mobile start # Expo — press i / a, or scan the QR
```

## Demo slice

1. Sign in as `owner@nandiretail.in` (no password — Phase 1 auth stub).
2. **Sales → Quick Billing**: scan or type a seeded barcode, e.g. `8901030101010`
   (Aashirvaad Atta 5 kg) — a USB/keyboard-wedge scanner's Enter keystroke is the
   submit handler.
3. Add to cart, pick a tender (or split across several), press **Bill**.
4. The stock panel underneath drops by exactly the billed quantity —
   that number is folded live from the new `sale` movements.
5. **Inventory → Stock Movements** shows the appended ledger rows.
6. **Closing & Reconciliation → Day-End Closing**: sales grouped by payment
   method, expected vs. physical cash, submit, then approve to lock the day. A
   variance beyond ₹1 raises a Discrepancy automatically, which you can then
   investigate, resolve or write off in the card below.
7. **Inventory → Transfers**: one replenishment run (Peenya Central →
   Indiranagar Store) is seeded in transit — receive it, or short-receive it and
   watch a stock Discrepancy appear.
8. Mobile: sign in with the same credentials, then **Bill** — scan or type the
   same barcode, tap a payment method, press Bill, and the receipt opens. The
   sale lands in the very same ledger the web app is reading.

Also worth a look: **Inventory → Products & SKUs → New SKU** creates a SKU whose
opening stock is written as an `opening` movement, and the **Adjust** action on
Store/Warehouse Stock posts count corrections, manual adjustments and damage write-offs
— all as ledger entries, since nothing in the system can set a stock number
directly. Billing with no tender parks the invoice unpaid; settle it later from
**Sales → Invoices**.

## The mobile app

Mobile is not a shrunken web app — it is a counter-first client over the same
`@shop/state` hooks. Five bottom tabs, sized for one hand:

| Tab | Does |
|---|---|
| **Home** | Today's takings, bills, unpaid and out-of-stock counts; what needs a person |
| **Bill** | Scan → cart → tender → receipt. Carries a live cart badge |
| **Stock** | Shelf stock per store, filterable to Low / Out |
| **Closing** | Day-end preview, cash count, submit and approve |
| **More** | Selling store, theme, session, sign out |

Billing is the tab everything is arranged around. One field takes both a
scanner's Enter keystroke (exact barcode → straight into the cart, focus
retained for the next scan) and thumb typing, and its results overlay the cart
rather than pushing it down. The running total and the single Charge action are
pinned to the bottom within thumb reach; the tax breakup, price overrides and
split tenders that web spreads across a wide screen are folded behind one tap
rather than dropped. Cash received is a change calculator only — it is never
sent as a payment, so an over-tendered note cannot record more than the invoice.

Every interactive element is at least 48dp (`touch` in `lib/theme.ts`), icon-only
controls carry `accessibilityLabel`, and the whole thing is themed from the same
shared tokens in both light and dark.

Purchases, transfers, onboarding and administration stay on the web app; the
More tab says so plainly rather than shipping half-screens.

## Swapping the mock for a real API

Each app has exactly one binding to change — `apps/web/src/lib/repositories.ts`
and `apps/mobile/lib/repositories.ts`:

```ts
export const repositories: Repositories = createMockRepositories();
//                                       → createHttpRepositories({ baseUrl: '/api' })
```

`packages/data/src/http/client.ts` already implements the full `Repositories`
interface (every method throwing "not implemented"). Because the binding is
explicitly annotated `Repositories`, any drift between the two implementations
is a compile error — the swap is typechecked, not hoped for.

## Phase 1 scope notes

- **Working end to end**: masters, product & SKU creation (with opening stock),
  stock adjustments / damage write-offs / stock-count corrections, transfers
  between any two locations (dispatch → receive, opt-in auto-receive),
  store + linked-warehouse rollup, Quick Billing → invoice → payments (split, idempotent,
  settleable later), stock overview, movements ledger, day-end closing,
  discrepancy raise + resolve, audit log, dashboards.
- **Modelled but read-only**: purchases (PO/GRN), orders with reservations
  (exercised in tests, not yet given a screen), returns.
- **Mobile scope**: billing, stock lookup, day-end closing and the home
  dashboard. Transfers, purchases, onboarding and administration are web-only
  for now — the shared hooks are all there, so they are screens, not plumbing.
- **Mobile styling**: NativeWind v4 still pins Tailwind v3 while the web app is
  on Tailwind v4, so mobile consumes the shared tokens through `StyleSheet`
  instead (the fallback the build spec allows for). Tokens — and therefore the
  visual language — stay shared. Revisit when NativeWind ships Tailwind v4
  support.
- **Out of scope**: offline billing queue, real auth, materialised balances.
```
