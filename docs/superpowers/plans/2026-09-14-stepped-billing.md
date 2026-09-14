# Stepped Billing with Configurable Customer Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split web billing into cart → customer → payment, with the customer fields defined per company in Masters.

**Architecture:** A new `BillFieldConfig` master describes which details the till asks for and whether each answer belongs to the customer or to the sale. A pure function in `@shop/core` splits entered values by scope; the API applies that split when writing an invoice, storing sale-scope answers in a new `Invoice.customerDetails` JSON column. The billing page becomes a three-step wizard driven by the same configuration.

**Tech Stack:** Prisma 6 / PostgreSQL, Fastify 5, Zod 3, React 19, TanStack Query 5, Zustand 5, Vitest 2, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-14-stepped-billing-design.md`

## Global Constraints

- Every API route is company-scoped through `requireCompany(await principal(request), body.companyId)`; master writes additionally require `requirePermission(caller, 'admin.manage')`.
- Business rules live in `packages/core/src/logic/*.ts` as pure functions with a sibling `*.test.ts`. Arithmetic and branching rules are never written inline in a route or a component.
- Both the HTTP repository (`packages/data/src/http/`) and the mock (`packages/data/src/mock/`) implement every repository interface. A change to `packages/data/src/repositories.ts` is incomplete until both compile.
- `pnpm run typecheck` and `pnpm run test` must both pass before any commit. Vitest does not typecheck, so passing tests alone is not sufficient evidence.
- Prisma changes are applied with `pnpm --filter @shop/api exec prisma generate` then `... prisma db push`. Confirm the generated DDL with `prisma migrate diff` before pushing; this project has no migration files.
- A company with no `BillFieldConfig` rows must bill exactly as it does today.

---

### Task 1: Field-splitting logic in `@shop/core`

**Files:**
- Create: `packages/core/src/logic/bill-fields.ts`
- Create: `packages/core/src/logic/bill-fields.test.ts`
- Modify: `packages/core/src/logic/index.ts` (add `export * from './bill-fields.ts';`)
- Create: `packages/core/src/entities/bill-field.ts`
- Modify: `packages/core/src/entities/index.ts` (add `export * from './bill-field.ts';`)

**Interfaces:**
- Consumes: `idSchema` from `packages/core/src/entities/common.ts`.
- Produces:
  - `billFieldScopeSchema`, `billFieldTypeSchema`, `billFieldConfigSchema`, types `BillFieldScope`, `BillFieldType`, `BillFieldConfig`
  - `BUILTIN_FIELDS: readonly BuiltinField[]` where `BuiltinField = { builtin: string; key: string; label: string; scope: BillFieldScope; type: BillFieldType }`
  - `splitBillFields(fields: readonly BillFieldConfig[], values: Readonly<Record<string, string>>): { customer: Record<string, string>; sale: Record<string, string> }`
  - `missingRequiredFields(fields: readonly BillFieldConfig[], values: Readonly<Record<string, string>>): BillFieldConfig[]`

- [ ] **Step 1: Write the entity file**

Create `packages/core/src/entities/bill-field.ts`:

```ts
import { z } from 'zod';
import { idSchema } from './common.ts';

/**
 * Where a captured value belongs.
 *
 * `customer` outlives the sale: a phone number identifies the person and
 * should find them again next visit. `sale` describes one bill: the same
 * customer brings a different vehicle next month, and a bill from March has to
 * keep saying which vehicle it was for.
 */
export const billFieldScopeSchema = z.enum(['customer', 'sale']);
export type BillFieldScope = z.infer<typeof billFieldScopeSchema>;

export const billFieldTypeSchema = z.enum(['text', 'number', 'phone']);
export type BillFieldType = z.infer<typeof billFieldTypeSchema>;

export const billFieldConfigSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  /**
   * The `Customer` column this field drives, named exactly — so the mapping
   * needs no lookup table. Null for a field the company invented.
   */
  builtin: z.enum(['name', 'phone', 'email', 'gstin', 'addressLine']).nullable(),
  /** Stable. Invoices store answers against it, so it is never re-keyed. */
  key: z.string().min(1),
  label: z.string().min(1),
  scope: billFieldScopeSchema,
  type: billFieldTypeSchema.default('text'),
  required: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type BillFieldConfig = z.infer<typeof billFieldConfigSchema>;

export interface BuiltinField {
  builtin: NonNullable<BillFieldConfig['builtin']>;
  key: string;
  label: string;
  scope: BillFieldScope;
  type: BillFieldType;
}

/**
 * The fields that already exist as indexed columns on `Customer`. They are
 * offered as a checklist rather than reinvented, because `phone` is uniquely
 * indexed per company and is how a counter finds a returning customer.
 */
export const BUILTIN_FIELDS: readonly BuiltinField[] = [
  { builtin: 'name', key: 'name', label: 'Name', scope: 'customer', type: 'text' },
  { builtin: 'phone', key: 'phone', label: 'Phone', scope: 'customer', type: 'phone' },
  { builtin: 'email', key: 'email', label: 'Email', scope: 'customer', type: 'text' },
  { builtin: 'gstin', key: 'gstin', label: 'GSTIN', scope: 'customer', type: 'text' },
  { builtin: 'addressLine', key: 'addressLine', label: 'Address', scope: 'customer', type: 'text' },
] as const;
```

- [ ] **Step 2: Write the failing test**

Create `packages/core/src/logic/bill-fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BillFieldConfig } from '../entities/bill-field.ts';
import { missingRequiredFields, splitBillFields } from './bill-fields.ts';

const field = (over: Partial<BillFieldConfig>): BillFieldConfig => ({
  id: 'f1',
  companyId: 'c1',
  builtin: null,
  key: 'vehicle_number',
  label: 'Vehicle number',
  scope: 'sale',
  type: 'text',
  required: false,
  sortOrder: 0,
  active: true,
  ...over,
});

describe('splitBillFields', () => {
  it('sends each value to the side its field declares', () => {
    const fields = [
      field({ id: 'f1', builtin: 'phone', key: 'phone', label: 'Phone', scope: 'customer' }),
      field({ id: 'f2', key: 'vehicle_number', scope: 'sale' }),
    ];
    expect(splitBillFields(fields, { phone: '9845011111', vehicle_number: 'KA01AB1234' })).toEqual({
      customer: { phone: '9845011111' },
      sale: { vehicle_number: 'KA01AB1234' },
    });
  });

  it('ignores a value whose field is inactive', () => {
    // Deactivating a field must stop it being captured, without disturbing the
    // bills that already carry it.
    const fields = [field({ active: false })];
    expect(splitBillFields(fields, { vehicle_number: 'KA01AB1234' })).toEqual({
      customer: {},
      sale: {},
    });
  });

  it('drops a value with no field behind it', () => {
    // A stale form, or a key removed between load and submit.
    expect(splitBillFields([], { vehicle_number: 'KA01AB1234' })).toEqual({
      customer: {},
      sale: {},
    });
  });

  it('drops blanks rather than storing empty strings', () => {
    const fields = [field({})];
    expect(splitBillFields(fields, { vehicle_number: '   ' })).toEqual({ customer: {}, sale: {} });
  });

  it('trims what it keeps', () => {
    const fields = [field({})];
    expect(splitBillFields(fields, { vehicle_number: ' KA01AB1234 ' }).sale).toEqual({
      vehicle_number: 'KA01AB1234',
    });
  });
});

describe('missingRequiredFields', () => {
  it('names the required fields left empty', () => {
    const fields = [
      field({ id: 'f1', key: 'phone', builtin: 'phone', label: 'Phone', scope: 'customer', required: true }),
      field({ id: 'f2', key: 'vehicle_number', required: true }),
    ];
    expect(missingRequiredFields(fields, { phone: '9845011111' }).map((f) => f.key)).toEqual([
      'vehicle_number',
    ]);
  });

  it('treats whitespace as empty', () => {
    const fields = [field({ required: true })];
    expect(missingRequiredFields(fields, { vehicle_number: '  ' })).toHaveLength(1);
  });

  it('never blocks on an inactive field', () => {
    // Otherwise deactivating a required field would make billing impossible
    // rather than simply stop asking for it.
    const fields = [field({ required: true, active: false })];
    expect(missingRequiredFields(fields, {})).toHaveLength(0);
  });

  it('is satisfied by a company with no configuration', () => {
    expect(missingRequiredFields([], {})).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `pnpm --filter @shop/core exec vitest run src/logic/bill-fields.test.ts`
Expected: FAIL — `Failed to load .../bill-fields.ts`

- [ ] **Step 4: Write the implementation**

Create `packages/core/src/logic/bill-fields.ts`:

```ts
import type { BillFieldConfig } from '../entities/bill-field.ts';

const filled = (value: string | undefined): string => (value ?? '').trim();

/**
 * Routes entered values to the record each one belongs on.
 *
 * The split is the whole point of the feature: a phone number identifies a
 * person and must survive the sale, while a vehicle registration describes one
 * bill and must not be overwritten by the next. Keeping the decision here, as
 * a pure function, is what lets both the API and the till agree about it
 * without either owning the rule.
 *
 * Values without an active field behind them are dropped rather than passed
 * through, so a stale form cannot write keys nobody configured.
 */
export function splitBillFields(
  fields: readonly BillFieldConfig[],
  values: Readonly<Record<string, string>>,
): { customer: Record<string, string>; sale: Record<string, string> } {
  const customer: Record<string, string> = {};
  const sale: Record<string, string> = {};

  for (const field of fields) {
    if (!field.active) continue;
    const value = filled(values[field.key]);
    if (!value) continue;
    (field.scope === 'customer' ? customer : sale)[field.key] = value;
  }

  return { customer, sale };
}

/** Required fields with nothing in them. Inactive fields can never block. */
export function missingRequiredFields(
  fields: readonly BillFieldConfig[],
  values: Readonly<Record<string, string>>,
): BillFieldConfig[] {
  return fields.filter((field) => field.active && field.required && !filled(values[field.key]));
}
```

- [ ] **Step 5: Wire up the barrel exports**

In `packages/core/src/entities/index.ts`, add alongside the existing exports:

```ts
export * from './bill-field.ts';
```

In `packages/core/src/logic/index.ts`, add:

```ts
export * from './bill-fields.ts';
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm --filter @shop/core exec vitest run src/logic/bill-fields.test.ts`
Expected: PASS, 9 tests.

Run: `pnpm run typecheck`
Expected: 7 successful, 7 total.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/entities/bill-field.ts packages/core/src/entities/index.ts \
        packages/core/src/logic/bill-fields.ts packages/core/src/logic/bill-fields.test.ts \
        packages/core/src/logic/index.ts
git commit -m "Add the rule that decides where a captured bill field belongs"
```

---

### Task 2: Schema and API for the field configuration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add `BillFieldConfig`, add `billFields BillFieldConfig[]` to `Company`, add `customerDetails Json?` to `Invoice`)
- Modify: `apps/api/src/routes/catalogue.ts` (projection + four routes)

**Interfaces:**
- Consumes: `BUILTIN_FIELDS` is *not* imported by the API — the API stores whatever `builtin` string it is given, validated by the Zod enum in Task 1.
- Produces: `GET /bill-fields`, `POST /bill-fields`, `PATCH /bill-fields/:id`, each returning the JSON shape `{ id, companyId, builtin, key, label, scope, type, required, sortOrder, active }`.

- [ ] **Step 1: Add the model to the Prisma schema**

In `apps/api/prisma/schema.prisma`, add after the `ReasonCode` model:

```prisma
/// Which customer details this company asks for at the till, and where each
/// answer belongs. Absent rows mean the pre-configuration behaviour: an
/// optional customer name and nothing else.
model BillFieldConfig {
  id        String  @id @default(cuid())
  companyId String

  /// The `Customer` column this field drives, named exactly. Null for a field
  /// the company invented.
  builtin   String?
  /// Stable. Invoices store answers against it, so it is never re-keyed.
  key       String
  label     String
  /// 'customer' outlives the sale; 'sale' describes one bill.
  scope     String
  type      String  @default("text")
  required  Boolean @default(false)
  sortOrder Int     @default(0)
  active    Boolean @default(true)

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, key])
  @@index([companyId, active])
  @@map("bill_field_configs")
}
```

In the `Company` model, add to the relation list beside `categories`:

```prisma
  billFields        BillFieldConfig[]
```

In the `Invoice` model, add after `customerName String?`:

```prisma
  /// Sale-scope answers, keyed by BillFieldConfig.key. Snapshotted so that
  /// renaming or deactivating a field later cannot change a bill already
  /// issued.
  customerDetails Json?
```

- [ ] **Step 2: Generate the client and confirm the DDL**

Run:

```bash
pnpm --filter @shop/api exec prisma generate
pnpm --filter @shop/api exec prisma migrate diff \
  --from-schema-datasource apps/api/prisma/schema.prisma \
  --to-schema-datamodel apps/api/prisma/schema.prisma --script
```

Expected: a `CREATE TABLE "bill_field_configs"`, its two indexes, and `ALTER TABLE "invoices" ADD COLUMN "customerDetails" JSONB`. Additive only — if the output contains a `DROP`, stop and re-read the schema edit.

- [ ] **Step 3: Push the schema**

Run: `pnpm --filter @shop/api exec prisma db push --skip-generate`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Add the projection**

In `apps/api/src/routes/catalogue.ts`, beside the other `public*` functions:

```ts
const publicBillField = (row: BillFieldConfig) => ({
  id: row.id,
  companyId: row.companyId,
  builtin: row.builtin,
  key: row.key,
  label: row.label,
  scope: row.scope,
  type: row.type,
  required: row.required,
  sortOrder: row.sortOrder,
  active: row.active,
});
```

Add `BillFieldConfig` to the `import type { ... } from '@prisma/client';` list at the top of the file.

- [ ] **Step 5: Add the routes**

In `apps/api/src/routes/catalogue.ts`, inside `registerCatalogueRoutes`, after the reason-code routes:

```ts
  /* ------------------------------------------------------------ bill fields */

  app.get('/bill-fields', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.billFieldConfig.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(publicBillField);
  });

  app.post('/bill-fields', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        builtin: z.enum(['name', 'phone', 'email', 'gstin', 'addressLine']).nullish(),
        key: z.string().min(1),
        label: z.string().min(1),
        scope: z.enum(['customer', 'sale']),
        type: z.enum(['text', 'number', 'phone']).default('text'),
        required: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const key = body.key.trim();
    await assertFree(
      prisma.billFieldConfig.findFirst({ where: { companyId, key: sameText(key) } }),
      `A bill field with the key ${key} already exists`,
    );

    const created = await prisma.billFieldConfig.create({
      data: {
        companyId,
        builtin: body.builtin ?? null,
        key,
        label: body.label.trim(),
        scope: body.scope,
        type: body.type,
        required: body.required,
        sortOrder: body.sortOrder,
      },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'bill_field',
      entityId: created.id,
      action: 'create',
      summary: `Bill field ${created.label} added`,
    });
    reply.code(201);
    return publicBillField(created);
  });

  app.patch('/bill-fields/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        label: z.string().min(1).optional(),
        scope: z.enum(['customer', 'sale']).optional(),
        type: z.enum(['text', 'number', 'phone']).optional(),
        required: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    // `key` is deliberately absent: invoices already store answers against it,
    // so re-keying a field would orphan every value captured so far.
    const existing = found(
      await prisma.billFieldConfig.findUnique({ where: { id } }),
      'BillFieldConfig',
      id,
    );
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    const updated = await prisma.billFieldConfig.update({
      where: { id },
      data: { ...patch, label: patch.label?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'bill_field',
      entityId: id,
      action: 'update',
      summary: `Bill field ${updated.label} updated`,
    });
    return publicBillField(updated);
  });
```

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: 7 successful, 7 total.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/routes/catalogue.ts
git commit -m "Store which customer details a company asks for at the till"
```

---

### Task 3: Repository layer and mock

**Files:**
- Modify: `packages/data/src/repositories.ts` (`NewInvoice`, `MasterRepository`, new input types)
- Modify: `packages/data/src/http/catalogue.ts` (three methods)
- Modify: `packages/data/src/http/sales.ts` (pass `customerDetails` on invoice create)
- Modify: `packages/data/src/mock/store.ts` (add `billFields: BillFieldConfig[] = [];`)
- Modify: `packages/data/src/mock/repositories.ts` (three methods, and store details on the invoice)
- Modify: `packages/data/src/mock/repositories.test.ts` (new describe block)

**Interfaces:**
- Consumes: `splitBillFields` from `@shop/core` (Task 1); `GET|POST|PATCH /bill-fields` (Task 2).
- Produces:
  - `MasterRepository.billFields(includeInactive?: boolean): Promise<BillFieldConfig[]>`
  - `MasterRepository.createBillField(input: NewBillField): Promise<BillFieldConfig>`
  - `MasterRepository.updateBillField(id: string, patch: BillFieldPatch, actorId: string): Promise<BillFieldConfig>`
  - `NewInvoice.customerDetails?: Record<string, string>`

- [ ] **Step 1: Extend the repository interfaces**

In `packages/data/src/repositories.ts`, add to `NewInvoice` after `customerName?: string;`:

```ts
  /** Sale-scope answers, keyed by BillFieldConfig.key. */
  customerDetails?: Record<string, string>;
```

Add the input types beside the other `New*`/`*Patch` pairs:

```ts
export interface NewBillField {
  builtin?: BillFieldConfig['builtin'];
  key: string;
  label: string;
  scope: BillFieldConfig['scope'];
  type?: BillFieldConfig['type'];
  required?: boolean;
  sortOrder?: number;
}

export interface BillFieldPatch {
  label?: string;
  scope?: BillFieldConfig['scope'];
  type?: BillFieldConfig['type'];
  required?: boolean;
  sortOrder?: number;
  active?: boolean;
}
```

Add to `MasterRepository`, beside `reasonCodes`:

```ts
  billFields(includeInactive?: boolean): Promise<BillFieldConfig[]>;
  createBillField(input: NewBillField): Promise<BillFieldConfig>;
  updateBillField(id: string, patch: BillFieldPatch, actorId: string): Promise<BillFieldConfig>;
```

Add `BillFieldConfig` to the `import type { ... } from '@shop/core';` list at the top of the file.

- [ ] **Step 2: Implement the HTTP repository**

In `packages/data/src/http/catalogue.ts`, inside the `masters` object beside `reasonCodes`:

```ts
    billFields: (includeInactive) =>
      fetcher.get<BillFieldConfig[]>('/bill-fields', { includeInactive }),

    createBillField: (input) => fetcher.post<BillFieldConfig>('/bill-fields', input),

    updateBillField: (id, patch) =>
      fetcher.patch<BillFieldConfig>(`/bill-fields/${id}`, patch),
```

Add `BillFieldConfig` to the `import type { ... } from '@shop/core';` list.

In `packages/data/src/http/sales.ts`, in `invoices.create`, add `customerDetails: input.customerDetails,` to the posted body beside `customerName`.

- [ ] **Step 3: Write the failing mock tests**

In `packages/data/src/mock/repositories.test.ts`, add a new describe block before `describe('sales returns'`:

```ts
describe('bill field configuration', () => {
  it('starts empty, so billing is unchanged until someone configures it', async () => {
    const { repos } = await setup();
    expect(await repos.masters.billFields()).toHaveLength(0);
  });

  it('keeps sale-scope answers on the invoice', async () => {
    const { repos, store, sku, counterId, actor } = await setup();
    await repos.masters.createBillField({
      key: 'vehicle_number',
      label: 'Vehicle number',
      scope: 'sale',
    });

    const invoice = await repos.invoices.create({
      storeId: store.id,
      counterId,
      lines: [{ skuId: sku.id, qty: 1 }],
      customerDetails: { vehicle_number: 'KA01AB1234' },
      createdBy: actor,
    });

    expect(invoice.customerDetails).toEqual({ vehicle_number: 'KA01AB1234' });
    // And it survives a re-read, rather than only existing on the response.
    expect((await repos.invoices.byId(invoice.id))?.customerDetails).toEqual({
      vehicle_number: 'KA01AB1234',
    });
  });

  it('keeps a bill readable after its field is renamed or deactivated', async () => {
    // The invoice stores the answer against the key, so the configuration can
    // change afterwards without rewriting history.
    const { repos, store, sku, counterId, actor } = await setup();
    const field = await repos.masters.createBillField({
      key: 'vehicle_number',
      label: 'Vehicle number',
      scope: 'sale',
    });
    const invoice = await repos.invoices.create({
      storeId: store.id,
      counterId,
      lines: [{ skuId: sku.id, qty: 1 }],
      customerDetails: { vehicle_number: 'KA01AB1234' },
      createdBy: actor,
    });

    await repos.masters.updateBillField(field.id, { label: 'Reg. no.', active: false }, actor);

    expect((await repos.invoices.byId(invoice.id))?.customerDetails).toEqual({
      vehicle_number: 'KA01AB1234',
    });
  });

  it('refuses a duplicate key', async () => {
    const { repos } = await setup();
    await repos.masters.createBillField({ key: 'vehicle_number', label: 'Vehicle', scope: 'sale' });
    await expect(
      repos.masters.createBillField({ key: 'vehicle_number', label: 'Other', scope: 'sale' }),
    ).rejects.toThrow(/already exists/i);
  });
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `pnpm --filter @shop/data exec vitest run src/mock/repositories.test.ts -t "bill field configuration"`
Expected: FAIL — `repos.masters.createBillField is not a function`.

- [ ] **Step 5: Implement the mock**

In `packages/data/src/mock/store.ts`, add to the class body beside the other collections:

```ts
  billFields: BillFieldConfig[] = [];
```

Add `BillFieldConfig` to the file's `import type { ... } from '@shop/core';` list.

In `packages/data/src/mock/repositories.ts`, inside the `masters` object beside `reasonCodes`:

```ts
    billFields: (includeInactive) =>
      tick(
        this.store.billFields
          .filter((f) => includeInactive || f.active)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
      ),

    createBillField: async (input) => {
      const key = input.key.trim();
      if (this.store.billFields.some((f) => f.key.toLowerCase() === key.toLowerCase())) {
        throw new Error(`A bill field with the key ${key} already exists`);
      }
      const field: BillFieldConfig = {
        id: this.store.nextId('bfl'),
        companyId: this.store.company.id,
        builtin: input.builtin ?? null,
        key,
        label: input.label.trim(),
        scope: input.scope,
        type: input.type ?? 'text',
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? this.store.billFields.length * 10,
        active: true,
      };
      this.store.billFields.push(field);
      return tick(field);
    },

    updateBillField: async (id, patch, actorId) => {
      const field = this.store.billFields.find((f) => f.id === id);
      if (!field) throw new NotFoundError('BillFieldConfig', id);
      // `key` is absent from the patch type on purpose: invoices already store
      // answers against it.
      Object.assign(field, patch, patch.label ? { label: patch.label.trim() } : {});
      this.store.bumpAudit({
        entity: 'bill_field',
        entityId: id,
        action: 'update',
        summary: `Bill field ${field.label} updated`,
        actorId,
      });
      return tick(field);
    },
```

In the same file, carry the details onto the stored invoice. `writeInvoice` is a private method whose argument object already carries `customerId` and `customerName`; add to that argument type:

```ts
  customerDetails?: Record<string, string>;
```

and to the invoice literal it builds, beside `customerName`:

```ts
      customerDetails: args.customerDetails,
```

Then in `invoices.create`, pass it down beside `customerName`:

```ts
        customerDetails: input.customerDetails,
```

Add `BillFieldConfig` to the file's `import type { ... } from '@shop/core';` list.

- [ ] **Step 6: Add `customerDetails` to the Invoice entity**

In `packages/core/src/entities/sales.ts`, add to `invoiceSchema` after `customerName`:

```ts
  /** Sale-scope bill-field answers, keyed by BillFieldConfig.key. */
  customerDetails: z.record(z.string()).optional(),
```

In `apps/api/src/routes/sales.ts`, in `invoiceWire`, add `customerDetails: row.customerDetails ?? undefined,`. In the `POST /invoices` Zod body add `customerDetails: z.record(z.string()).optional(),`, and pass it into `writeInvoice`'s `tx.invoice.create` data as `customerDetails: body.customerDetails ?? undefined`.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `pnpm --filter @shop/data exec vitest run src/mock/repositories.test.ts -t "bill field configuration"`
Expected: PASS, 4 tests.

Run: `pnpm run typecheck && pnpm run test`
Expected: 7 packages typecheck; all vitest suites pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/entities/sales.ts packages/data/src packages/state apps/api/src/routes/sales.ts
git commit -m "Carry bill-field answers from the till to the invoice"
```

---

### Task 4: State hooks

**Files:**
- Modify: `packages/state/src/hooks/use-masters.ts` (query + two mutations)
- Modify: `packages/state/src/hooks/use-billing.ts` (`CheckoutInput.customerDetails`)

**Interfaces:**
- Consumes: `MasterRepository.billFields` / `createBillField` / `updateBillField` (Task 3).
- Produces: `useBillFields(includeInactive?: boolean)`, `useCreateBillField()`, `useUpdateBillField()`, and `CheckoutInput.customerDetails?: Record<string, string>`.

- [ ] **Step 1: Add the hooks**

In `packages/state/src/hooks/use-masters.ts`:

```ts
/**
 * The customer details this company asks for at the till.
 *
 * Reference data in the sense that it changes rarely, but it decides what a
 * cashier is forced to type, so a correction has to reach the counter promptly
 * rather than at the end of a thirty-minute window.
 */
export function useBillFields(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['masters', 'bill-fields', includeInactive],
    queryFn: () => repos.masters.billFields(includeInactive),
    staleTime: STALE.ORG,
  });
}

export function useCreateBillField() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBillField) => repos.masters.createBillField(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['masters', 'bill-fields'] });
    },
  });
}

export function useUpdateBillField() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: { id: string; patch: BillFieldPatch; actorId: string }) =>
      repos.masters.updateBillField(id, patch, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['masters', 'bill-fields'] });
    },
  });
}
```

Add `NewBillField` and `BillFieldPatch` to the file's `import type { ... } from '@shop/data';` list, and `useMutation`/`useQueryClient` to its `@tanstack/react-query` import if not already present.

- [ ] **Step 2: Thread the details through checkout**

In `packages/state/src/hooks/use-billing.ts`, add to `CheckoutInput` after `customerName?: string;`:

```ts
  /** Sale-scope bill-field answers, keyed by BillFieldConfig.key. */
  customerDetails?: Record<string, string>;
```

In the same file's `useCheckout` `mutationFn`, add `customerDetails: input.customerDetails,` to the `repos.invoices.create({ ... })` call.

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: 7 successful, 7 total.

- [ ] **Step 4: Commit**

```bash
git add packages/state/src/hooks/use-masters.ts packages/state/src/hooks/use-billing.ts
git commit -m "Expose the bill-field configuration to the apps"
```

---

### Task 5: Masters UI for bill fields

**Files:**
- Create: `apps/web/src/pages/onboarding/bill-fields-card.tsx`
- Modify: `apps/web/src/pages/onboarding/masters.tsx` (add the tab)

**Interfaces:**
- Consumes: `useBillFields`, `useCreateBillField`, `useUpdateBillField` (Task 4); `BUILTIN_FIELDS` (Task 1).
- Produces: `BillFieldsCard` — a default export is not used in this codebase; export it by name.

- [ ] **Step 1: Create the card**

Create `apps/web/src/pages/onboarding/bill-fields-card.tsx`:

```tsx
import { BUILTIN_FIELDS, type BillFieldConfig } from '@shop/core';
import { useBillFields, useCreateBillField, useSessionStore, useUpdateBillField } from '@shop/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { RecordForm } from './record-form';

/**
 * What the till asks a customer for.
 *
 * Built-ins are offered as one-click additions because they drive real columns
 * on `Customer` — `phone` in particular is the indexed lookup that finds a
 * returning customer, and inventing a second field called "Phone" would quietly
 * lose that.
 */
export function BillFieldsCard() {
  const user = useSessionStore((s) => s.user);
  const fields = useBillFields(true);
  const create = useCreateBillField();
  const update = useUpdateBillField();

  const configured = fields.data ?? [];
  const unusedBuiltins = BUILTIN_FIELDS.filter(
    (b) => !configured.some((f) => f.builtin === b.builtin),
  );

  const toggle = (field: BillFieldConfig, patch: { required?: boolean; active?: boolean }) => {
    if (!user) return;
    update.mutate({ id: field.id, patch, actorId: user.id });
  };

  return (
    <Card>
      <CardHeader
        title="Bill fields"
        description="What the counter asks a customer for. Nothing here means billing asks only for an optional name."
      />

      {unusedBuiltins.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <span className="text-xs text-muted-foreground">Add a standard field:</span>
          {unusedBuiltins.map((b) => (
            <Button
              key={b.builtin}
              size="sm"
              variant="outline"
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  builtin: b.builtin,
                  key: b.key,
                  label: b.label,
                  scope: b.scope,
                  type: b.type,
                  sortOrder: configured.length * 10,
                })
              }
            >
              + {b.label}
            </Button>
          ))}
        </div>
      ) : null}

      <RecordForm
        fields={[
          { name: 'label', label: 'Label', required: true, placeholder: 'Vehicle number' },
          { name: 'key', label: 'Key', required: true, placeholder: 'vehicle_number' },
          {
            name: 'scope',
            label: 'Belongs to',
            type: 'select',
            options: [
              { value: 'sale', label: 'This sale' },
              { value: 'customer', label: 'The customer' },
            ],
          },
          {
            name: 'type',
            label: 'Type',
            type: 'select',
            options: [
              { value: 'text', label: 'Text' },
              { value: 'number', label: 'Number' },
              { value: 'phone', label: 'Phone' },
            ],
          },
        ]}
        submitLabel="Add field"
        pending={create.isPending}
        onSubmit={async (values) => {
          await create.mutateAsync({
            key: values.key,
            label: values.label,
            scope: (values.scope as BillFieldConfig['scope']) || 'sale',
            type: (values.type as BillFieldConfig['type']) || 'text',
            sortOrder: configured.length * 10,
          });
        }}
      />

      <Table>
        <thead>
          <tr>
            <Th>Label</Th>
            <Th>Key</Th>
            <Th>Belongs to</Th>
            <Th>Required</Th>
            <Th className="text-right">Status</Th>
          </tr>
        </thead>
        <tbody>
          {configured.length === 0 ? (
            <EmptyRow colSpan={5}>No fields configured — the counter asks only for a name.</EmptyRow>
          ) : (
            configured.map((field) => (
              <tr key={field.id}>
                <Td className="font-medium">{field.label}</Td>
                <Td className="text-xs text-muted-foreground">{field.key}</Td>
                <Td>
                  <Badge tone={field.scope === 'customer' ? 'info' : 'neutral'}>
                    {field.scope === 'customer' ? 'customer' : 'this sale'}
                  </Badge>
                </Td>
                <Td>
                  <Button
                    size="sm"
                    variant={field.required ? 'default' : 'outline'}
                    onClick={() => toggle(field, { required: !field.required })}
                  >
                    {field.required ? 'Required' : 'Optional'}
                  </Button>
                </Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle(field, { active: !field.active })}
                  >
                    {field.active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}
```

- [ ] **Step 2: Add the tab**

In `apps/web/src/pages/onboarding/masters.tsx`:

Change the `TABS` constant to include the new tab:

```ts
const TABS = ['Categories', 'Units', 'Taxes', 'Payment methods', 'Reason codes', 'Bill fields', 'Customers', 'Suppliers'] as const;
```

Add the render line beside the others:

```tsx
      {tab === 'Bill fields' ? <BillFieldsCard /> : null}
```

Add the import:

```ts
import { BillFieldsCard } from './bill-fields-card';
```

- [ ] **Step 3: Typecheck and check it renders**

Run: `pnpm run typecheck`
Expected: 7 successful, 7 total.

Run `pnpm --filter @shop/web dev --port 4599`, sign in as `owner@nandiretail.in` (the mock accepts any password), open **Onboarding → Masters → Bill fields**, add the `Phone` built-in and a custom `vehicle_number`, and confirm both appear in the table with the right scope badge.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/onboarding/bill-fields-card.tsx apps/web/src/pages/onboarding/masters.tsx
git commit -m "Let an admin choose what the counter asks a customer for"
```

---

### Task 6: The three-step billing flow

**Files:**
- Modify: `apps/web/src/pages/sales/quick-billing.tsx`
- Create: `apps/web/src/pages/sales/customer-step.tsx`

**Interfaces:**
- Consumes: `useBillFields` (Task 4); `missingRequiredFields`, `splitBillFields`, `BillFieldConfig` (Task 1); `CheckoutInput.customerDetails` (Task 4).
- Produces: nothing consumed by a later task — this is the last one.

- [ ] **Step 1: Create the customer step**

Create `apps/web/src/pages/sales/customer-step.tsx`:

```tsx
import type { BillFieldConfig } from '@shop/core';
import { Input, Label } from '@/components/ui/input';

/**
 * The configured customer details, rendered in the order an admin set.
 *
 * Holds no state of its own: the values live with the rest of the sale in the
 * billing page, so stepping back to the cart and forward again does not lose
 * what was typed.
 */
export function CustomerStep({
  fields,
  values,
  onChange,
  missingKeys,
}: {
  fields: BillFieldConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  missingKeys: ReadonlySet<string>;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No customer details are configured. Add them under Onboarding → Masters → Bill fields.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.id}>
          <Label htmlFor={`bf-${field.key}`}>{field.label}</Label>
          <Input
            id={`bf-${field.key}`}
            required={field.required}
            inputMode={field.type === 'number' ? 'numeric' : field.type === 'phone' ? 'tel' : 'text'}
            value={values[field.key] ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
          {missingKeys.has(field.key) ? (
            <p className="mt-1 text-xs text-destructive">{field.label} is required.</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the step state to the billing page**

In `apps/web/src/pages/sales/quick-billing.tsx`, beside the existing `useState` calls:

```tsx
  const billFields = useBillFields();
  const [step, setStep] = useState<'cart' | 'customer' | 'payment'>('cart');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showMissing, setShowMissing] = useState(false);

  const activeFields = billFields.data ?? [];
  const missing = missingRequiredFields(activeFields, fieldValues);
  const missingKeys = new Set(showMissing ? missing.map((f) => f.key) : []);
```

Add to the imports:

```tsx
import { missingRequiredFields, splitBillFields } from '@shop/core';
import { useBillFields } from '@shop/state';
import { CustomerStep } from './customer-step';
```

- [ ] **Step 3: Send the split values at checkout**

In the same file's `onCheckout` handler, replace the `customerId` / `customerName` arguments:

```tsx
    const split = splitBillFields(activeFields, fieldValues);
    const result = await checkout.mutateAsync({
      storeId: store.id,
      counterId,
      customerId: cart.customerId,
      // The name may come from the configured fields now; the cart's own
      // customer name stays as the fallback for a company with no
      // configuration, which is the pre-existing behaviour.
      customerName: split.customer.name ?? cart.customerName,
      customerDetails: split.sale,
      lines: saleLines(),
      tenders: tenders.filter((t) => t.amount > 0),
      createdBy: user.id,
    });
```

After a successful sale, reset the wizard alongside the existing resets:

```tsx
    setFieldValues({});
    setShowMissing(false);
    setStep('cart');
```

- [ ] **Step 4: Gate the steps**

Wrap the cart column's cards so only the current step shows, and add the navigation. The cart card keeps its existing contents; add below it:

```tsx
  {step === 'cart' ? (
    <Button className="w-full" disabled={cart.lines.length === 0} onClick={() => setStep('customer')}>
      Continue to customer
    </Button>
  ) : null}

  {step === 'customer' ? (
    <Card>
      <CardHeader title="Customer" description="Details recorded against this bill." />
      <CardBody className="space-y-4">
        <CustomerStep
          fields={activeFields}
          values={fieldValues}
          missingKeys={missingKeys}
          onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('cart')}>
            Back to cart
          </Button>
          <Button
            onClick={() => {
              // Revealed only on an attempt, so the form does not open covered
              // in errors for fields nobody has had a chance to fill yet.
              setShowMissing(true);
              if (missing.length === 0) setStep('payment');
            }}
          >
            Continue to payment
          </Button>
        </div>
      </CardBody>
    </Card>
  ) : null}
```

Wrap the existing Payment card so it only renders on its own step, and give it a way back. Change its opening from `<Card>` to:

```tsx
  {step === 'payment' ? (
    <Card>
```

and immediately before that card's closing `</Card>`, inside its `CardBody`, add:

```tsx
        <Button variant="outline" onClick={() => setStep('customer')}>
          Back to customer
        </Button>
```

closing the conditional after `</Card>` with:

```tsx
    </Card>
  ) : null}
```

The Bill summary card stays visible on every step — a cashier reading out a total should not have to navigate back to see it.

- [ ] **Step 5: Typecheck and walk the flow**

Run: `pnpm run typecheck && pnpm run test`
Expected: 7 packages typecheck; all suites pass.

Run `pnpm --filter @shop/web dev --port 4599`. Sign in as `owner@nandiretail.in`, configure a required `vehicle_number` under Masters, then in Quick Billing confirm:
- Payment is unreachable while the cart is empty.
- **Continue to payment** refuses while the vehicle number is blank and names the field.
- Going back to the cart and forward again keeps the typed value.
- Completing a sale shows the vehicle number on the invoice.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/sales/quick-billing.tsx apps/web/src/pages/sales/customer-step.tsx
git commit -m "Split billing into cart, customer and payment"
```

---

### Task 7: Persist customer-scope answers and recognise a returning customer

Without this task the `customer` half of `splitBillFields` is computed and
thrown away, so configuring a field as belonging to the customer would silently
capture nothing. It closes the spec's "Recognising a returning customer"
section.

**Files:**
- Modify: `apps/api/src/routes/sales.ts` (upsert the customer inside the checkout transaction)
- Modify: `packages/data/src/repositories.ts` (`MasterRepository.customerByPhone`)
- Modify: `packages/data/src/http/catalogue.ts`, `packages/data/src/mock/repositories.ts`
- Modify: `apps/api/src/routes/catalogue.ts` (`GET /customers/by-phone/:phone`)
- Modify: `packages/state/src/hooks/use-masters.ts` (`useCustomerByPhone`)
- Modify: `apps/web/src/pages/sales/quick-billing.tsx` (prefill on a known phone)
- Modify: `packages/data/src/mock/repositories.test.ts`

**Interfaces:**
- Consumes: `splitBillFields` (Task 1), `NewInvoice.customerDetails` (Task 3).
- Produces: `MasterRepository.customerByPhone(phone: string): Promise<Customer | undefined>`, `useCustomerByPhone(phone: string | undefined)`.

- [ ] **Step 1: Write the failing test**

In `packages/data/src/mock/repositories.test.ts`, inside the `describe('bill field configuration'` block:

```ts
  it('finds a returning customer by phone instead of duplicating them', async () => {
    const { repos } = await setup();
    const made = await repos.masters.createCustomer({ name: 'Ravi', phone: '9845011111' });

    expect((await repos.masters.customerByPhone('9845011111'))?.id).toBe(made.id);
    expect(await repos.masters.customerByPhone('9999999999')).toBeUndefined();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @shop/data exec vitest run src/mock/repositories.test.ts -t "returning customer"`
Expected: FAIL — `repos.masters.customerByPhone is not a function`.

- [ ] **Step 3: Add the lookup through every layer**

In `packages/data/src/repositories.ts`, add to `MasterRepository`:

```ts
  /** Phone is unique per company, so this is how a counter finds a walk-in. */
  customerByPhone(phone: string): Promise<Customer | undefined>;
```

In `apps/api/src/routes/catalogue.ts`, beside the customer routes:

```ts
  app.get('/customers/by-phone/:phone', async (request) => {
    const params = z.object({ phone: z.string() }).parse(request.params);
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);

    const phone = params.phone.trim();
    // An empty needle must not match the customers who have no phone.
    if (!phone) throw new HttpError(404, 'Customer not found');
    const row = await prisma.customer.findFirst({ where: { companyId, phone, active: true } });
    return publicCustomer(found(row, 'Customer', phone));
  });
```

In `packages/data/src/http/catalogue.ts`, inside `masters`:

```ts
    customerByPhone: async (phone) =>
      await orUndefined(fetcher.get<Customer>(`/customers/by-phone/${encodeURIComponent(phone)}`)),
```

In `packages/data/src/mock/repositories.ts`, inside `masters`:

```ts
    customerByPhone: (phone) => {
      const needle = phone.trim();
      return tick(needle ? this.store.customers.find((c) => c.active && c.phone === needle) : undefined);
    },
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @shop/data exec vitest run src/mock/repositories.test.ts -t "returning customer"`
Expected: PASS.

- [ ] **Step 5: Persist customer-scope answers on the API**

In `apps/api/src/routes/sales.ts`, add to the `POST /invoices` Zod body:

```ts
        customerFields: z.record(z.string()).optional(),
```

Inside the checkout transaction, before `writeInvoice`, resolve the customer:

```ts
        // Customer-scope answers identify a person, so they are written to the
        // customer rather than to the bill. A phone with no name is carried on
        // the invoice alone: `Customer.name` is non-null, and a cashier forced
        // past that requirement types the phone number into the name field.
        const details = body.customerFields ?? {};
        let customerId = body.customerId;
        if (!customerId && details.phone) {
          const existing = await tx.customer.findFirst({
            where: { companyId, phone: details.phone },
          });
          if (existing) {
            customerId = existing.id;
            const patch = Object.fromEntries(
              (['name', 'email', 'gstin', 'addressLine'] as const)
                .filter((k) => details[k])
                .map((k) => [k, details[k]]),
            );
            if (Object.keys(patch).length > 0) {
              await tx.customer.update({ where: { id: existing.id }, data: patch });
            }
          } else if (details.name) {
            const made = await tx.customer.create({
              data: {
                companyId,
                name: details.name,
                phone: details.phone,
                email: details.email,
                gstin: details.gstin,
                addressLine: details.addressLine,
              },
            });
            customerId = made.id;
          }
        }
```

Pass `customerId` and `customerName: details.name ?? body.customerName` into `writeInvoice`.

- [ ] **Step 6: Send both halves from the till**

In `packages/data/src/repositories.ts`, add to `NewInvoice`:

```ts
  /** Customer-scope answers, keyed by BillFieldConfig.key. */
  customerFields?: Record<string, string>;
```

In `packages/data/src/http/sales.ts`, add `customerFields: input.customerFields,` to the `invoices.create` body. In `packages/state/src/hooks/use-billing.ts`, add `customerFields?: Record<string, string>;` to `CheckoutInput` and pass it through `useCheckout`.

In `apps/web/src/pages/sales/quick-billing.tsx`, replace the checkout arguments from Task 6 Step 3 with:

```tsx
    const split = splitBillFields(activeFields, fieldValues);
    const result = await checkout.mutateAsync({
      storeId: store.id,
      counterId,
      customerId: cart.customerId,
      customerName: split.customer.name ?? cart.customerName,
      customerFields: split.customer,
      customerDetails: split.sale,
      lines: saleLines(),
      tenders: tenders.filter((t) => t.amount > 0),
      createdBy: user.id,
    });
```

- [ ] **Step 7: Prefill on a recognised phone**

In `packages/state/src/hooks/use-masters.ts`:

```ts
/** Looks a walk-in up by phone. Disabled until the number looks complete. */
export function useCustomerByPhone(phone: string | undefined) {
  const repos = useRepositories();
  const needle = (phone ?? '').trim();
  return useQuery({
    queryKey: ['masters', 'customer-by-phone', needle],
    queryFn: () => repos.masters.customerByPhone(needle),
    enabled: needle.length >= 10,
    staleTime: STALE.LIVE,
  });
}
```

In `apps/web/src/pages/sales/quick-billing.tsx`:

```tsx
  const known = useCustomerByPhone(fieldValues.phone);

  useEffect(() => {
    const found = known.data;
    if (!found) return;
    // Fills blanks only. A cashier correcting a stale name must not have the
    // stored one typed back over them on the next render.
    setFieldValues((prev) => ({
      ...prev,
      name: prev.name || found.name,
      email: prev.email || found.email || '',
      gstin: prev.gstin || found.gstin || '',
      addressLine: prev.addressLine || found.addressLine || '',
    }));
  }, [known.data]);
```

Add `useCustomerByPhone` to the `@shop/state` import and `useEffect` to the
`react` import.

- [ ] **Step 8: Verify**

Run: `pnpm run typecheck && pnpm run test`
Expected: 7 packages typecheck; all suites pass.

In the dev server: configure `phone` and `name` as customer-scope fields, bill once with both filled, then start a second sale and type the same phone — the name should fill itself, and the second invoice should link to the same customer rather than creating another.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes packages/data/src packages/state/src apps/web/src/pages/sales
git commit -m "Keep customer-scope answers on the customer, and find them again by phone"
```

---

## Deployment

After Task 6, deploy the whole feature:

```bash
pnpm run typecheck && pnpm run test
git push origin main
```

Confirm the Vercel deployment reaches `Ready` (`vercel ls --yes`), then check `GET https://shop-suite.vercel.app/api/bill-fields` returns `401` unauthenticated — proving the route shipped and is gated.

The schema push in Task 2 already applied to production, so no further database step is needed.
