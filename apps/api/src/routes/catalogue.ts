import type {
  BillFieldConfig,
  Category,
  Customer,
  PaymentMethod,
  Prisma,
  Product,
  ReasonCode,
  Sku,
  Supplier,
  Tax,
  UnitOfMeasure,
} from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  HttpError,
  principalFrom,
  requireCompany,
  requirePermission,
  type Principal,
} from '../auth.ts';
import { prisma } from '../db.ts';

/**
 * Masters and catalogue.
 *
 * These tables were global in the prototype and are company-scoped here, so
 * every handler resolves the tenant through `requireCompany` before it touches
 * a row — including the reads, because a SKU list is as much a leak as a write.
 * Cross-company ids passed as *references* (a category on a product, a tax on a
 * category, a location for opening stock) are re-checked against the caller's
 * company too: the foreign keys alone would happily accept another tenant's row.
 */

/** Masters are onboarding data, gated like users and locations. */
const MANAGE = 'admin.manage';
/**
 * Customers are the exception: they are created at the counter mid-sale, so
 * requiring admin rights would stop a cashier from billing a new walk-in.
 */
const CUSTOMER_WRITE = 'sales.bill';

const audit = (data: {
  companyId: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
}) => prisma.auditEntry.create({ data });

/**
 * The root instance resolves the caller once per request into `request.principal`.
 * Falling back to resolving it here keeps this plugin correct whatever order it
 * is registered in — the alternative failure mode is silently treating every
 * caller as anonymous.
 */
const who = async (request: FastifyRequest): Promise<Principal | null> =>
  (request as { principal?: Principal | null }).principal ?? principalFrom(request);

/** Same company, and the right to write to it. */
async function gate(request: FastifyRequest, requested: string | undefined, permission: string) {
  const { caller, companyId } = requireCompany(await who(request), requested);
  requirePermission(caller, permission);
  return { caller, companyId };
}

/**
 * The mock compared codes case-insensitively; the database unique index is
 * exact, so `dairy` and `DAIRY` would both be storable. Keep the mock's rule.
 */
const sameText = (value: string) => ({ equals: value, mode: 'insensitive' as const });

const assertFree = async (clash: Promise<unknown>, message: string) => {
  if (await clash) throw new HttpError(409, message);
};

const found = <T>(row: T | null, entity: string, id: string): T => {
  if (!row) throw new HttpError(404, `${entity} not found: ${id}`);
  return row;
};

/* -------------------------------------------------------------- projections */
/**
 * Decimal columns leave Postgres as strings so no paise are lost in JSON; the
 * client reads every one of them back through `num()`. Nullable columns are
 * mapped to undefined because the domain types use optional, not nullable —
 * JSON.stringify then drops the key entirely.
 */
const dec = (value: Prisma.Decimal): string => value.toString();
const decOrNone = (value: Prisma.Decimal | null): string | undefined => value?.toString();

const publicCategory = (row: Category) => ({
  id: row.id,
  companyId: row.companyId,
  code: row.code,
  name: row.name,
  sortOrder: row.sortOrder,
  defaultTaxId: row.defaultTaxId ?? undefined,
  description: row.description ?? undefined,
  active: row.active,
});

const publicUom = (row: UnitOfMeasure) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  precision: row.precision,
  active: row.active,
});

const publicTax = (row: Tax) => ({
  id: row.id,
  name: row.name,
  rate: dec(row.rate),
  inclusive: row.inclusive,
  hsnCode: row.hsnCode ?? undefined,
  active: row.active,
});

const publicCustomer = (row: Customer) => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  phone: row.phone ?? undefined,
  email: row.email ?? undefined,
  gstin: row.gstin ?? undefined,
  addressLine: row.addressLine ?? undefined,
  creditLimit: dec(row.creditLimit),
  active: row.active,
});

const publicSupplier = (row: Supplier) => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  phone: row.phone ?? undefined,
  email: row.email ?? undefined,
  gstin: row.gstin ?? undefined,
  paymentTermsDays: row.paymentTermsDays,
  active: row.active,
});

const publicPaymentMethod = (row: PaymentMethod) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  kind: row.kind,
  countedInDrawer: row.countedInDrawer,
  active: row.active,
});

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

const publicReasonCode = (row: ReasonCode) => ({
  id: row.id,
  usage: row.usage,
  code: row.code,
  name: row.name,
  active: row.active,
});

const publicProduct = (row: Product) => ({
  id: row.id,
  companyId: row.companyId,
  name: row.name,
  categoryId: row.categoryId,
  brand: row.brand ?? undefined,
  description: row.description ?? undefined,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
});

const publicSku = (row: Sku) => ({
  id: row.id,
  productId: row.productId,
  code: row.code,
  name: row.name,
  barcode: row.barcode,
  uomId: row.uomId,
  taxId: row.taxId,
  purchasePrice: dec(row.purchasePrice),
  sellingPrice: dec(row.sellingPrice),
  mrp: decOrNone(row.mrp),
  minStock: dec(row.minStock),
  reorderLevel: dec(row.reorderLevel),
  active: row.active,
});

/* ------------------------------------------------------------------ schemas */

const idParam = z.object({ id: z.string() });

const listQuery = z.object({
  companyId: z.string().optional(),
  includeInactive: z.coerce.boolean().optional(),
});

const activeFilter = (includeInactive?: boolean) => (includeInactive ? {} : { active: true });

/* -------------------------------------------------------- reference guards */

async function assertTaxInCompany(taxId: string, companyId: string) {
  const tax = await prisma.tax.findFirst({ where: { id: taxId, companyId } });
  if (!tax) throw new HttpError(400, 'Unknown tax for this company');
}

async function assertUomInCompany(uomId: string, companyId: string) {
  const uom = await prisma.unitOfMeasure.findFirst({ where: { id: uomId, companyId } });
  if (!uom) throw new HttpError(400, 'Unknown unit of measure for this company');
}

async function assertLocationInCompany(locationId: string, companyId: string) {
  const location = await prisma.stockLocation.findFirst({ where: { id: locationId, companyId } });
  if (!location) throw new HttpError(400, 'Unknown location for this company');
}

async function assertCategoryInCompany(categoryId: string, companyId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, companyId } });
  // Phrased as a not-found rather than a validation failure: the mock treats an
  // unknown category on a product as exactly that, and the message is asserted.
  if (!category) throw new HttpError(404, `Category not found: ${categoryId}`);
}

export async function registerCatalogueRoutes(app: FastifyInstance) {
  /* ------------------------------------------------------------ categories */

  app.get('/categories', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.category.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      // Merchandising order, not alphabetical: sortOrder first, ties by name.
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(publicCategory);
  });

  app.post('/categories', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        sortOrder: z.number().int().optional(),
        defaultTaxId: z.string().optional(),
        description: z.string().optional(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const code = body.code.trim().toUpperCase();
    await assertFree(
      prisma.category.findFirst({ where: { companyId, code: sameText(code) } }),
      `Category code ${code} already exists`,
    );
    if (body.defaultTaxId) await assertTaxInCompany(body.defaultTaxId, companyId);

    const category = await prisma.category.create({
      data: {
        companyId,
        code,
        name: body.name.trim(),
        // Unspecified order means "last", which is where a new category belongs.
        sortOrder: body.sortOrder ?? (await prisma.category.count({ where: { companyId } })),
        defaultTaxId: body.defaultTaxId || null,
        description: body.description,
      },
    });

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'category',
      entityId: category.id,
      action: 'create',
      summary: `Category ${category.name} created`,
    });
    reply.code(201);
    return publicCategory(category);
  });

  app.patch('/categories/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        sortOrder: z.number().int().optional(),
        defaultTaxId: z.string().optional(),
        description: z.string().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(await prisma.category.findUnique({ where: { id } }), 'Category', id);
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    const code = patch.code?.trim().toUpperCase();
    if (code) {
      await assertFree(
        prisma.category.findFirst({ where: { companyId, code: sameText(code), NOT: { id } } }),
        `Category code ${code} already exists`,
      );
    }
    if (patch.defaultTaxId) await assertTaxInCompany(patch.defaultTaxId, companyId);

    const category = await prisma.category.update({
      where: { id },
      data: { ...patch, code, name: patch.name?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'category',
      entityId: id,
      action: 'update',
      summary: `Category ${category.name} updated`,
    });
    return publicCategory(category);
  });

  /* -------------------------------------------------------- units of measure */

  app.get('/units-of-measure', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.unitOfMeasure.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: { code: 'asc' },
    });
    return rows.map(publicUom);
  });

  app.post('/units-of-measure', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        precision: z.number().int().min(0).max(3).optional(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const code = body.code.trim().toUpperCase();
    await assertFree(
      prisma.unitOfMeasure.findFirst({ where: { companyId, code: sameText(code) } }),
      `Unit of measure code ${code} already exists`,
    );

    const uom = await prisma.unitOfMeasure.create({
      data: { companyId, code, name: body.name.trim(), precision: body.precision ?? 0 },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'unit_of_measure',
      entityId: uom.id,
      action: 'create',
      summary: `UoM ${uom.code} created`,
    });
    reply.code(201);
    return publicUom(uom);
  });

  app.patch('/units-of-measure/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        precision: z.number().int().min(0).max(3).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(
      await prisma.unitOfMeasure.findUnique({ where: { id } }),
      'Unit of measure',
      id,
    );
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    const code = patch.code?.trim().toUpperCase();
    if (code) {
      await assertFree(
        prisma.unitOfMeasure.findFirst({ where: { companyId, code: sameText(code), NOT: { id } } }),
        `Unit of measure code ${code} already exists`,
      );
    }

    const uom = await prisma.unitOfMeasure.update({
      where: { id },
      data: { ...patch, code, name: patch.name?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'unit_of_measure',
      entityId: id,
      action: 'update',
      summary: `UoM ${uom.code} updated`,
    });
    return publicUom(uom);
  });

  /* ----------------------------------------------------------------- taxes */

  app.get('/taxes', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.tax.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: [{ rate: 'asc' }, { name: 'asc' }],
    });
    return rows.map(publicTax);
  });

  app.post('/taxes', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        name: z.string().min(1),
        rate: z.number().min(0).max(100),
        inclusive: z.boolean(),
        hsnCode: z.string().optional(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const name = body.name.trim();
    // A tax is identified by its name in every dropdown; the schema enforces it
    // per company, so catch the clash here rather than letting P2002 escape.
    await assertFree(
      prisma.tax.findFirst({ where: { companyId, name: sameText(name) } }),
      `Tax name ${name} already exists`,
    );

    const tax = await prisma.tax.create({
      data: { companyId, name, rate: body.rate, inclusive: body.inclusive, hsnCode: body.hsnCode },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'tax',
      entityId: tax.id,
      action: 'create',
      summary: `Tax ${tax.name} created`,
    });
    reply.code(201);
    return publicTax(tax);
  });

  app.patch('/taxes/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        name: z.string().min(1).optional(),
        rate: z.number().min(0).max(100).optional(),
        inclusive: z.boolean().optional(),
        hsnCode: z.string().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(await prisma.tax.findUnique({ where: { id } }), 'Tax', id);
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    const name = patch.name?.trim();
    if (name) {
      await assertFree(
        prisma.tax.findFirst({ where: { companyId, name: sameText(name), NOT: { id } } }),
        `Tax name ${name} already exists`,
      );
    }

    const tax = await prisma.tax.update({ where: { id }, data: { ...patch, name } });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'tax',
      entityId: id,
      action: 'update',
      summary: `Tax ${tax.name} updated`,
    });
    return publicTax(tax);
  });

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
    // `key` is deliberately absent: invoices already store answers against it,
    // so re-keying a field would orphan every value captured so far.
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

  /* ------------------------------------------------------------- customers */

  app.get('/customers', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.customer.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: { name: 'asc' },
    });
    return rows.map(publicCustomer);
  });

  app.post('/customers', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        gstin: z.string().optional(),
        addressLine: z.string().optional(),
        creditLimit: z.number().min(0).optional(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, CUSTOMER_WRITE);

    const phone = body.phone?.trim() || undefined;
    // Phone is how the counter looks a customer up, so it must resolve to one
    // row. Anonymous customers carry no phone and never collide.
    if (phone) {
      await assertFree(
        prisma.customer.findFirst({ where: { companyId, phone } }),
        `Customer phone ${phone} already exists`,
      );
    }

    const customer = await prisma.customer.create({
      data: {
        companyId,
        name: body.name.trim(),
        phone,
        email: body.email || null,
        gstin: body.gstin,
        addressLine: body.addressLine,
        creditLimit: body.creditLimit ?? 0,
      },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'customer',
      entityId: customer.id,
      action: 'create',
      summary: `Customer ${customer.name} created`,
    });
    reply.code(201);
    return publicCustomer(customer);
  });

  app.patch('/customers/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        gstin: z.string().optional(),
        addressLine: z.string().optional(),
        creditLimit: z.number().min(0).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(await prisma.customer.findUnique({ where: { id } }), 'Customer', id);
    const { caller, companyId } = await gate(request, existing.companyId, CUSTOMER_WRITE);

    const phone = patch.phone?.trim();
    if (phone) {
      await assertFree(
        prisma.customer.findFirst({ where: { companyId, phone, NOT: { id } } }),
        `Customer phone ${phone} already exists`,
      );
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { ...patch, phone, name: patch.name?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'customer',
      entityId: id,
      action: 'update',
      summary: `Customer ${customer.name} updated`,
    });
    return publicCustomer(customer);
  });

  /* ------------------------------------------------------------- suppliers */

  app.get('/suppliers', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.supplier.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: { name: 'asc' },
    });
    return rows.map(publicSupplier);
  });

  app.post('/suppliers', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        gstin: z.string().optional(),
        paymentTermsDays: z.number().int().min(0).optional(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const supplier = await prisma.supplier.create({
      data: {
        companyId,
        name: body.name.trim(),
        phone: body.phone,
        email: body.email || null,
        gstin: body.gstin,
        paymentTermsDays: body.paymentTermsDays ?? 0,
      },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'supplier',
      entityId: supplier.id,
      action: 'create',
      summary: `Supplier ${supplier.name} created`,
    });
    reply.code(201);
    return publicSupplier(supplier);
  });

  app.patch('/suppliers/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        gstin: z.string().optional(),
        paymentTermsDays: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(await prisma.supplier.findUnique({ where: { id } }), 'Supplier', id);
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    const supplier = await prisma.supplier.update({
      where: { id },
      data: { ...patch, name: patch.name?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'supplier',
      entityId: id,
      action: 'update',
      summary: `Supplier ${supplier.name} updated`,
    });
    return publicSupplier(supplier);
  });

  /* -------------------------------------------------------- payment methods */

  app.get('/payment-methods', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.paymentMethod.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: { code: 'asc' },
    });
    return rows.map(publicPaymentMethod);
  });

  app.post('/payment-methods', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        kind: z.enum(['cash', 'card', 'upi', 'wallet', 'credit', 'bank_transfer']),
        countedInDrawer: z.boolean(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const code = body.code.trim().toUpperCase();
    await assertFree(
      prisma.paymentMethod.findFirst({ where: { companyId, code: sameText(code) } }),
      `Payment method code ${code} already exists`,
    );

    const method = await prisma.paymentMethod.create({
      data: {
        companyId,
        code,
        name: body.name.trim(),
        kind: body.kind,
        countedInDrawer: body.countedInDrawer,
      },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'payment_method',
      entityId: method.id,
      action: 'create',
      summary: `Payment method ${method.name} created`,
    });
    reply.code(201);
    return publicPaymentMethod(method);
  });

  app.patch('/payment-methods/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        kind: z.enum(['cash', 'card', 'upi', 'wallet', 'credit', 'bank_transfer']).optional(),
        countedInDrawer: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(
      await prisma.paymentMethod.findUnique({ where: { id } }),
      'Payment method',
      id,
    );
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    const code = patch.code?.trim().toUpperCase();
    if (code) {
      await assertFree(
        prisma.paymentMethod.findFirst({ where: { companyId, code: sameText(code), NOT: { id } } }),
        `Payment method code ${code} already exists`,
      );
    }

    const method = await prisma.paymentMethod.update({
      where: { id },
      data: { ...patch, code, name: patch.name?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'payment_method',
      entityId: id,
      action: 'update',
      summary: `Payment method ${method.name} updated`,
    });
    return publicPaymentMethod(method);
  });

  /* ----------------------------------------------------------- reason codes */

  const usageSchema = z.enum(['cancellation', 'return', 'adjustment', 'damage', 'discrepancy']);

  app.get('/reason-codes', async (request) => {
    const query = listQuery.extend({ usage: usageSchema.optional() }).parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.reasonCode.findMany({
      where: {
        companyId,
        ...activeFilter(query.includeInactive),
        ...(query.usage ? { usage: query.usage } : {}),
      },
      orderBy: [{ usage: 'asc' }, { code: 'asc' }],
    });
    return rows.map(publicReasonCode);
  });

  app.post('/reason-codes', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        usage: usageSchema,
        code: z.string().min(1),
        name: z.string().min(1),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const code = body.code.trim().toUpperCase();
    // Scoped to the usage: the same short code may legitimately mean one thing
    // on a return and another on an adjustment.
    await assertFree(
      prisma.reasonCode.findFirst({ where: { companyId, usage: body.usage, code: sameText(code) } }),
      `Reason code ${code} already exists`,
    );

    const reason = await prisma.reasonCode.create({
      data: { companyId, usage: body.usage, code, name: body.name.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'reason_code',
      entityId: reason.id,
      action: 'create',
      summary: `Reason ${reason.code} created`,
    });
    reply.code(201);
    return publicReasonCode(reason);
  });

  app.patch('/reason-codes/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        usage: usageSchema.optional(),
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(await prisma.reasonCode.findUnique({ where: { id } }), 'Reason code', id);
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    const code = patch.code?.trim().toUpperCase();
    if (code || patch.usage) {
      const usage = patch.usage ?? existing.usage;
      await assertFree(
        prisma.reasonCode.findFirst({
          where: { companyId, usage, code: sameText(code ?? existing.code), NOT: { id } },
        }),
        `Reason code ${code ?? existing.code} already exists`,
      );
    }

    const reason = await prisma.reasonCode.update({
      where: { id },
      data: { ...patch, code, name: patch.name?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'reason_code',
      entityId: id,
      action: 'update',
      summary: `Reason ${reason.code} updated`,
    });
    return publicReasonCode(reason);
  });

  /* -------------------------------------------------------------- products */

  app.get('/products', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.product.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(publicProduct);
  });

  app.post('/products', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        name: z.string().min(1),
        categoryId: z.string(),
        brand: z.string().optional(),
        description: z.string().optional(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    await assertCategoryInCompany(body.categoryId, companyId);

    const product = await prisma.product.create({
      data: {
        companyId,
        name: body.name,
        categoryId: body.categoryId,
        brand: body.brand,
        description: body.description,
      },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'product',
      entityId: product.id,
      action: 'create',
      summary: `Product ${product.name} created`,
    });
    reply.code(201);
    return publicProduct(product);
  });

  app.patch('/products/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        name: z.string().min(1).optional(),
        categoryId: z.string().optional(),
        brand: z.string().optional(),
        description: z.string().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(await prisma.product.findUnique({ where: { id } }), 'Product', id);
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    if (patch.categoryId) await assertCategoryInCompany(patch.categoryId, companyId);

    const product = await prisma.product.update({ where: { id }, data: patch });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'product',
      entityId: id,
      action: 'update',
      summary: `Product ${product.name} updated`,
    });
    return publicProduct(product);
  });

  /* ------------------------------------------------------------------ skus */

  app.get('/skus', async (request) => {
    const query = listQuery.parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const rows = await prisma.sku.findMany({
      where: { companyId, ...activeFilter(query.includeInactive) },
      orderBy: { code: 'asc' },
    });
    return rows.map(publicSku);
  });

  /**
   * Counter search. An exact barcode is what a scanner produces, so it ranks
   * ahead of everything a human typed; the rest is a substring on code or name.
   */
  app.get('/skus/search', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        term: z.string(),
        limit: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);

    const needle = query.term.trim().toLowerCase();
    if (!needle) return [];

    const [exact, fuzzy] = await Promise.all([
      prisma.sku.findMany({ where: { companyId, active: true, barcode: needle } }),
      prisma.sku.findMany({
        where: {
          companyId,
          active: true,
          // `barcode: { not: needle }` alone would drop every barcode-less SKU:
          // in SQL, NULL != 'x' is NULL rather than true, so the row fails the
          // filter. Spelling out the null branch keeps unbarcoded stock — which
          // is most of what a counter searches by name — findable.
          OR: [{ barcode: null }, { barcode: { not: needle } }],
          AND: {
            OR: [
              { code: { contains: needle, mode: 'insensitive' } },
              { name: { contains: needle, mode: 'insensitive' } },
            ],
          },
        },
        orderBy: { code: 'asc' },
        take: query.limit,
      }),
    ]);

    return [...exact, ...fuzzy].slice(0, query.limit).map(publicSku);
  });

  app.get('/skus/barcode/:barcode', async (request) => {
    const params = z.object({ barcode: z.string() }).parse(request.params);
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);

    // Inactive SKUs are deliberately unscannable — deactivating one is how a
    // line is pulled from sale without losing its history.
    const sku = await prisma.sku.findFirst({
      where: { companyId, active: true, barcode: params.barcode.trim() },
    });
    return publicSku(found(sku, 'Sku', params.barcode));
  });

  app.get('/skus/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(await who(request), query.companyId);
    const sku = await prisma.sku.findFirst({ where: { id, companyId } });
    return publicSku(found(sku, 'Sku', id));
  });

  app.post('/skus', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        productId: z.string(),
        // The code is the one thing a SKU cannot be created without: it is its
        // identity in search, on a bill, and in every import a shop ever does.
        code: z.string().min(1),
        name: z.string().trim().optional(),
        barcode: z.string().trim().optional(),
        uomId: z.string(),
        taxId: z.string(),
        purchasePrice: z.number().nonnegative().optional(),
        sellingPrice: z.number().nonnegative().optional(),
        mrp: z.number().nonnegative().optional(),
        minStock: z.number().nonnegative().optional(),
        reorderLevel: z.number().nonnegative().optional(),
        openingStock: z.object({ locationId: z.string(), qty: z.number() }).optional(),
      })
      .parse(request.body);
    const { caller, companyId } = await gate(request, body.companyId, MANAGE);

    const parent = found(
      await prisma.product.findFirst({ where: { id: body.productId, companyId } }),
      'Product',
      body.productId,
    );
    await assertUomInCompany(body.uomId, companyId);
    await assertTaxInCompany(body.taxId, companyId);

    // Null rather than '', so any number of SKUs can go without one. Only a
    // real barcode is checked for collisions — absence cannot collide.
    const barcode = body.barcode || null;
    const code = body.code.trim();
    // A SKU always carries a name because it is printed on the bill; when the
    // form does not ask for one, the product it belongs to supplies it.
    const name = body.name || parent.name;
    if (barcode) {
      await assertFree(
        prisma.sku.findFirst({ where: { companyId, barcode } }),
        `Barcode ${barcode} is already assigned to another SKU`,
      );
    }
    await assertFree(
      prisma.sku.findFirst({ where: { companyId, code: sameText(code) } }),
      `SKU code ${code} already exists`,
    );

    const opening = body.openingStock && body.openingStock.qty > 0 ? body.openingStock : undefined;
    if (opening) await assertLocationInCompany(opening.locationId, companyId);

    // The SKU and its opening balance are one fact. A SKU that exists with the
    // ledger row missing would read as zero stock and be silently wrong.
    const sku = await prisma.$transaction(async (tx) => {
      const created = await tx.sku.create({
        data: {
          companyId,
          productId: body.productId,
          code,
          name,
          barcode,
          uomId: body.uomId,
          taxId: body.taxId,
          purchasePrice: body.purchasePrice ?? 0,
          sellingPrice: body.sellingPrice ?? 0,
          mrp: body.mrp,
          minStock: body.minStock ?? 0,
          reorderLevel: body.reorderLevel ?? 0,
        },
      });

      if (opening) {
        // Opening stock is never a stored count — it is the first row of the
        // ledger, positive because `opening` only ever adds.
        await tx.stockMovement.create({
          data: {
            companyId,
            skuId: created.id,
            locationId: opening.locationId,
            type: 'opening',
            qty: Math.abs(opening.qty),
            refType: 'opening',
            refId: created.id,
            unitCost: body.purchasePrice,
            note: 'Opening stock on SKU creation',
            createdBy: caller.userId,
          },
        });
      }
      return created;
    });

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'sku',
      entityId: sku.id,
      action: 'create',
      summary: `SKU ${sku.code} created${
        body.openingStock ? ` with opening stock ${body.openingStock.qty}` : ''
      }`,
    });
    reply.code(201);
    return publicSku(sku);
  });

  app.patch('/skus/:id', async (request) => {
    const { id } = idParam.parse(request.params);
    const patch = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        /** Null or '' clears it; undefined leaves it alone. */
        barcode: z.string().trim().nullish(),
        uomId: z.string().optional(),
        taxId: z.string().optional(),
        purchasePrice: z.number().nonnegative().optional(),
        sellingPrice: z.number().nonnegative().optional(),
        mrp: z.number().nonnegative().optional(),
        minStock: z.number().nonnegative().optional(),
        reorderLevel: z.number().nonnegative().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = found(await prisma.sku.findUnique({ where: { id } }), 'Sku', id);
    const { caller, companyId } = await gate(request, existing.companyId, MANAGE);

    // Undefined means "not being changed"; anything else resolves to a real
    // barcode or to null, never to ''.
    const barcode = patch.barcode === undefined ? undefined : patch.barcode || null;
    // `NOT: { id }` is the whole point: re-saving a row's own barcode is not a
    // clash, and an edit form posts every field back whether it changed or not.
    if (barcode) {
      await assertFree(
        prisma.sku.findFirst({ where: { companyId, barcode, NOT: { id } } }),
        `Barcode ${barcode} is already assigned to another SKU`,
      );
    }
    const code = patch.code?.trim();
    if (code) {
      await assertFree(
        prisma.sku.findFirst({ where: { companyId, code: sameText(code), NOT: { id } } }),
        `SKU code ${code} already exists`,
      );
    }
    if (patch.uomId) await assertUomInCompany(patch.uomId, companyId);
    if (patch.taxId) await assertTaxInCompany(patch.taxId, companyId);

    const sku = await prisma.sku.update({
      where: { id },
      data: { ...patch, code, barcode, name: patch.name?.trim() },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'sku',
      entityId: id,
      action: 'update',
      summary: `SKU ${sku.code} updated`,
    });
    return publicSku(sku);
  });
}
