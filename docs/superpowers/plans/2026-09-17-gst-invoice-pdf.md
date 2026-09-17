# GST Invoice PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Print an A4 GST tax invoice matching the sample, downloadable from the invoice detail screen.

**Architecture:** Five prerequisites the sample needs and the schema lacks, then a pure view model, then an HTML renderer, then the endpoint. The prerequisites are engine-independent and individually testable; the renderer — the only part with deployment risk — comes last so nothing else is blocked by it.

**Spec:** `docs/superpowers/specs/2026-09-17-gst-invoice-pdf-design.md`, which builds on `2026-08-31-bill-printing-design.md`.

## Global Constraints

- Business rules are pure functions in `packages/core/src/logic/` with a sibling `*.test.ts`.
- Both `packages/data/src/http/` and `packages/data/src/mock/` implement every repository change; the two diverging has caused four bugs in this project already.
- `pnpm run typecheck` and `pnpm run test` both pass before each commit. Vitest does not typecheck.
- Prisma changes: `prisma generate`, confirm with `migrate diff`, then `db push`. Additive changes need no approval; a `DROP` does.
- Money uses `roundMoney` from `@shop/core`; never raw float comparison in assertions.

---

### Task 1: Amount in words

**Files:** create `packages/core/src/logic/amount-in-words.ts` and its test; export from `logic/index.ts`.

**Produces:** `amountInWords(amount: number): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { amountInWords } from './amount-in-words.ts';

describe('amountInWords', () => {
  it('writes whole rupees', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only');
    expect(amountInWords(1)).toBe('One Rupee Only');
    expect(amountInWords(552000)).toBe('Five Lakh Fifty Two Thousand Rupees Only');
  });

  it('uses lakh and crore, not million', () => {
    // A bill printed in Dholpur reading "five hundred fifty-two thousand" is
    // wrong in the way that makes a customer distrust the rest of the page.
    expect(amountInWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
    expect(amountInWords(12345678)).toContain('Crore');
  });

  it('handles the teens and tens that trip naive implementations', () => {
    expect(amountInWords(11)).toBe('Eleven Rupees Only');
    expect(amountInWords(19)).toBe('Nineteen Rupees Only');
    expect(amountInWords(20)).toBe('Twenty Rupees Only');
    expect(amountInWords(90)).toBe('Ninety Rupees Only');
  });

  it('adds paise only when there are any', () => {
    expect(amountInWords(1234.5)).toBe(
      'One Thousand Two Hundred Thirty Four Rupees and Fifty Paise Only',
    );
    expect(amountInWords(5.01)).toBe('Five Rupees and One Paisa Only');
    expect(amountInWords(100)).not.toContain('Paise');
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `pnpm --filter @shop/core exec vitest run src/logic/amount-in-words.test.ts`

- [ ] **Step 3: Implement**, splitting the rupee part on the Indian grouping (crore, lakh, thousand, hundred, then the last two digits) and the paise as a two-digit number. Singular "Rupee"/"Paisa" at one.

- [ ] **Step 4: Run it and watch it pass. Run `pnpm run typecheck`.**

- [ ] **Step 5: Commit.**

---

### Task 2: State codes

**Files:** create `packages/core/src/logic/state-codes.ts` and its test; export from `logic/index.ts`.

**Produces:** `stateNameOf(code: string | undefined): string | undefined`, `GST_STATE_NAMES: Readonly<Record<string, string>>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { GST_STATE_NAMES, stateNameOf } from './state-codes.ts';

describe('stateNameOf', () => {
  it('names the codes a bill prints', () => {
    expect(stateNameOf('08')).toBe('RAJASTHAN');
    expect(stateNameOf('27')).toBe('MAHARASHTRA');
    expect(stateNameOf('29')).toBe('KARNATAKA');
  });

  it('returns nothing rather than throwing on an unknown code', () => {
    // A wrong code is a data-entry problem; the bill should still print.
    expect(stateNameOf('99')).toBeUndefined();
    expect(stateNameOf(undefined)).toBeUndefined();
  });

  it('covers every code it claims to know', () => {
    for (const code of Object.keys(GST_STATE_NAMES)) {
      expect(stateNameOf(code)).toBeTruthy();
      expect(code).toMatch(/^\d{2}$/);
    }
  });
});
```

- [ ] **Step 2–5:** as Task 1 — fail, implement the 36-entry map, pass, typecheck, commit.

---

### Task 3: HSN on the invoice line

**Files:** `apps/api/prisma/schema.prisma`, `apps/api/src/routes/sales.ts`, `packages/core/src/entities/sales.ts`, `packages/data/src/{http,mock}`, mock test.

**Produces:** `InvoiceLine.hsnCode` captured at billing.

- [ ] **Step 1: Write the failing test** in `packages/data/src/mock/repositories.test.ts`:

```ts
it('snapshots the HSN onto the line it billed', async () => {
  // Like skuCode and name: an HSN corrected on the SKU next month must not
  // change the classification a bill was issued under.
  const { repos, store, counterId, actor } = await setup();
  const category = (await repos.masters.categories())[0]!;
  const product = await repos.products.createProduct({
    name: 'Tyre', categoryId: category.id, createdBy: actor,
  });
  const uom = (await repos.masters.unitsOfMeasure())[0]!;
  const tax = (await repos.masters.taxes())[0]!;
  const sku = await repos.products.createSku({
    productId: product.id, code: 'TY-1', hsnCode: '4011',
    uomId: uom.id, taxId: tax.id, createdBy: actor,
    openingStock: { locationId: store.id, qty: 5 },
  });

  const invoice = await repos.invoices.create({
    storeId: store.id, counterId, lines: [{ skuId: sku.id, qty: 1 }], createdBy: actor,
  });

  expect(invoice.lines[0]!.hsnCode).toBe('4011');

  await repos.products.updateSku(sku.id, { hsnCode: '9999' }, actor);
  expect((await repos.invoices.byId(invoice.id))?.lines[0]!.hsnCode).toBe('4011');
});
```

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Add the column.** In `schema.prisma`, `InvoiceLine` gains:

```prisma
  /// Snapshot, like skuCode: the classification this bill was issued under.
  hsnCode      String?
```

Run `prisma generate`, confirm `migrate diff` shows only an `ADD COLUMN`, then `db push`.

- [ ] **Step 4: Carry it through.** Add `hsnCode: z.string().optional()` to `saleLineSchema`'s invoice-line shape in `packages/core/src/entities/sales.ts`; add it to `lineData` in `writeInvoice` and to the line projection in `apps/api/src/routes/sales.ts`; add it to `toLine` in `packages/data/src/http/sales.ts`; set it from the SKU in the mock's line pricing.

- [ ] **Step 5: Pass, typecheck, test, commit.**

---

### Task 4: Terms and bank details on the entity

**Files:** `apps/api/prisma/schema.prisma`, `apps/api/src/routes/catalogue.ts`, `packages/core/src/entities/bill-from.ts`, `packages/data/src/**`, `apps/web/src/pages/onboarding/bill-from-card.tsx`.

**Produces:** `BillFrom.terms/bankName/bankAccount/bankIfsc/bankBranch`, editable in Masters.

- [ ] **Step 1: Add the columns**

```prisma
  /// One entry per numbered line, so the renderer does not have to guess
  /// where to split a blob.
  terms        String[] @default([])
  bankName     String?
  bankAccount  String?
  bankIfsc     String?
  bankBranch   String?
```

Not snapshotted onto the invoice: these are context printed on the page, not facts the document asserts. A reprint should carry the current bank account, because that is where the customer is being asked to pay.

- [ ] **Step 2: Thread through** the core schema, `NewBillFrom`/`BillFromPatch`, both create and patch routes, the HTTP client and the mock — exactly as `email` and `phones` already are.

- [ ] **Step 3: Extend the Masters form.** `EntityFields` gains bank name, account, IFSC and branch. Terms reuse the repeatable-row pattern already written for phones — extract it rather than writing it twice.

- [ ] **Step 4: Typecheck, test, commit.**

---

### Task 5: The view model

**Files:** create `packages/core/src/logic/invoice-pdf.ts` and its test; export from `logic/index.ts`.

**Consumes:** `amountInWords` (Task 1), `stateNameOf` (Task 2), `InvoiceLine.hsnCode` (Task 3), `BillFrom.terms`/bank (Task 4).

**Produces:** `buildInvoicePdfModel(input): InvoicePdfModel` with the shape given in the spec.

- [ ] **Step 1: Write the failing test**

```ts
describe('buildInvoicePdfModel', () => {
  it('fills CGST and SGST within a state and leaves IGST zero', () => { /* … */ });
  it('fills IGST across a state border and leaves the halves zero', () => { /* … */ });
  it('numbers lines from one', () => { /* … */ });
  it('leaves a missing HSN blank rather than printing undefined', () => { /* … */ });
  it('names the buyer state from the code', () => { /* … */ });
  it('writes the payable amount in words', () => { /* … */ });
});
```

Write each body against the real shape; do not leave the comments in.

- [ ] **Step 2–5:** fail, implement as a pure function over the invoice plus the entity's terms and bank, pass, typecheck, commit.

---

### Task 6: The renderer and the endpoint

The only task with deployment risk, and deliberately last.

**Files:** `apps/api/package.json`, `apps/api/src/pdf/invoice-html.ts`, `apps/api/src/pdf/render.ts`, `apps/api/src/routes/sales.ts`, `apps/web/src/pages/sales/invoice-detail.tsx`, `vercel.json`.

- [ ] **Step 1: Install** `puppeteer-core` and `@sparticuz/chromium`, and add both to the esbuild `--external:` list so the binary is not bundled.

- [ ] **Step 2: Write the HTML.** A template function over `InvoicePdfModel` producing the ruled A4 layout: header block, line table padded to a fixed row count, totals, terms, bank line, signatory. `@page { size: A4; margin: 10mm }` and `thead { display: table-header-group }` so a continued table repeats its headings.

- [ ] **Step 3: Render.** A module owning one browser launch, with JavaScript disabled in the page and request interception refusing every outbound URL — the HTML is ours today but Phase 2 makes it user-authored, and the sandbox is far harder to retrofit than to include.

- [ ] **Step 4: The endpoint.** `GET /invoices/:id/pdf?copy=original|duplicate|triplicate`, company-scoped, returning `application/pdf` with a `Content-Disposition` naming the invoice number.

- [ ] **Step 5: Golden test.** Render a fixed invoice, extract its text, assert it contains the invoice number, both GSTINs, each HSN and the amount payable. Text rather than bytes, so a Chromium upgrade does not break it.

- [ ] **Step 6: Pagination test.** A 40-line invoice yields more than one page and prints its totals once.

- [ ] **Step 7: The button.** Download and print on invoice detail.

- [ ] **Step 8: Raise `maxDuration`** in `vercel.json` if a cold render approaches 30s, and verify on the deployed URL — a local render proves nothing about the Vercel filesystem.

- [ ] **Step 9: Commit and deploy.**

**If Chromium cannot be packaged on Vercel**, stop and report rather than silently switching engines: the fallback changes what Phase 2 can do, and that is the user's call.
