# Configurable Invoice Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin configure, per Bill From entity, the shape and starting number of its tax-invoice series, resetting each Indian financial year.

**Architecture:** A pure template layer in `@shop/core` (parse, validate, render) plus a stored counter row per `(billFromId, fy)` allocated inside the existing checkout transaction. Nothing parses a sequence back out of a formatted number, so templates stay editable and padding width stops mattering.

**Tech Stack:** TypeScript (ESM, `.ts` extensions in imports), Zod, Prisma + Postgres, Fastify, React + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-invoice-series-design.md`

## Global Constraints

- **GST invoice numbers are at most 16 characters**, using only `A-Z`, `0-9`, `/` and `-`.
- **One sequence per entity per financial year.** `{BRANCH}` is a display label and must never split the counter.
- **Financial year runs 1 April – 31 March**, written `2026-27`.
- **Issued invoices are immutable.** No task renumbers an existing row.
- **An entity with `invoiceTemplate = null` keeps today's `INV-{BRANCH}-{SEQ:6}` behaviour**, produced by the existing `nextDocNumber`. Every task must preserve this.
- **Only tax invoices (`INV`) change.** `SO`, `RET`, `PO`, `GRN`, `PRET` keep `nextDocNumber` untouched.
- Imports inside the monorepo use explicit `.ts` extensions, matching every existing file.
- Schema changes are applied with `pnpm --filter @shop/api db:push` then `db:generate` — this project uses `prisma db push`, not migrations.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/core/src/logic/financial-year.ts` (create) | `financialYearOf` — the 1 April boundary, nothing else |
| `packages/core/src/logic/invoice-template.ts` (create) | Token rendering and template validation |
| `packages/core/src/entities/bill-from.ts` (modify) | Two new optional fields on the entity schema |
| `packages/core/src/logic/index.ts` (modify) | Barrel exports |
| `apps/api/prisma/schema.prisma` (modify) | `InvoiceSeries` model, two `BillFrom` columns |
| `apps/api/src/routes/sales.ts` (modify) | Allocator + `writeInvoice` wiring |
| `apps/api/src/routes/catalogue.ts` (modify) | Accept and validate the fields on create/update |
| `packages/data/src/mock/repositories.ts` (modify) | Same numbering in the mock backend |
| `apps/web/src/pages/onboarding/bill-from-card.tsx` (modify) | Invoice numbering UI with live preview |

Tasks 1–3 are pure and independent of the database; 4–7 are backend; 8 is UI.

---

### Task 1: Financial year

**Files:**
- Create: `packages/core/src/logic/financial-year.ts`
- Test: `packages/core/src/logic/financial-year.test.ts`
- Modify: `packages/core/src/logic/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `financialYearOf(businessDate: string): string` — takes `YYYY-MM-DD`, returns `YYYY-YY` (e.g. `2026-27`).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/logic/financial-year.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { financialYearOf } from './financial-year.ts';

describe('financialYearOf', () => {
  it('opens a new year on 1 April', () => {
    expect(financialYearOf('2026-04-01')).toBe('2026-27');
  });

  it('keeps 31 March in the year that began the previous April', () => {
    expect(financialYearOf('2027-03-31')).toBe('2026-27');
  });

  it('places a mid-year date in the year that began that April', () => {
    expect(financialYearOf('2026-09-18')).toBe('2026-27');
    expect(financialYearOf('2027-01-05')).toBe('2026-27');
  });

  it('rolls the century correctly', () => {
    expect(financialYearOf('2099-04-01')).toBe('2099-00');
    expect(financialYearOf('2100-04-01')).toBe('2100-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shop/core exec vitest run src/logic/financial-year.test.ts`
Expected: FAIL — `Failed to load url ./financial-year.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/logic/financial-year.ts`:

```ts
/**
 * The Indian financial year a business date falls in, written `2026-27`.
 *
 * The year turns on 1 April, so March belongs to the year that began the
 * previous April. Taken from the business date rather than the wall clock so a
 * bill and the day-end closing that counts it cannot disagree about which day —
 * and so which year — a sale belongs to.
 */
export const financialYearOf = (businessDate: string): string => {
  const [year, month] = businessDate.split('-').map(Number);
  const start = (month as number) >= 4 ? (year as number) : (year as number) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shop/core exec vitest run src/logic/financial-year.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Export it**

In `packages/core/src/logic/index.ts`, add in alphabetical position (after `./closing.ts`):

```ts
export * from './financial-year.ts';
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/logic/financial-year.ts packages/core/src/logic/financial-year.test.ts packages/core/src/logic/index.ts
git commit -m "Add the Indian financial year boundary"
```

---

### Task 2: Template rendering and validation

**Files:**
- Create: `packages/core/src/logic/invoice-template.ts`
- Test: `packages/core/src/logic/invoice-template.test.ts`
- Modify: `packages/core/src/logic/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_INVOICE_TEMPLATE: string` — `'INV-{BRANCH}-{SEQ:6}'`
  - `renderInvoiceNumber(template: string, parts: { fy: string; branch: string; seq: number }): string` — `fy` is the four-digit form `2026-27`
  - `invoiceTemplateProblem(template: string, branchCodes?: readonly string[]): string | undefined` — a human-readable reason, or nothing when valid

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/logic/invoice-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { invoiceTemplateProblem, renderInvoiceNumber } from './invoice-template.ts';

const parts = { fy: '2026-27', branch: 'STRA', seq: 501 };

describe('renderInvoiceNumber', () => {
  it('renders each token', () => {
    expect(renderInvoiceNumber('SMA/{FY}/{SEQ:5}', parts)).toBe('SMA/26-27/00501');
    expect(renderInvoiceNumber('{FYYY}/{SEQ:3}', parts)).toBe('2026-27/501');
    expect(renderInvoiceNumber('{BRANCH}-{SEQ:6}', parts)).toBe('STRA-000501');
  });

  it('reproduces the legacy format', () => {
    expect(renderInvoiceNumber('INV-{BRANCH}-{SEQ:6}', { ...parts, seq: 1 })).toBe(
      'INV-STRA-000001',
    );
  });

  it('does not truncate a sequence wider than its padding', () => {
    // Padding is a minimum, not a maximum. Truncating would repeat a number.
    expect(renderInvoiceNumber('{SEQ:3}', { ...parts, seq: 12345 })).toBe('12345');
  });
});

describe('invoiceTemplateProblem', () => {
  it('accepts a well-formed template', () => {
    expect(invoiceTemplateProblem('SMA/{FY}/{SEQ:5}', ['STRA'])).toBeUndefined();
    expect(invoiceTemplateProblem('INV-{BRANCH}-{SEQ:6}', ['STRA'])).toBeUndefined();
  });

  it('upper-cases rather than rejecting lower case', () => {
    expect(invoiceTemplateProblem('sma/{fy}/{seq:5}', ['STRA'])).toBeUndefined();
  });

  it('requires exactly one sequence token', () => {
    expect(invoiceTemplateProblem('SMA/{FY}', ['STRA'])).toMatch(/SEQ/);
    expect(invoiceTemplateProblem('{SEQ:3}/{SEQ:3}', ['STRA'])).toMatch(/only one/i);
  });

  it('refuses a template that renders over sixteen characters', () => {
    const problem = invoiceTemplateProblem('SMAUTOMOBILES/{FYYY}/{SEQ:6}', ['STRA']);
    expect(problem).toMatch(/16/);
  });

  it('measures the longest branch code, not the first', () => {
    // A template that fits one branch but not another must be refused.
    expect(invoiceTemplateProblem('{BRANCH}/{FYYY}/{SEQ:5}', ['S1'])).toBeUndefined();
    expect(invoiceTemplateProblem('{BRANCH}/{FYYY}/{SEQ:5}', ['S1', 'STORE-A'])).toMatch(/16/);
  });

  it('refuses characters GST does not allow outside tokens', () => {
    expect(invoiceTemplateProblem('SMA_{SEQ:5}', ['STRA'])).toMatch(/letters, digits/);
  });

  it('refuses an unknown token', () => {
    expect(invoiceTemplateProblem('{MONTH}/{SEQ:5}', ['STRA'])).toMatch(/Unknown token/);
  });

  it('refuses a zero-width sequence', () => {
    expect(invoiceTemplateProblem('SMA/{SEQ:0}', ['STRA'])).toMatch(/between 1 and 9/);
  });

  it('refuses an empty template', () => {
    expect(invoiceTemplateProblem('   ', ['STRA'])).toMatch(/required/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shop/core exec vitest run src/logic/invoice-template.test.ts`
Expected: FAIL — `Failed to load url ./invoice-template.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/logic/invoice-template.ts`:

```ts
/**
 * The shape of a tax-invoice number, as an admin writes it.
 *
 * Tokens are substituted; everything else is literal. A stored counter supplies
 * the sequence, so nothing here ever parses a number back apart — which is what
 * lets a template be edited mid-year without disturbing the series.
 */

/** What an entity numbers by until someone configures otherwise. */
export const DEFAULT_INVOICE_TEMPLATE = 'INV-{BRANCH}-{SEQ:6}';

const TOKEN = /\{(?:FYYY|FY|BRANCH|SEQ:\d)\}/g;
const SEQ_TOKEN = /\{SEQ:(\d)\}/g;

/** GST permits these characters in an invoice number, and no others. */
const LITERAL = /^[A-Z0-9/-]*$/;

/** The GST ceiling on an invoice number. */
const MAX_LENGTH = 16;

export interface InvoiceNumberParts {
  /** The financial year in its four-digit form, `2026-27`. */
  fy: string;
  /** The billing branch's code, for `{BRANCH}`. A label only. */
  branch: string;
  seq: number;
}

export const renderInvoiceNumber = (template: string, parts: InvoiceNumberParts): string =>
  template.toUpperCase().replace(TOKEN, (token) => {
    if (token === '{FYYY}') return parts.fy;
    if (token === '{FY}') return parts.fy.slice(2);
    if (token === '{BRANCH}') return parts.branch;
    // Padding is a floor. A sequence that outgrows it renders wider rather than
    // truncated, because a truncated number is a repeated number.
    return String(parts.seq).padStart(Number(token.slice(5, 6)), '0');
  });

/**
 * Why a template cannot be used, or nothing.
 *
 * Checked when it is saved rather than when a bill is raised: a counter is no
 * place to discover that a number cannot be produced.
 */
export const invoiceTemplateProblem = (
  template: string,
  branchCodes: readonly string[] = [],
): string | undefined => {
  const value = template.trim().toUpperCase();
  if (!value) return 'A template is required.';

  const seqTokens = value.match(SEQ_TOKEN) ?? [];
  if (seqTokens.length === 0) {
    return 'Add a {SEQ:n} token — it is what makes each number unique.';
  }
  if (seqTokens.length > 1) return 'Use only one {SEQ:n} token.';

  const width = Number(seqTokens[0]!.slice(5, 6));
  if (width < 1) return 'The {SEQ:n} width must be between 1 and 9.';

  const literal = value.replace(TOKEN, '');
  if (/[{}]/.test(literal)) {
    return 'Unknown token. Use {FY}, {FYYY}, {BRANCH} or {SEQ:n}.';
  }
  if (!LITERAL.test(literal)) {
    return 'Use only letters, digits, / and - outside tokens.';
  }

  // The worst case decides: the widest branch code this entity may bill from,
  // and a counter that has filled its padding.
  const branch = [...branchCodes].sort((a, b) => b.length - a.length)[0] ?? '';
  const rendered = renderInvoiceNumber(value, {
    fy: '2026-27',
    branch,
    seq: Number('9'.repeat(width)),
  });
  if (rendered.length > MAX_LENGTH) {
    return `This renders ${rendered.length} characters; GST allows ${MAX_LENGTH}.`;
  }

  return undefined;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shop/core exec vitest run src/logic/invoice-template.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Export it**

In `packages/core/src/logic/index.ts`, add after `./inventory.ts`:

```ts
export * from './invoice-template.ts';
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/logic/invoice-template.ts packages/core/src/logic/invoice-template.test.ts packages/core/src/logic/index.ts
git commit -m "Add the invoice number template, rendered and validated"
```

---

### Task 3: The fields on the entity schema

**Files:**
- Modify: `packages/core/src/entities/bill-from.ts`
- Test: `packages/core/src/entities/bill-from.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BillFrom` gains `invoiceTemplate?: string` and `invoiceSeqStart: number` (defaulting to `1`).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/entities/bill-from.test.ts`:

```ts
describe('invoice numbering fields', () => {
  const base = { id: 'bf_1', companyId: 'co_1', legalName: 'S.M Automobiles Pvt Ltd' };

  it('defaults to no template and a start of one', () => {
    const parsed = billFromSchema.parse(base);
    expect(parsed.invoiceTemplate).toBeUndefined();
    expect(parsed.invoiceSeqStart).toBe(1);
  });

  it('keeps a configured template and start', () => {
    const parsed = billFromSchema.parse({
      ...base,
      invoiceTemplate: 'SMA/{FY}/{SEQ:5}',
      invoiceSeqStart: 501,
    });
    expect(parsed.invoiceTemplate).toBe('SMA/{FY}/{SEQ:5}');
    expect(parsed.invoiceSeqStart).toBe(501);
  });

  it('refuses a start below one', () => {
    expect(() => billFromSchema.parse({ ...base, invoiceSeqStart: 0 })).toThrow();
  });
});
```

Ensure `billFromSchema` and `describe` are imported at the top of that file; add to the existing import if not.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shop/core exec vitest run src/entities/bill-from.test.ts`
Expected: FAIL — `expected undefined to be 1` on the default test.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/entities/bill-from.ts`, inside `billFromSchema`, immediately after the `locationIds` field:

```ts
  /** The shape of this entity's invoice numbers. Null keeps the legacy format. */
  invoiceTemplate: z.string().trim().min(1).optional(),
  /** What the counter starts at each financial year. */
  invoiceSeqStart: z.number().int().min(1).default(1),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shop/core test`
Expected: PASS — all core tests including the three new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entities/bill-from.ts packages/core/src/entities/bill-from.test.ts
git commit -m "Give a bill-from entity its invoice numbering fields"
```

---

### Task 4: Schema — the counter row

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `InvoiceSeries` with `@@unique([billFromId, fy])`, mapped to table `invoice_series`; `BillFrom.invoiceTemplate: String?` and `BillFrom.invoiceSeqStart: Int @default(1)`.

- [ ] **Step 1: Add the columns to `BillFrom`**

In `apps/api/prisma/schema.prisma`, inside `model BillFrom` (around line 331), directly above `active`:

```prisma
  /// The shape of this entity's invoice numbers. Null keeps the legacy
  /// INV-{BRANCH}-{SEQ:6} format, so an untouched company sees no change.
  invoiceTemplate String?
  /// What the counter starts at in each financial year.
  invoiceSeqStart Int     @default(1)
```

and add to its relation block, beneath `invoices  Invoice[]`:

```prisma
  series    InvoiceSeries[]
```

- [ ] **Step 2: Add the model**

Directly after the closing brace of `model BillFromLocation`:

```prisma
/// The running invoice number for one entity in one financial year.
///
/// A stored counter rather than max(number) + 1: a configurable start cannot be
/// expressed as a maximum, and the old lexical lookup is only correct while
/// every number shares one width.
model InvoiceSeries {
  id         String @id @default(cuid())
  companyId  String
  billFromId String
  /// `2026-27`, as the financial year is written.
  fy         String
  /// The number the next invoice in this series will take.
  nextSeq    Int

  billFrom BillFrom @relation(fields: [billFromId], references: [id], onDelete: Cascade)

  @@unique([billFromId, fy])
  @@index([companyId])
  @@map("invoice_series")
}
```

- [ ] **Step 3: Apply and generate**

```bash
pnpm --filter @shop/api db:push
pnpm --filter @shop/api db:generate
```

Expected: `db:push` reports the new table and two new columns; `db:generate` regenerates the client with no error.

- [ ] **Step 4: Verify the client typechecks**

Run: `pnpm --filter @shop/api typecheck`
Expected: PASS — no errors. (Nothing references the model yet.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "Add the invoice series counter"
```

---

### Task 5: Allocating a number

**Files:**
- Modify: `apps/api/src/routes/sales.ts` (add the allocator near `nextDocNumber` at line 250; call it from `writeInvoice` at line 434)
- Test: `apps/api/src/invoice-series.test.ts` (create)

**Interfaces:**
- Consumes: `financialYearOf`, `renderInvoiceNumber`, `DEFAULT_INVOICE_TEMPLATE` from `@shop/core`; `nextDocNumber` already in this file.
- Produces: `nextInvoiceNumber(tx, args): Promise<string>` where `args` is `{ companyId: string; billFrom?: { id?: string; invoiceTemplate?: string | null; invoiceSeqStart?: number }; branchCode: string; businessDate: string }`.

**Note on the allocation statement.** The upsert and the increment must be one statement, or two tills read the same counter. Prisma's `upsert` cannot both increment and return the pre-increment value, so this uses `$queryRaw`. On insert it stores `start + 1` and returns `start`; on conflict it increments and returns the previous value. Both branches therefore return the number being allocated.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/invoice-series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_INVOICE_TEMPLATE, financialYearOf, renderInvoiceNumber } from '@shop/core';

/**
 * The allocator's SQL needs a database, so these cover only the composition
 * rule applied around it: which template is chosen, and how a sequence becomes
 * a number.
 *
 * Atomicity is NOT covered here and cannot be — the mock backend is
 * synchronous, so two "parallel" allocations against it are really sequential.
 * It rests on the single INSERT ... ON CONFLICT statement, which Postgres
 * serialises, with @@unique([companyId, number]) as the backstop. Task 9 checks
 * it against a real database.
 */
describe('composing an invoice number', () => {
  it('uses the entity template when one is configured', () => {
    const number = renderInvoiceNumber('SMA/{FY}/{SEQ:5}', {
      fy: financialYearOf('2026-09-18'),
      branch: 'STRA',
      seq: 501,
    });
    expect(number).toBe('SMA/26-27/00501');
  });

  it('falls back to the legacy shape when none is', () => {
    const number = renderInvoiceNumber(DEFAULT_INVOICE_TEMPLATE, {
      fy: financialYearOf('2026-09-18'),
      branch: 'STRA',
      seq: 1,
    });
    expect(number).toBe('INV-STRA-000001');
  });

  it('carries the sequence across a branch under one entity', () => {
    const fy = financialYearOf('2026-09-18');
    const first = renderInvoiceNumber('SMA/{FY}/{SEQ:5}', { fy, branch: 'STRA', seq: 501 });
    const second = renderInvoiceNumber('SMA/{FY}/{SEQ:5}', { fy, branch: 'STRB', seq: 502 });
    expect([first, second]).toEqual(['SMA/26-27/00501', 'SMA/26-27/00502']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shop/api exec vitest run src/invoice-series.test.ts`
Expected: FAIL — `financialYearOf` / `renderInvoiceNumber` are not exported from `@shop/core` unless Tasks 1 and 2 are complete. If those are done, this passes immediately; in that case skip to Step 3, as this file documents composition rather than driving new code.

- [ ] **Step 3: Add the allocator**

In `apps/api/src/routes/sales.ts`, extend the `@shop/core` import at the top of the file with `DEFAULT_INVOICE_TEMPLATE`, `financialYearOf` and `renderInvoiceNumber`. Then add directly beneath `nextDocNumber` (after line 276):

```ts
/**
 * The next tax-invoice number for one entity in one financial year.
 *
 * The counter is a stored row, not the highest number issued: a configurable
 * start cannot be expressed as a maximum, and the lexical lookup nextDocNumber
 * uses is only correct while every number shares one width.
 *
 * The upsert and the increment are one statement so two tills cannot read the
 * same value — Postgres serialises the row and the loser waits. On insert the
 * row stores start + 1 and returns start; on conflict it increments and returns
 * what it replaced. Either way the returned value is the one being allocated.
 */
async function nextInvoiceNumber(
  tx: Tx,
  args: {
    companyId: string;
    billFrom?: { id?: string; invoiceTemplate?: string | null; invoiceSeqStart?: number };
    branchCode: string;
    businessDate: string;
  },
): Promise<string> {
  // No entity means no series to draw on — the legacy path, unchanged.
  if (!args.billFrom?.id) {
    return nextDocNumber(tx, args.companyId, 'INV', args.branchCode);
  }

  const fy = financialYearOf(args.businessDate);
  const start = args.billFrom.invoiceSeqStart ?? 1;

  const [row] = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO invoice_series ("id", "companyId", "billFromId", "fy", "nextSeq")
    VALUES (gen_random_uuid()::text, ${args.companyId}, ${args.billFrom.id}, ${fy}, ${start + 1})
    ON CONFLICT ("billFromId", "fy")
    DO UPDATE SET "nextSeq" = invoice_series."nextSeq" + 1
    RETURNING invoice_series."nextSeq" - 1 AS seq
  `;

  return renderInvoiceNumber(args.billFrom.invoiceTemplate || DEFAULT_INVOICE_TEMPLATE, {
    fy,
    branch: args.branchCode,
    seq: Number(row!.seq),
  });
}
```

**Why `gen_random_uuid()::text` and not a cuid.** `@shop/api` has no cuid package — I checked, and `@default(cuid())` is generated by the Prisma *client*, which raw SQL bypasses. The column would otherwise be left without a value. `gen_random_uuid()` is built into Postgres 13+ and needs no extension. The id is internal to the counter row and never printed.

- [ ] **Step 4: Wire it into `writeInvoice`**

In `writeInvoice`, the `number` field currently reads:

```ts
      number: await nextDocNumber(tx, args.companyId, 'INV', args.store.code),
```

The business date is computed further down the same object as `businessDateOf(at)`. Hoist it above the `prisma.invoice.create` call so both can use it, then replace the `number` line:

```ts
  const businessDate = businessDateOf(at);
```

```ts
      number: await nextInvoiceNumber(tx, {
        companyId: args.companyId,
        billFrom: args.billFrom,
        branchCode: args.store.code,
        businessDate,
      }),
```

and change the existing `businessDate: businessDateOf(at),` line to `businessDate,`.

`args.billFrom` is the snapshot passed by both callers. Widen its inline type in the `writeInvoice` signature to carry the two new fields:

```ts
    billFrom?: {
      id?: string;
      legalName: string;
      gstin?: string;
      pan?: string;
      addressLine?: string;
      email?: string;
      phones: string[];
      invoiceTemplate?: string | null;
      invoiceSeqStart?: number;
    };
```

- [ ] **Step 5: Pass the fields from the checkout route**

At `apps/api/src/routes/sales.ts:896`, the `billFrom` object is built from the resolved entity. Add the two fields:

```ts
            invoiceTemplate: entity.invoiceTemplate,
            invoiceSeqStart: entity.invoiceSeqStart,
```

Do the same at the other `writeInvoice` caller (line 765) if it resolves an entity; if it passes no `billFrom`, leave it — the allocator falls back to `nextDocNumber`.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @shop/api exec vitest run src/invoice-series.test.ts
pnpm --filter @shop/api typecheck
pnpm --filter @shop/api test
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/sales.ts apps/api/src/invoice-series.test.ts
git commit -m "Number a tax invoice from its entity's series"
```

---

### Task 6: Configuring it over the API

**Files:**
- Modify: `apps/api/src/routes/catalogue.ts` — `publicBillFrom` (line 199), `POST /bill-from` (line 590), `PATCH /bill-from/:id` (line 637)

**Interfaces:**
- Consumes: `invoiceTemplateProblem` from `@shop/core`.
- Produces: both routes accept `invoiceTemplate: string | null` and `invoiceSeqStart: number`; `publicBillFrom` returns them.

- [ ] **Step 1: Return the fields**

Add to `publicBillFrom`, above `active`:

```ts
  invoiceTemplate: row.invoiceTemplate ?? undefined,
  invoiceSeqStart: row.invoiceSeqStart,
```

- [ ] **Step 2: Add a shared validator**

Near the top of the bill-from section of `catalogue.ts`, after the `publicBillFrom` definition:

```ts
/**
 * Refuses a template that cannot produce a legal number, measured against the
 * branches this entity may actually bill from — the longest code is what
 * decides whether it fits in sixteen characters.
 */
async function assertTemplateUsable(
  template: string | null | undefined,
  locationIds: readonly string[],
) {
  if (!template) return;
  const locations = await prisma.stockLocation.findMany({
    where: { id: { in: [...locationIds] } },
    select: { code: true },
  });
  const problem = invoiceTemplateProblem(
    template,
    locations.map((l) => l.code),
  );
  if (problem) throw new HttpError(400, problem);
}
```

Add `invoiceTemplateProblem` to this file's `@shop/core` import.

- [ ] **Step 3: Accept them on create**

In the `POST /bill-from` Zod body, after `locationIds`:

```ts
        invoiceTemplate: z.string().trim().min(1).optional(),
        invoiceSeqStart: z.number().int().min(1).default(1),
```

After the existing `await assertLocationsInCompany(...)` line:

```ts
    await assertTemplateUsable(body.invoiceTemplate, body.locationIds);
```

and in the `prisma.billFrom.create` data block, after `phones`:

```ts
        invoiceTemplate: body.invoiceTemplate?.toUpperCase() || null,
        invoiceSeqStart: body.invoiceSeqStart,
```

- [ ] **Step 4: Accept them on update**

In the `PATCH /bill-from/:id` Zod body add:

```ts
        invoiceTemplate: z.string().trim().min(1).nullable().optional(),
        invoiceSeqStart: z.number().int().min(1).optional(),
```

Before the update runs, validate against the entity's branches — the patch's `locationIds` when supplied, otherwise the ones already mapped:

```ts
    if (patch.invoiceTemplate !== undefined) {
      const branchIds =
        patch.locationIds ??
        (await prisma.billFromLocation.findMany({
          where: { billFromId: id },
          select: { locationId: true },
        })).map((l) => l.locationId);
      await assertTemplateUsable(patch.invoiceTemplate, branchIds);
    }
```

Then add both to the `tx.billFrom.update` data block, matching the `undefined`-means-leave-alone style the handler already uses for `gstin` and `pan`. An explicit `null` clears the template and restores legacy numbering:

```ts
          invoiceTemplate:
            patch.invoiceTemplate === undefined
              ? undefined
              : patch.invoiceTemplate?.toUpperCase() || null,
          invoiceSeqStart: patch.invoiceSeqStart,
```

Note the Zod field must be `.nullable().optional()` (as given in the schema above) rather than `.nullish()`, so that "omitted" and "explicitly cleared" stay distinguishable — the same distinction `gstin` relies on.

- [ ] **Step 5: Verify**

```bash
pnpm --filter @shop/api typecheck
pnpm --filter @shop/api test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/catalogue.ts
git commit -m "Configure an entity's invoice series over the API"
```

---

### Task 7: The mock backend

**Files:**
- Modify: `packages/data/src/mock/repositories.ts` (invoice creation at line 2376; bill-from create/update)
- Test: `packages/data/src/mock/repositories.test.ts`

**Interfaces:**
- Consumes: `financialYearOf`, `renderInvoiceNumber`, `DEFAULT_INVOICE_TEMPLATE` from `@shop/core`.
- Produces: the mock numbers invoices from a per-`(billFromId, fy)` counter, matching the API.

The web app runs against this backend in development and it carries 89 tests, so it must behave identically or the UI will show numbering the server would not produce.

- [ ] **Step 1: Write the failing test**

Add to `packages/data/src/mock/repositories.test.ts`, following the existing `billedTo` helper pattern used by the inter-state tests around line 850:

```ts
describe('invoice series', () => {
  // The seeded company has two stores, ST-JYN and ST-IND. Both are used below
  // to prove the counter belongs to the entity rather than the till.
  const seriesSetup = async (numbering: {
    invoiceTemplate?: string;
    invoiceSeqStart?: number;
  }) => {
    const base = await setup();
    const stores = await base.repos.org.stores();
    const entity = await base.repos.masters.createBillFrom({
      legalName: 'S.M Automobiles Pvt Ltd',
      gstin: '29AAACC1206D1ZC',
      locationIds: stores.map((s) => s.id),
      ...numbering,
    });
    return { ...base, entity, stores };
  };

  const billAt = async (
    base: Awaited<ReturnType<typeof seriesSetup>>,
    storeId: string,
  ) =>
    base.repos.invoices.create({
      storeId,
      counterId: base.counterId,
      lines: [{ skuId: base.sku.id, qty: 1 }],
      billFromId: base.entity.id,
      createdBy: base.actor,
    });

  // Derived rather than hard-coded, so these do not start failing on 1 April.
  const fy = financialYearOf(new Date().toISOString().slice(0, 10)).slice(2);

  it('starts at the configured number and runs on', async () => {
    const base = await seriesSetup({
      invoiceTemplate: 'SMA/{FY}/{SEQ:5}',
      invoiceSeqStart: 501,
    });
    const first = await billAt(base, base.stores[0]!.id);
    const second = await billAt(base, base.stores[0]!.id);
    expect(first.number).toBe(`SMA/${fy}/00501`);
    expect(second.number).toBe(`SMA/${fy}/00502`);
  });

  it('keeps one run across two branches under one entity', async () => {
    const base = await seriesSetup({
      invoiceTemplate: 'SMA/{FY}/{SEQ:5}',
      invoiceSeqStart: 1,
    });
    const first = await billAt(base, base.stores[0]!.id);
    const second = await billAt(base, base.stores[1]!.id);
    expect([first.number, second.number]).toEqual([`SMA/${fy}/00001`, `SMA/${fy}/00002`]);
  });

  it('numbers as it always did when no template is set', async () => {
    const base = await seriesSetup({});
    const invoice = await billAt(base, base.stores[0]!.id);
    expect(invoice.number).toMatch(/^INV-[A-Z0-9-]+-\d{6}$/);
  });

  it('keeps the counter when the template is changed mid-year', async () => {
    // The counter is a stored number, not something parsed back out of the
    // last number issued — so a new shape continues the same run.
    const base = await seriesSetup({
      invoiceTemplate: 'SMA/{FY}/{SEQ:5}',
      invoiceSeqStart: 1,
    });
    await billAt(base, base.stores[0]!.id);
    await base.repos.masters.updateBillFrom(base.entity.id, {
      invoiceTemplate: 'NEW/{FY}/{SEQ:5}',
    });
    const third = await billAt(base, base.stores[0]!.id);
    expect(third.number).toBe(`NEW/${fy}/00002`);
  });

  it('does not disturb a running series when the start is changed', async () => {
    // Lowering the start must never reissue a number already on a customer's
    // bill. The start seeds a year; it does not steer one already running.
    const base = await seriesSetup({
      invoiceTemplate: 'SMA/{FY}/{SEQ:5}',
      invoiceSeqStart: 100,
    });
    await billAt(base, base.stores[0]!.id);
    await base.repos.masters.updateBillFrom(base.entity.id, { invoiceSeqStart: 1 });
    const second = await billAt(base, base.stores[0]!.id);
    expect(second.number).toBe(`SMA/${fy}/00101`);
  });
});
```

Import `financialYearOf` from `@shop/core` at the top of the test file.

**Check `updateBillFrom`'s real signature before writing the last two tests** — read the mock's masters repository. If it takes a single object rather than `(id, patch)`, adjust the two calls; the assertions stand either way.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shop/data exec vitest run src/mock/repositories.test.ts -t "invoice series"`
Expected: FAIL — numbers come back as `INV-<code>-000001` rather than `SMA/26-27/00501`.

- [ ] **Step 3: Add a counter method to the mock store**

`counters` in `packages/data/src/mock/store.ts:92` is **private**, so the allocation belongs on the store beside `nextNumber` rather than reaching into the map from outside. Add after `nextNumber` (line 106):

```ts
  /**
   * The next number in one entity's series for one financial year.
   *
   * Seeded from the entity's configured start the first time a year is used,
   * which is how the 1 April reset happens without a special case.
   */
  nextSeriesSeq(billFromId: string, fy: string, start: number): number {
    const key = `series:${billFromId}:${fy}`;
    const seq = this.counters.get(key) ?? start;
    this.counters.set(key, seq + 1);
    return seq;
  }
```

- [ ] **Step 4: Use it when creating an invoice**

In `packages/data/src/mock/repositories.ts`, replace the invoice `number` line (line 2376):

```ts
      number: this.store.nextNumber('INV', this.locationCode(args.storeId)),
```

with:

```ts
      number: this.nextInvoiceNumber(args.storeId, args.billFrom?.id),
```

and add this private method to the same class:

```ts
  /**
   * Mirrors the API: one counter per entity per financial year, rendered
   * through the entity's template. An entity without one keeps the legacy
   * branch-scoped numbering.
   */
  private nextInvoiceNumber(storeId: string, billFromId?: string): string {
    const branch = this.locationCode(storeId);
    // billFromEntities is an array on the mock store, not a keyed map.
    const entity = billFromId
      ? this.store.billFromEntities.find((e) => e.id === billFromId)
      : undefined;
    if (!entity) return this.store.nextNumber('INV', branch);

    const fy = financialYearOf(this.store.businessDate());
    const seq = this.store.nextSeriesSeq(entity.id, fy, entity.invoiceSeqStart ?? 1);

    return renderInvoiceNumber(entity.invoiceTemplate || DEFAULT_INVOICE_TEMPLATE, {
      fy,
      branch,
      seq,
    });
  }
```

Add `DEFAULT_INVOICE_TEMPLATE`, `financialYearOf` and `renderInvoiceNumber` to this file's existing `@shop/core` import.

- [ ] **Step 5: Carry the fields through bill-from create and update**

Find the mock's bill-from create and update methods and pass `invoiceTemplate` and `invoiceSeqStart` through, defaulting the start to `1` on create. Without this the admin screen cannot set them in development and Task 8 cannot be tested against the mock.

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @shop/data exec vitest run src/mock/repositories.test.ts -t "invoice series"
pnpm --filter @shop/data test
```

Expected: the three new tests PASS and all 89 existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/mock/repositories.ts packages/data/src/mock/repositories.test.ts
git commit -m "Number invoices from the series in the mock backend too"
```

---

### Task 8: The admin screen

**Files:**
- Modify: `apps/web/src/pages/onboarding/bill-from-card.tsx` — the `Draft` interface (line 16), `EMPTY_DRAFT` (line 26), `EntityFields` (line 44)

**Interfaces:**
- Consumes: `invoiceTemplateProblem`, `renderInvoiceNumber`, `DEFAULT_INVOICE_TEMPLATE`, `financialYearOf` from `@shop/core`; the entity's `locationIds` for branch codes.
- Produces: no new exports.

- [ ] **Step 1: Extend the draft**

Add to `Draft`:

```ts
  invoiceTemplate: string;
  invoiceSeqStart: string;
```

Both are strings because they are form inputs; `invoiceSeqStart` is parsed on save. Add to `EMPTY_DRAFT`:

```ts
  invoiceTemplate: '',
  invoiceSeqStart: '1',
```

- [ ] **Step 2: Add the section to `EntityFields`**

Inside the returned grid, after the phone-numbers block, add a full-width section:

```tsx
      <div className="sm:col-span-3 border-t border-border pt-3">
        <Label htmlFor={`${idPrefix}-invoiceTemplate`}>Invoice numbering</Label>
        <p className="mb-2 text-xs text-muted-foreground">
          Tokens: {'{FY}'} → 26-27, {'{FYYY}'} → 2026-27, {'{BRANCH}'}, {'{SEQ:5}'} →
          00501. Leave blank to keep the standard numbering.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            id={`${idPrefix}-invoiceTemplate`}
            placeholder="SMA/{FY}/{SEQ:5}"
            value={draft.invoiceTemplate}
            onChange={(e) => onChange({ invoiceTemplate: e.target.value })}
          />
          <div>
            <Label htmlFor={`${idPrefix}-invoiceSeqStart`}>Start numbering at</Label>
            <Input
              id={`${idPrefix}-invoiceSeqStart`}
              inputMode="numeric"
              value={draft.invoiceSeqStart}
              onChange={(e) => onChange({ invoiceSeqStart: e.target.value })}
            />
          </div>
        </div>
        {preview}
      </div>
```

- [ ] **Step 3: Compute the preview**

Above the `return` in `EntityFields`:

`EntityFields` takes no queries of its own today, and should not start. Add `branchCodes: string[]` to its props alongside `draft` and `onChange`, and have `BillFromCard` pass the codes of the stores currently ticked, derived from the `useLocations('store')` query it already holds:

```tsx
const branchCodes = storeList
  .filter((s) => locationIds.includes(s.id))
  .map((s) => s.code);
```

Then, above the `return` in `EntityFields`:

```tsx
  const problem = draft.invoiceTemplate
    ? invoiceTemplateProblem(draft.invoiceTemplate, branchCodes)
    : undefined;
  const seqStart = Number(draft.invoiceSeqStart) || 1;
  const preview = problem ? (
    <p className="mt-2 text-xs text-destructive">{problem}</p>
  ) : (
    // The preview is the point of this screen: a template is an abstraction an
    // admin should never have to evaluate in their head, and a wrong shape is
    // only discovered on a customer's bill, where it cannot be undone.
    <p className="mt-2 text-xs text-muted-foreground">
      Next number:{' '}
      <span className="font-mono text-foreground">
        {renderInvoiceNumber(draft.invoiceTemplate || DEFAULT_INVOICE_TEMPLATE, {
          fy: financialYearOf(new Date().toISOString().slice(0, 10)),
          branch: branchCodes[0] ?? 'STORE',
          seq: seqStart,
        })}
      </span>
    </p>
  );
```

**Important:** the preview shows `invoiceSeqStart` only as the *starting* number. Once an entity has billed, the live counter is ahead of it. Label it "Next number" only when the entity has no invoices yet; otherwise label it "Numbers will look like" so nobody reads it as the true next value. The entity's current counter is not exposed by the API in this plan — if you want the true next number shown, that is a follow-up.

- [ ] **Step 4: Send the fields on save**

In `add`, include:

```ts
        invoiceTemplate: draft.invoiceTemplate.trim().toUpperCase() || undefined,
        invoiceSeqStart: Number(draft.invoiceSeqStart) || 1,
```

In `saveEdit`, include (an emptied box clears it, matching how this form treats `gstin`):

```ts
          invoiceTemplate: editing.invoiceTemplate.trim().toUpperCase() || null,
          invoiceSeqStart: Number(editing.invoiceSeqStart) || 1,
```

Populate both when an entity is loaded for editing.

- [ ] **Step 5: Block saving an invalid template**

In `add` and `saveEdit`, return early when `problem` is set, so the form cannot submit a template the API would reject. Lift the `invoiceTemplateProblem` call to `BillFromCard` where both handlers can see it.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @shop/web typecheck
pnpm --filter @shop/web build
```

Expected: both PASS.

Then run the app and check by hand: set `SMA/{FY}/{SEQ:5}` with a start of 501, confirm the preview reads `SMA/26-27/00501`; type `SMA_{SEQ:5}` and confirm the error names the character rule; type `SMAUTOMOBILES/{FYYY}/{SEQ:6}` and confirm it names the 16-character limit.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/onboarding/bill-from-card.tsx
git commit -m "Configure invoice numbering on the bill-from screen"
```

---

### Task 9: End-to-end check

**Files:** none modified.

- [ ] **Step 1: Full suite**

```bash
pnpm test
pnpm typecheck
```

Expected: `@shop/core`, `@shop/data` and `@shop/api` all green; 7 packages typecheck.

- [ ] **Step 2: Confirm the financial-year reset by hand**

With the dev server running and an entity configured `SMA/{FY}/{SEQ:5}` starting at 1:

1. Raise an invoice — expect `SMA/26-27/00001`.
2. Raise another — expect `SMA/26-27/00002`.
3. Move the business date past 31 March (mock clock, or a row edit against the dev database).
4. Raise a third — expect `SMA/27-28/00001`, and confirm the FY 2026-27 counter row still reads 3.

- [ ] **Step 3: Confirm the legacy path is untouched**

Raise an invoice under an entity with no template. Expect `INV-<branch>-<6 digits>`, continuing that branch's existing run.

- [ ] **Step 4: Prove the counter is atomic against a real database**

This is the one property the unit tests cannot reach. Against the dev database, with an entity configured `SMA/{FY}/{SEQ:5}`, fire twenty checkouts at once and confirm twenty distinct numbers come back with no gaps:

```bash
seq 1 20 | xargs -P 20 -I{} curl -s -X POST "$API/sales/checkout" \
  -H 'content-type: application/json' -b "$COOKIE" \
  -d "$CHECKOUT_BODY" | grep -o '"number":"[^"]*"' | sort | uniq -c | sort -rn | head
```

Expected: twenty lines, each with a count of 1. A count above 1 means the allocation is not atomic — stop and re-read the `ON CONFLICT` statement rather than adding a retry on top.

Set `API`, `COOKIE` and `CHECKOUT_BODY` from a working single checkout captured from the browser's network tab first; a body that 400s will produce twenty identical errors and look like success to the pipeline above, so confirm one call returns a number before fanning out.

- [ ] **Step 5: Commit any fixes, then stop**

Report what passed and what did not. Do not promote to production — deployment is a separate decision.

---

## Notes for the implementer

**The UTC business date.** `businessDateOf` at `apps/api/src/routes/sales.ts:68` computes the day with `toISOString()`, so the shop's day turns over at 05:30 IST and a sale rung up at 01:00 IST on 1 April is recorded against the previous financial year. This plan deliberately inherits that rather than fixing it — `businessDate` drives day-end closings and every sales report. Do not "fix" it inside this work. It is written up in the spec's *Where the financial year comes from* section.

**Do not renumber anything.** No task touches an existing `Invoice.number`. If a step seems to require it, stop and raise it.

**Two series in one year is expected.** Configuring a template on an entity that has already billed this financial year leaves the old run in place and starts a new one. That is the migration case the feature exists for, not a bug.
