import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  calcClosing,
  calcRefund,
  calcTotals,
  needsDiscrepancy,
  priceLine,
  returnableLines,
  roundMoney,
  roundQty,
  signedQty,
  summarizeSalesByMethod,
  type Invoice as DomainInvoice,
  type SaleLine,
  type SaleTotals,
} from '@shop/core';
import {
  HttpError,
  principalFrom,
  requireCompany,
  requirePermission,
  type Principal,
} from '../auth.ts';
import { prisma } from '../db.ts';

/**
 * Selling, purchasing and day-end — the money-and-stock half of the API.
 *
 * Two rules shape everything below.
 *
 * First, arithmetic is never written here. Pricing, totals, refunds and cash
 * variance come from `@shop/core`, the same pure functions the mock and the
 * screens use, so a figure cannot differ depending on which side computed it.
 * This file's job is tenancy, validation, ordering and durability.
 *
 * Second, stock is never a stored number. Every quantity is folded from the
 * StockMovement ledger, and any handler that changes stock appends rows to it
 * inside the same transaction as the document that caused them — an invoice
 * without its `sale` movements is a corrupt ledger, not a partial success.
 */

type Tx = Prisma.TransactionClient;

/** Opening float when no prior closing carried cash forward. */
const DEFAULT_OPENING_CASH = 2000;

/**
 * A ledger write is half a dozen statements and the pooler is a round trip
 * away, so Prisma's 5s default aborts perfectly healthy transactions on a slow
 * link — the caller gets a 500 where the only real problem was latency. The
 * read-only master lookups are hoisted out of the transactions below for the
 * same reason; only the rows that must land together stay inside one.
 */
const TX = { maxWait: 10_000, timeout: 30_000 } as const;

/** Prisma hands Decimals back as Decimal objects; every one becomes a number here. */
const n = (value: Prisma.Decimal | number | null | undefined): number => Number(value ?? 0);

/** Postgres stores absent optionals as NULL; the domain types use undefined. */
const opt = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

const businessDateOf = (at: Date): string => at.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ input */

const saleLineInput = z.object({
  skuId: z.string().min(1),
  qty: z.number().positive(),
  discount: z.number().nonnegative().optional(),
  unitPriceOverride: z.number().nonnegative().optional(),
  overrideBasis: z.enum(['exclusive', 'inclusive']).optional(),
});

const qtyLineInput = z.object({ skuId: z.string().min(1), qty: z.number() });
const businessDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/* ------------------------------------------------------------ wire shapes */

type LineRow = {
  id: string;
  skuId: string;
  skuCode: string;
  name: string;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxId: string;
  taxRate: Prisma.Decimal;
  taxInclusive: boolean;
  taxableValue: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

type TotalsRow = {
  subTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxableValue: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  roundOff: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
};

const lineWire = (line: LineRow) => ({
  id: line.id,
  skuId: line.skuId,
  skuCode: line.skuCode,
  name: line.name,
  qty: line.qty,
  unitPrice: line.unitPrice,
  discount: line.discount,
  taxId: line.taxId,
  taxRate: line.taxRate,
  taxInclusive: line.taxInclusive,
  taxableValue: line.taxableValue,
  taxAmount: line.taxAmount,
  lineTotal: line.lineTotal,
});

const totalsWire = (row: TotalsRow) => ({
  subTotal: row.subTotal,
  discountTotal: row.discountTotal,
  taxableValue: row.taxableValue,
  taxTotal: row.taxTotal,
  roundOff: row.roundOff,
  grandTotal: row.grandTotal,
});

const orderWire = (row: TotalsRow & { lines: LineRow[] } & Record<string, unknown>) => ({
  id: row.id,
  number: row.number,
  storeId: row.storeId,
  customerId: row.customerId,
  status: row.status,
  lines: row.lines.map(lineWire),
  totals: totalsWire(row),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const invoiceWire = (row: TotalsRow & { lines: LineRow[] } & Record<string, unknown>) => ({
  id: row.id,
  number: row.number,
  orderId: row.orderId,
  storeId: row.storeId,
  counterId: row.counterId,
  customerId: row.customerId,
  customerName: row.customerName,
  businessDate: row.businessDate,
  status: row.status,
  lines: row.lines.map(lineWire),
  totals: totalsWire(row),
  amountPaid: row.amountPaid,
  amountDue: row.amountDue,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

/* --------------------------------------------------------------- plumbing */

/**
 * The caller, from the session cookie. `registerRoutes` caches this on the
 * request, but Fastify only applies a hook to routes registered after it, so
 * this file resolves the principal itself rather than depending on that order.
 */
async function principal(request: FastifyRequest): Promise<Principal | null> {
  const cached = (request as { principal?: Principal | null }).principal;
  return cached ?? principalFrom(request);
}

const auditIn = (
  tx: Tx,
  data: { companyId: string; actorId: string; entity: string; entityId: string; action: string; summary: string },
) => tx.auditEntry.create({ data });

/**
 * Typing a price over the catalogue's is a supervisor action, not a billing one.
 *
 * Without this gate, `sales.bill` — which the stock Cashier role carries — is
 * enough to ring every item through at zero and pocket the cash, and because the
 * document is internally consistent nothing downstream ever notices. Returns the
 * overridden lines so the caller can record what was changed and by whom;
 * an unaudited override is only marginally better than an ungated one.
 */
function assertMayOverridePrice(
  caller: Principal,
  inputs: readonly SaleLineInputShape[],
): SaleLineInputShape[] {
  const overridden = inputs.filter((line) => line.unitPriceOverride !== undefined);
  if (overridden.length === 0) return overridden;

  // `admin.manage` counts as consent because roles created before this
  // permission existed do not carry it, and a company admin who could grant
  // themselves the permission anyway gains nothing by being refused it. Run
  // prisma/backfill-override-permission.ts to give existing Managers the
  // explicit grant; until then they fall through to the error below.
  const permitted =
    caller.isSuperAdmin ||
    caller.permissions.includes('sales.override_price') ||
    caller.permissions.includes('admin.manage');
  if (!permitted) {
    throw new HttpError(403, 'Changing a price requires the sales.override_price permission');
  }
  return overridden;
}

/** Reads back as: SKU x, catalogue 100.00 -> billed 0.00. */
const overrideSummary = (
  document: string,
  overridden: readonly SaleLineInputShape[],
  priced: readonly SaleLine[],
) =>
  `Price overridden on ${document}: ` +
  overridden
    .map((input) => {
      const line = priced.find((l) => l.skuId === input.skuId);
      return `${line?.skuCode ?? input.skuId} → ${input.unitPriceOverride} ${input.overrideBasis ?? 'exclusive'} of tax`;
    })
    .join(', ');

/**
 * Document numbers are per company, per series, per location — INV-BR1-000003.
 * The next value is read from the highest existing number rather than a counter
 * table: zero padding makes the lexical maximum the numeric maximum, and the
 * @@unique([companyId, number]) index is the real guard against a duplicate.
 */
async function nextDocNumber(
  tx: Tx,
  companyId: string,
  series: 'SO' | 'INV' | 'RET' | 'PO' | 'GRN' | 'PRET',
  locationCode: string,
): Promise<string> {
  const prefix = `${series}-${locationCode}-`;
  const where = { companyId, number: { startsWith: prefix } };
  const orderBy = { number: 'desc' } as const;
  const select = { number: true } as const;

  const latest =
    series === 'SO'
      ? await tx.order.findFirst({ where, orderBy, select })
      : series === 'INV'
        ? await tx.invoice.findFirst({ where, orderBy, select })
        : series === 'RET'
          ? await tx.salesReturn.findFirst({ where, orderBy, select })
          : series === 'PO'
            ? await tx.purchaseOrder.findFirst({ where, orderBy, select })
            : series === 'GRN'
              ? await tx.goodsReceipt.findFirst({ where, orderBy, select })
              : await tx.purchaseReturn.findFirst({ where, orderBy, select });

  const sequence = latest ? Number(latest.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(6, '0')}`;
}

/**
 * Two tills numbering the same series at the same instant both read the same
 * highest number and one loses on the unique index. The sequence is re-read
 * from scratch on the retry, so a second pass takes the next slot.
 */
async function withNumberRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const collided =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!collided || attempt >= 2) throw error;
    }
  }
}

async function locationIn(tx: Tx, companyId: string, locationId: string) {
  const location = await tx.stockLocation.findFirst({ where: { id: locationId, companyId } });
  if (!location) throw new HttpError(404, `StockLocation not found: ${locationId}`);
  return location;
}

/** Available = ledger balance − active reservations, per SKU, at one location. */
async function availableAt(
  tx: Tx,
  companyId: string,
  locationId: string,
  skuIds: string[],
): Promise<Map<string, number>> {
  const onHand = await tx.stockMovement.groupBy({
    by: ['skuId'],
    where: { companyId, locationId, skuId: { in: skuIds } },
    _sum: { qty: true },
  });
  const held = await tx.stockReservation.groupBy({
    by: ['skuId'],
    where: { companyId, locationId, status: 'active', skuId: { in: skuIds } },
    _sum: { qty: true },
  });

  const level = new Map<string, number>(skuIds.map((id) => [id, 0]));
  for (const row of onHand) level.set(row.skuId, n(row._sum.qty));
  for (const row of held) level.set(row.skuId, roundQty((level.get(row.skuId) ?? 0) - n(row._sum.qty)));
  return level;
}

async function assertAvailable(
  tx: Tx,
  companyId: string,
  locationId: string,
  lines: readonly { skuId: string; qty: number }[],
): Promise<void> {
  const wanted = new Map<string, number>();
  for (const line of lines) {
    wanted.set(line.skuId, roundQty((wanted.get(line.skuId) ?? 0) + line.qty));
  }
  const level = await availableAt(tx, companyId, locationId, [...wanted.keys()]);
  for (const [skuId, qty] of wanted) {
    const available = level.get(skuId) ?? 0;
    if (available < qty) {
      throw new HttpError(409, `Insufficient stock: requested ${qty}, available ${available}`);
    }
  }
}

type SaleLineInputShape = z.infer<typeof saleLineInput>;

/** Prices a cart through the shared pricing rules — never a local formula. */
async function priceSaleLines(
  tx: Tx,
  companyId: string,
  inputs: readonly SaleLineInputShape[],
): Promise<SaleLine[]> {
  const skus = await tx.sku.findMany({
    where: { companyId, id: { in: inputs.map((i) => i.skuId) } },
    include: { tax: true },
  });

  return inputs.map((input, index) => {
    const sku = skus.find((s) => s.id === input.skuId);
    if (!sku) throw new HttpError(404, `Sku not found: ${input.skuId}`);
    return priceLine({
      id: `line_${index + 1}`,
      sku: {
        id: sku.id,
        code: sku.code,
        name: sku.name,
        sellingPrice: n(sku.sellingPrice),
        taxId: sku.taxId,
      },
      tax: { id: sku.tax.id, rate: n(sku.tax.rate), inclusive: sku.tax.inclusive },
      qty: input.qty,
      discount: input.discount,
      unitPriceOverride: input.unitPriceOverride,
      overrideBasis: input.overrideBasis,
    });
  });
}

const lineData = (line: SaleLine) => ({
  skuId: line.skuId,
  skuCode: line.skuCode,
  name: line.name,
  qty: line.qty,
  unitPrice: line.unitPrice,
  discount: line.discount,
  taxId: line.taxId,
  taxRate: line.taxRate,
  taxInclusive: line.taxInclusive,
  taxableValue: line.taxableValue,
  taxAmount: line.taxAmount,
  lineTotal: line.lineTotal,
});

/**
 * The whole stock side of a sale: the tax document plus exactly one `sale`
 * movement per line, at the store that sold them. Callers must already have
 * proven availability — a conversion from an order has instead consumed the
 * reservation that guaranteed it.
 */
async function writeInvoice(
  tx: Tx,
  args: {
    companyId: string;
    actorId: string;
    store: { id: string; code: string };
    counterId: string;
    customerId?: string | null;
    customerName?: string | null;
    lines: SaleLine[];
    totals: SaleTotals;
    orderId?: string | null;
  },
) {
  const at = new Date();
  const invoice = await tx.invoice.create({
    data: {
      companyId: args.companyId,
      number: await nextDocNumber(tx, args.companyId, 'INV', args.store.code),
      orderId: args.orderId ?? null,
      storeId: args.store.id,
      counterId: args.counterId,
      customerId: args.customerId ?? null,
      customerName: args.customerName ?? null,
      businessDate: businessDateOf(at),
      status: 'unpaid',
      ...args.totals,
      amountPaid: 0,
      amountDue: args.totals.grandTotal,
      createdBy: args.actorId,
      createdAt: at,
      lines: { create: args.lines.map(lineData) },
    },
    include: { lines: { orderBy: { id: 'asc' } } },
  });

  await tx.stockMovement.createMany({
    data: args.lines.map((line) => ({
      companyId: args.companyId,
      skuId: line.skuId,
      locationId: args.store.id,
      type: 'sale' as const,
      qty: signedQty('sale', line.qty),
      refType: 'invoice' as const,
      refId: invoice.id,
      createdBy: args.actorId,
      createdAt: at,
    })),
  });

  await auditIn(tx, {
    companyId: args.companyId,
    actorId: args.actorId,
    entity: 'invoice',
    entityId: invoice.id,
    action: 'create',
    summary: `Invoice ${invoice.number} billed for ₹${args.totals.grandTotal}`,
  });

  return invoice;
}

/* ------------------------------------------------------------- day-end */

interface ClosingKey {
  storeId: string;
  counterId: string;
  businessDate: string;
}

const closingWire = (
  row: {
    salesByMethod: {
      paymentMethodId: string;
      paymentMethodName: string;
      kind: string;
      countedInDrawer: boolean;
      txnCount: number;
      amount: Prisma.Decimal;
    }[];
  } & Record<string, unknown>,
) => ({
  id: row.id,
  storeId: row.storeId,
  counterId: row.counterId,
  businessDate: row.businessDate,
  openingCash: row.openingCash,
  salesByMethod: row.salesByMethod,
  expectedCash: row.expectedCash,
  physicalCash: row.physicalCash,
  variance: row.variance,
  depositedAmount: row.depositedAmount,
  carriedForward: row.carriedForward,
  note: row.note,
  status: row.status,
  submittedBy: row.submittedBy,
  submittedAt: row.submittedAt,
  approvedBy: row.approvedBy,
  approvedAt: row.approvedAt,
});

/**
 * Everything the till needs to count down, and everything `submit` needs to
 * freeze. Read-only: previewing a day must never write one.
 */
async function buildPreview(tx: Tx, companyId: string, key: ClosingKey) {
  const payments = await tx.payment.findMany({
    where: {
      companyId,
      storeId: key.storeId,
      businessDate: key.businessDate,
      counterId: key.counterId,
    },
  });
  const methods = await tx.paymentMethod.findMany({ where: { companyId } });

  const salesByMethod = summarizeSalesByMethod(
    payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      storeId: p.storeId,
      counterId: p.counterId,
      businessDate: p.businessDate,
      paymentMethodId: p.paymentMethodId,
      amount: n(p.amount),
      reference: opt(p.reference),
      status: p.status,
      idempotencyKey: p.idempotencyKey,
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
    })),
    methods.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      kind: m.kind,
      countedInDrawer: m.countedInDrawer,
      active: m.active,
    })),
  );

  const existing = await tx.dayEndClosing.findUnique({
    where: {
      storeId_counterId_businessDate: {
        storeId: key.storeId,
        counterId: key.counterId,
        businessDate: key.businessDate,
      },
    },
    include: { salesByMethod: true },
  });

  // Yesterday's float opens today's drawer, so the cash trail is continuous.
  const previous = await tx.dayEndClosing.findFirst({
    where: {
      companyId,
      storeId: key.storeId,
      counterId: key.counterId,
      businessDate: { lt: key.businessDate },
    },
    orderBy: { businessDate: 'desc' },
  });

  const openingCash = existing
    ? n(existing.openingCash)
    : previous
      ? n(previous.carriedForward)
      : DEFAULT_OPENING_CASH;

  const calc = calcClosing({ openingCash, salesByMethod, physicalCash: 0 });

  return {
    salesByMethod,
    existing,
    openingCash,
    wire: {
      storeId: key.storeId,
      counterId: key.counterId,
      businessDate: key.businessDate,
      openingCash,
      salesByMethod,
      expectedCash: calc.expectedCash,
      invoiceCount: new Set(payments.map((p) => p.invoiceId)).size,
      totalSales: calc.totalSales,
      existing: existing ? closingWire(existing) : undefined,
    },
  };
}

/* ---------------------------------------------------------------- routes */

export async function registerSalesRoutes(app: FastifyInstance) {
  /* --------------------------------------------------------------- orders */

  app.post('/orders', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().min(1),
        customerId: z.string().optional(),
        lines: z.array(saleLineInput),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'sales.bill');
    // Gated here too: an order converts to an invoice at the price it carries,
    // so leaving this open would just move the same abuse one hop upstream.
    const overridden = assertMayOverridePrice(caller, body.lines);
    if (body.lines.length === 0) throw new HttpError(400, 'An order needs at least one line');

    // Master data is read outside the transaction: pricing a cart reads the
    // catalogue, and holding a transaction open across those round trips buys
    // no integrity — only a longer window for the ledger writes below to fail in.
    const store = await locationIn(prisma, companyId, body.storeId);
    if (body.customerId) await customerIn(prisma, companyId, body.customerId);
    const lines = await priceSaleLines(prisma, companyId, body.lines);
    const totals = calcTotals(lines);

    const order = await withNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        await assertAvailable(tx, companyId, store.id, lines);

        const created = await tx.order.create({
          data: {
            companyId,
            number: await nextDocNumber(tx, companyId, 'SO', store.code),
            storeId: store.id,
            customerId: body.customerId ?? null,
            status: 'confirmed',
            ...totals,
            createdBy: caller.userId,
            lines: { create: lines.map(lineData) },
          },
          include: { lines: { orderBy: { id: 'asc' } } },
        });

        // A reservation holds stock without moving it: available drops, on-hand
        // does not. The invoice is what finally takes the units off the shelf.
        await tx.stockReservation.createMany({
          data: lines.map((line) => ({
            companyId,
            skuId: line.skuId,
            locationId: store.id,
            qty: line.qty,
            refType: 'order' as const,
            refId: created.id,
            status: 'active' as const,
          })),
        });

        await auditIn(tx, {
          companyId,
          actorId: caller.userId,
          entity: 'order',
          entityId: created.id,
          action: 'create',
          summary: `Order ${created.number} confirmed for ₹${totals.grandTotal}`,
        });
        if (overridden.length > 0) {
          await auditIn(tx, {
            companyId,
            actorId: caller.userId,
            entity: 'order',
            entityId: created.id,
            action: 'price_override',
            summary: overrideSummary(created.number, overridden, lines),
          });
        }
        return created;
      }, TX),
    );

    reply.code(201);
    return orderWire(order);
  });

  app.get('/orders', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().optional(),
        status: z.enum(['draft', 'confirmed', 'invoiced', 'cancelled']).optional(),
      })
      .parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    const rows = await prisma.order.findMany({
      where: { companyId, storeId: query.storeId, status: query.status },
      include: { lines: { orderBy: { id: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(orderWire);
  });

  app.get('/orders/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    const row = await prisma.order.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!row) throw new HttpError(404, `Order not found: ${id}`);
    return orderWire(row);
  });

  /** Consumes the order's reservations and writes the sale movements. */
  app.post('/orders/:id/invoice', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ companyId: z.string().optional(), counterId: z.string().min(1) })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'sales.bill');

    const invoice = await withNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id, companyId },
          include: { lines: { orderBy: { id: 'asc' } } },
        });
        if (!order) throw new HttpError(404, `Order not found: ${id}`);
        if (order.status !== 'confirmed') {
          throw new HttpError(409, `Order ${order.number} is ${order.status}`);
        }
        const store = await locationIn(tx, companyId, order.storeId);

        // The hold becomes the sale, so it must stop subtracting from available
        // before the movement subtracts from on-hand — otherwise the units are
        // counted against the shelf twice.
        await tx.stockReservation.updateMany({
          where: { companyId, refType: 'order', refId: order.id, status: 'active' },
          data: { status: 'consumed' },
        });

        const created = await writeInvoice(tx, {
          companyId,
          actorId: caller.userId,
          store,
          counterId: body.counterId,
          customerId: order.customerId,
          customerName: order.customerId
            ? (await tx.customer.findUnique({ where: { id: order.customerId } }))?.name
            : undefined,
          lines: order.lines.map((line) => ({
            id: line.id,
            skuId: line.skuId,
            skuCode: line.skuCode,
            name: line.name,
            qty: n(line.qty),
            unitPrice: n(line.unitPrice),
            discount: n(line.discount),
            taxId: line.taxId,
            taxRate: n(line.taxRate),
            taxInclusive: line.taxInclusive,
            taxableValue: n(line.taxableValue),
            taxAmount: n(line.taxAmount),
            lineTotal: n(line.lineTotal),
          })),
          totals: {
            subTotal: n(order.subTotal),
            discountTotal: n(order.discountTotal),
            taxableValue: n(order.taxableValue),
            taxTotal: n(order.taxTotal),
            roundOff: n(order.roundOff),
            grandTotal: n(order.grandTotal),
          },
          orderId: order.id,
        });

        await tx.order.update({ where: { id: order.id }, data: { status: 'invoiced' } });
        return created;
      }, TX),
    );

    reply.code(201);
    return invoiceWire(invoice);
  });

  /* ------------------------------------------------------------- invoices */

  app.post('/invoices', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().min(1),
        counterId: z.string().min(1),
        customerId: z.string().optional(),
        customerName: z.string().optional(),
        orderId: z.string().optional(),
        lines: z.array(saleLineInput),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'sales.bill');
    const overridden = assertMayOverridePrice(caller, body.lines);
    if (body.lines.length === 0) throw new HttpError(400, 'Cannot bill an empty cart');

    const store = await locationIn(prisma, companyId, body.storeId);
    const customer = body.customerId
      ? await customerIn(prisma, companyId, body.customerId)
      : undefined;
    const lines = await priceSaleLines(prisma, companyId, body.lines);

    const invoice = await withNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        // Availability is proven before the invoice exists, so a short shelf
        // never leaves a billed document behind.
        await assertAvailable(tx, companyId, store.id, lines);

        const written = await writeInvoice(tx, {
          companyId,
          actorId: caller.userId,
          store,
          counterId: body.counterId,
          customerId: body.customerId,
          customerName: body.customerName ?? customer?.name,
          lines,
          totals: calcTotals(lines),
          orderId: body.orderId,
        });

        // Written inside the transaction so a discount can never be recorded
        // without the invoice it discounted, or the other way round.
        if (overridden.length > 0) {
          await auditIn(tx, {
            companyId,
            actorId: caller.userId,
            entity: 'invoice',
            entityId: written.id,
            action: 'price_override',
            summary: overrideSummary(written.number, overridden, lines),
          });
        }
        return written;
      }, TX),
    );

    reply.code(201);
    return invoiceWire(invoice);
  });

  app.get('/invoices', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().optional(),
        businessDate: businessDateInput.optional(),
        counterId: z.string().optional(),
        status: z.enum(['unpaid', 'partially_paid', 'paid', 'cancelled', 'returned']).optional(),
        limit: z.coerce.number().int().positive().max(500).optional(),
      })
      .parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    const rows = await prisma.invoice.findMany({
      where: {
        companyId,
        storeId: query.storeId,
        businessDate: query.businessDate,
        counterId: query.counterId,
        status: query.status,
      },
      include: { lines: { orderBy: { id: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return rows.map(invoiceWire);
  });

  app.get('/invoices/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    const row = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!row) throw new HttpError(404, `Invoice not found: ${id}`);
    return invoiceWire(row);
  });

  /* ------------------------------------------------- cancelling and deleting */

  /**
   * Loads an invoice for an administrative action and refuses the cases that
   * cannot be safely undone.
   *
   * A return is the blocker that matters. It has already put some of the goods
   * back and refunded some of the money, so reversing the whole invoice on top
   * would credit the customer twice and the stock ledger would count the same
   * units returning twice over.
   */
  async function invoiceForAdminAction(id: string, companyId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: { id: 'asc' } }, returns: { select: { number: true } } },
    });
    if (!invoice) throw new HttpError(404, `Invoice not found: ${id}`);
    if (invoice.returns.length > 0) {
      throw new HttpError(
        409,
        `Invoice ${invoice.number} has a return against it (${invoice.returns
          .map((r) => r.number)
          .join(', ')}). Reverse the return first.`,
      );
    }
    return invoice;
  }

  /**
   * Voids an invoice without erasing it.
   *
   * The everyday correction: the goods go back on the shelf, the money comes
   * back out of the day's takings, and the document stays in the books marked
   * cancelled. A tax invoice is meant to be retained and voided rather than
   * removed, and keeping the row is also what stops its number being handed to
   * the next sale.
   */
  app.post('/invoices/:id/cancel', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        companyId: z.string().optional(),
        reasonCodeId: z.string().optional(),
        note: z.string().max(500).optional(),
      })
      .parse(request.body ?? {});

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'admin.manage');

    const invoice = await invoiceForAdminAction(id, companyId);
    if (invoice.status === 'cancelled') {
      throw new HttpError(409, `Invoice ${invoice.number} is already cancelled`);
    }

    const at = new Date();
    return invoiceWire(
      await prisma.$transaction(async (tx) => {
        // Reversing entries rather than edits: stock is an append-only ledger,
        // so putting the goods back is another movement, not the removal of the
        // one that took them.
        await tx.stockMovement.createMany({
          data: invoice.lines.map((line) => ({
            companyId,
            skuId: line.skuId,
            locationId: invoice.storeId,
            type: 'sale_return' as const,
            qty: signedQty('sale_return', n(line.qty)),
            refType: 'invoice' as const,
            refId: invoice.id,
            createdBy: caller.userId,
            createdAt: at,
          })),
        });

        // Same shape a refund uses: a negative payment, so day-end nets out on
        // its own rather than needing a second opposite-signed concept.
        const taken = await tx.payment.findMany({
          where: { invoiceId: invoice.id, status: 'success' },
        });
        for (const payment of taken) {
          await tx.payment.create({
            data: {
              companyId,
              invoiceId: invoice.id,
              storeId: invoice.storeId,
              counterId: invoice.counterId,
              businessDate: businessDateOf(at),
              paymentMethodId: payment.paymentMethodId,
              amount: roundMoney(-n(payment.amount)),
              reference: `cancel:${invoice.number}`,
              status: 'success',
              idempotencyKey: `cancel:${payment.id}`,
              createdBy: caller.userId,
              createdAt: at,
            },
          });
        }

        const cancelled = await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: 'cancelled', amountPaid: 0, amountDue: 0 },
          include: { lines: { orderBy: { id: 'asc' } } },
        });

        await auditIn(tx, {
          companyId,
          actorId: caller.userId,
          entity: 'invoice',
          entityId: invoice.id,
          action: 'cancel',
          summary:
            `Invoice ${invoice.number} cancelled (₹${n(invoice.grandTotal)} reversed)` +
            (body.note ? ` — ${body.note}` : ''),
        });

        return cancelled;
      }, TX),
    );
  });

  /**
   * Erases an invoice. For a bill that should never have existed at all.
   *
   * Cancelling is the right answer almost every time; this exists for the
   * same-day mis-entry an owner does not want in their books. It is gated on
   * retyping the invoice number because the consequences are not reversible and
   * not obvious: the document cannot be reprinted for a customer afterwards,
   * and the number returns to the pool, so the next sale will be issued with
   * it.
   *
   * Stock movements carry `refType`/`refId` rather than a foreign key, so
   * nothing deletes them on our behalf — left behind they would hold stock down
   * for goods that, as far as the books are concerned, were never sold.
   */
  app.delete('/invoices/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ companyId: z.string().optional(), confirmNumber: z.string().min(1) })
      .parse(request.body ?? {});

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'admin.manage');

    const invoice = await invoiceForAdminAction(id, companyId);
    if (body.confirmNumber.trim() !== invoice.number) {
      throw new HttpError(400, `Type ${invoice.number} exactly to confirm`);
    }

    await prisma.$transaction(async (tx) => {
      // Written before the delete: the invoice is the thing being destroyed, so
      // this row is the only record that it ever existed. AuditEntry keeps the
      // id as plain text rather than a relation, so it survives.
      await auditIn(tx, {
        companyId,
        actorId: caller.userId,
        entity: 'invoice',
        entityId: invoice.id,
        action: 'delete',
        summary: `Invoice ${invoice.number} deleted (₹${n(invoice.grandTotal)}, ${invoice.lines.length} line(s))`,
      });

      await tx.stockMovement.deleteMany({ where: { refType: 'invoice', refId: invoice.id } });
      // Lines and payments are cascaded by their foreign keys.
      await tx.invoice.delete({ where: { id: invoice.id } });
    }, TX);

    return { deleted: true, number: invoice.number };
  });

  /* ------------------------------------------------------------- payments */

  app.post('/payments', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        invoiceId: z.string().min(1),
        paymentMethodId: z.string().min(1),
        amount: z.number(),
        reference: z.string().optional(),
        idempotencyKey: z.string().min(1),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'sales.bill');

    const key = { companyId, idempotencyKey: body.idempotencyKey };

    // The retry check comes first, before the invoice is even looked up: a
    // repeat of a capture that already took money must hand back that row, not
    // re-validate and take it again.
    const already = await prisma.payment.findUnique({ where: { companyId_idempotencyKey: key } });
    if (already) return already;

    try {
      const payment = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findFirst({ where: { id: body.invoiceId, companyId } });
        if (!invoice) throw new HttpError(404, `Invoice not found: ${body.invoiceId}`);
        if (body.amount <= 0) throw new HttpError(400, 'Payment amount must be positive');

        const method = await tx.paymentMethod.findFirst({
          where: { id: body.paymentMethodId, companyId },
        });
        if (!method) throw new HttpError(404, `PaymentMethod not found: ${body.paymentMethodId}`);

        const created = await tx.payment.create({
          data: {
            companyId,
            invoiceId: invoice.id,
            storeId: invoice.storeId,
            counterId: invoice.counterId,
            businessDate: invoice.businessDate,
            paymentMethodId: method.id,
            amount: roundMoney(body.amount),
            reference: body.reference ?? null,
            status: 'success',
            idempotencyKey: body.idempotencyKey,
            createdBy: caller.userId,
          },
        });

        const amountPaid = roundMoney(n(invoice.amountPaid) + n(created.amount));
        const amountDue = roundMoney(Math.max(n(invoice.grandTotal) - amountPaid, 0));
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid, amountDue, status: amountDue <= 0 ? 'paid' : 'partially_paid' },
        });

        await auditIn(tx, {
          companyId,
          actorId: caller.userId,
          entity: 'payment',
          entityId: created.id,
          action: 'create',
          summary: `Captured ₹${n(created.amount)} against ${invoice.number}`,
        });
        return created;
      }, TX);

      reply.code(201);
      return payment;
    } catch (error) {
      // Two identical captures raced past the lookup above. The unique index is
      // the real arbiter; the loser reads back the row the winner wrote.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await prisma.payment.findUnique({ where: { companyId_idempotencyKey: key } });
        if (winner) return winner;
      }
      throw error;
    }
  });

  app.get('/invoices/:id/payments', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    return prisma.payment.findMany({
      where: { companyId, invoiceId: id },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.get('/payments', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().min(1),
        businessDate: businessDateInput,
        counterId: z.string().optional(),
      })
      .parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    return prisma.payment.findMany({
      where: {
        companyId,
        storeId: query.storeId,
        businessDate: query.businessDate,
        counterId: query.counterId,
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  /* --------------------------------------------------------- sales returns */

  app.post('/sales-returns', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        invoiceId: z.string().min(1),
        reasonCodeId: z.string().min(1),
        lines: z.array(qtyLineInput),
        note: z.string().optional(),
        refundMethodId: z.string().optional(),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'sales.refund');
    if (body.lines.length === 0) throw new HttpError(400, 'A return needs at least one line');

    const salesReturn = await withNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: body.invoiceId, companyId },
          include: { lines: { orderBy: { id: 'asc' } } },
        });
        if (!invoice) throw new HttpError(404, `Invoice not found: ${body.invoiceId}`);

        const reason = await tx.reasonCode.findFirst({
          where: { id: body.reasonCodeId, companyId },
        });
        if (!reason) throw new HttpError(404, `ReasonCode not found: ${body.reasonCodeId}`);

        const store = await locationIn(tx, companyId, invoice.storeId);

        const prior = await tx.salesReturn.findMany({
          where: { companyId, invoiceId: invoice.id },
          include: { lines: true },
        });

        const domainInvoice = {
          lines: invoice.lines.map((line) => ({
            skuId: line.skuId,
            skuCode: line.skuCode,
            name: line.name,
            qty: n(line.qty),
            lineTotal: n(line.lineTotal),
          })),
        } as DomainInvoice;

        const returnable = returnableLines(
          domainInvoice,
          prior.map((r) => ({ lines: r.lines.map((l) => ({ skuId: l.skuId, qty: n(l.qty) })) })),
        );

        for (const line of body.lines) {
          const eligible = returnable.find((r) => r.skuId === line.skuId);
          if (!eligible) throw new HttpError(400, 'That SKU was not on this invoice');
          if (line.qty <= 0) throw new HttpError(400, 'Return quantities must be positive');
          if (line.qty > eligible.remainingQty) {
            throw new HttpError(
              409,
              `Only ${eligible.remainingQty} of ${eligible.skuCode} may still be returned`,
            );
          }
        }

        const refundTotal = calcRefund(returnable, body.lines);
        const at = new Date();

        const created = await tx.salesReturn.create({
          data: {
            companyId,
            number: await nextDocNumber(tx, companyId, 'RET', store.code),
            invoiceId: invoice.id,
            storeId: invoice.storeId,
            reasonCodeId: reason.id,
            refundTotal,
            createdBy: caller.userId,
            createdAt: at,
            lines: {
              create: body.lines.map((line) => ({
                skuId: line.skuId,
                qty: line.qty,
                refundAmount: calcRefund(returnable, [line]),
              })),
            },
          },
          include: { lines: true },
        });

        // Goods come back onto the shelf they were sold from.
        await tx.stockMovement.createMany({
          data: body.lines.map((line) => ({
            companyId,
            skuId: line.skuId,
            locationId: invoice.storeId,
            type: 'sale_return' as const,
            qty: signedQty('sale_return', line.qty),
            refType: 'sales_return' as const,
            refId: created.id,
            reasonCodeId: reason.id,
            note: body.note ?? null,
            createdBy: caller.userId,
            createdAt: at,
          })),
        });

        let amountPaid = n(invoice.amountPaid);
        if (body.refundMethodId && refundTotal > 0) {
          const method = await tx.paymentMethod.findFirst({
            where: { id: body.refundMethodId, companyId },
          });
          if (!method) throw new HttpError(404, `PaymentMethod not found: ${body.refundMethodId}`);

          // A refund is a negative payment, so day-end cash nets on its own
          // instead of needing a second, opposite-signed concept.
          await tx.payment.create({
            data: {
              companyId,
              invoiceId: invoice.id,
              storeId: invoice.storeId,
              counterId: invoice.counterId,
              businessDate: businessDateOf(at),
              paymentMethodId: method.id,
              amount: roundMoney(-refundTotal),
              reference: created.number,
              status: 'success',
              idempotencyKey: `refund:${created.id}`,
              createdBy: caller.userId,
              createdAt: at,
            },
          });
          amountPaid = roundMoney(amountPaid - refundTotal);
        }

        const returnedQty = [...prior.flatMap((r) => r.lines.map((l) => n(l.qty))), ...body.lines.map((l) => l.qty)]
          .reduce((sum, qty) => sum + qty, 0);
        const billedQty = invoice.lines.reduce((sum, l) => sum + n(l.qty), 0);

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid,
            amountDue: roundMoney(Math.max(n(invoice.grandTotal) - amountPaid, 0)),
            status: returnedQty >= billedQty ? 'returned' : invoice.status,
          },
        });

        await auditIn(tx, {
          companyId,
          actorId: caller.userId,
          entity: 'sales_return',
          entityId: created.id,
          action: 'create',
          summary: `Return ${created.number} against ${invoice.number} for ₹${refundTotal}`,
        });
        return created;
      }, TX),
    );

    reply.code(201);
    return salesReturn;
  });

  app.get('/sales-returns', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().optional(),
        invoiceId: z.string().optional(),
      })
      .parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    return prisma.salesReturn.findMany({
      where: { companyId, storeId: query.storeId, invoiceId: query.invoiceId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  /* ------------------------------------------------------------ purchasing */

  app.get('/purchase-orders', async (request) => {
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { caller, companyId } = requireCompany(await principal(request), query.companyId);
    // Purchase documents carry what the shop pays its suppliers. Tenancy alone
    // let any signed-in cashier read the whole company's cost base and margins;
    // `purchase.manage` already exists on Admin and Manager, so gating on it
    // needs no migration and takes nothing away from anyone who had a reason.
    requirePermission(caller, 'purchase.manage');
    return prisma.purchaseOrder.findMany({
      where: { companyId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/purchase-orders', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        supplierId: z.string().min(1),
        locationId: z.string().min(1),
        lines: z.array(
          z.object({
            skuId: z.string().min(1),
            qty: z.number().positive(),
            unitCost: z.number().nonnegative(),
          }),
        ),
        expectedAt: z.string().optional(),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'purchase.manage');
    if (body.lines.length === 0) {
      throw new HttpError(400, 'A purchase order needs at least one line');
    }

    const order = await withNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findFirst({ where: { id: body.supplierId, companyId } });
        if (!supplier) throw new HttpError(404, `Supplier not found: ${body.supplierId}`);
        const destination = await locationIn(tx, companyId, body.locationId);

        const created = await tx.purchaseOrder.create({
          data: {
            companyId,
            number: await nextDocNumber(tx, companyId, 'PO', destination.code),
            supplierId: supplier.id,
            locationId: destination.id,
            status: 'sent',
            expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
            createdBy: caller.userId,
            lines: {
              create: body.lines.map((line) => ({
                skuId: line.skuId,
                qty: line.qty,
                receivedQty: 0,
                unitCost: line.unitCost,
              })),
            },
          },
          include: { lines: true },
        });

        await auditIn(tx, {
          companyId,
          actorId: caller.userId,
          entity: 'purchase_order',
          entityId: created.id,
          action: 'create',
          summary: `PO ${created.number} raised for ${created.lines.length} line(s)`,
        });
        return created;
      }, TX),
    );

    reply.code(201);
    return order;
  });

  app.post('/purchase-orders/:id/cancel', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ companyId: z.string().optional() }).parse(request.body ?? {});
    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'purchase.manage');

    return prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id, companyId },
        include: { lines: true },
      });
      if (!order) throw new HttpError(404, `PurchaseOrder not found: ${id}`);
      if (order.lines.some((l) => n(l.receivedQty) > 0)) {
        throw new HttpError(409, 'Cannot cancel a PO that has already been partly received');
      }

      const cancelled = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: 'cancelled' },
        include: { lines: true },
      });
      await auditIn(tx, {
        companyId,
        actorId: caller.userId,
        entity: 'purchase_order',
        entityId: order.id,
        action: 'cancel',
        summary: `PO ${order.number} cancelled`,
      });
      return cancelled;
    }, TX);
  });

  app.get('/goods-receipts', async (request) => {
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { caller, companyId } = requireCompany(await principal(request), query.companyId);
    requirePermission(caller, 'purchase.manage');
    return prisma.goodsReceipt.findMany({
      where: { companyId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/goods-receipts', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        purchaseOrderId: z.string().min(1),
        supplierInvoiceNo: z.string().optional(),
        lines: z.array(
          z.object({
            skuId: z.string().min(1),
            qty: z.number().positive(),
            unitCost: z.number().nonnegative(),
            damagedQty: z.number().nonnegative().optional(),
          }),
        ),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'purchase.manage');

    const receipt = await withNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const order = await tx.purchaseOrder.findFirst({
          where: { id: body.purchaseOrderId, companyId },
          include: { lines: true },
        });
        if (!order) throw new HttpError(404, `PurchaseOrder not found: ${body.purchaseOrderId}`);
        if (order.status === 'cancelled') {
          throw new HttpError(409, `PO ${order.number} is cancelled`);
        }

        for (const line of body.lines) {
          const ordered = order.lines.find((l) => l.skuId === line.skuId);
          if (!ordered) throw new HttpError(400, 'That SKU is not on this purchase order');
          const outstanding = roundQty(n(ordered.qty) - n(ordered.receivedQty));
          if (line.qty > outstanding) {
            throw new HttpError(
              409,
              `Only ${outstanding} of that SKU remain outstanding on ${order.number}`,
            );
          }
        }

        const location = await locationIn(tx, companyId, order.locationId);
        const at = new Date();

        const created = await tx.goodsReceipt.create({
          data: {
            companyId,
            number: await nextDocNumber(tx, companyId, 'GRN', location.code),
            purchaseOrderId: order.id,
            supplierId: order.supplierId,
            locationId: order.locationId,
            supplierInvoiceNo: body.supplierInvoiceNo ?? null,
            createdBy: caller.userId,
            createdAt: at,
            lines: {
              create: body.lines.map((line) => ({
                skuId: line.skuId,
                qty: line.qty,
                unitCost: line.unitCost,
                damagedQty: line.damagedQty ?? 0,
              })),
            },
          },
          include: { lines: true },
        });

        await tx.stockMovement.createMany({
          data: body.lines.flatMap((line) => [
            {
              companyId,
              skuId: line.skuId,
              locationId: order.locationId,
              type: 'receipt' as const,
              qty: signedQty('receipt', line.qty),
              refType: 'goods_receipt' as const,
              refId: created.id,
              // This unitCost is the input to the SKU's weighted-average cost.
              unitCost: line.unitCost,
              createdBy: caller.userId,
              createdAt: at,
            },
            // Damaged goods arrived and were paid for, so they are received and
            // then written off — both facts stay on the record.
            ...(line.damagedQty && line.damagedQty > 0
              ? [
                  {
                    companyId,
                    skuId: line.skuId,
                    locationId: order.locationId,
                    type: 'damage' as const,
                    qty: signedQty('damage', line.damagedQty),
                    refType: 'goods_receipt' as const,
                    refId: created.id,
                    note: `Damaged on arrival against ${created.number}`,
                    createdBy: caller.userId,
                    createdAt: at,
                  },
                ]
              : []),
          ]),
        });

        for (const line of body.lines) {
          const ordered = order.lines.find((l) => l.skuId === line.skuId)!;
          await tx.purchaseOrderLine.update({
            where: { id: ordered.id },
            data: { receivedQty: roundQty(n(ordered.receivedQty) + line.qty) },
          });
          ordered.receivedQty = new Prisma.Decimal(roundQty(n(ordered.receivedQty) + line.qty));
        }

        const fullyReceived = order.lines.every((l) => n(l.receivedQty) >= n(l.qty));
        const anyReceived = order.lines.some((l) => n(l.receivedQty) > 0);
        const status = fullyReceived ? 'received' : anyReceived ? 'partially_received' : order.status;
        if (status !== order.status) {
          await tx.purchaseOrder.update({ where: { id: order.id }, data: { status } });
        }

        await auditIn(tx, {
          companyId,
          actorId: caller.userId,
          entity: 'goods_receipt',
          entityId: created.id,
          action: 'create',
          summary: `GRN ${created.number} received against ${order.number}`,
        });
        return created;
      }, TX),
    );

    reply.code(201);
    return receipt;
  });

  app.get('/purchase-returns', async (request) => {
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { caller, companyId } = requireCompany(await principal(request), query.companyId);
    requirePermission(caller, 'purchase.manage');
    return prisma.purchaseReturn.findMany({
      where: { companyId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/purchase-returns', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        goodsReceiptId: z.string().min(1),
        reasonCodeId: z.string().min(1),
        lines: z.array(qtyLineInput),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'purchase.manage');

    const purchaseReturn = await withNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const receipt = await tx.goodsReceipt.findFirst({
          where: { id: body.goodsReceiptId, companyId },
          include: { lines: true },
        });
        if (!receipt) throw new HttpError(404, `GoodsReceipt not found: ${body.goodsReceiptId}`);

        const reason = await tx.reasonCode.findFirst({
          where: { id: body.reasonCodeId, companyId },
        });
        if (!reason) throw new HttpError(404, `ReasonCode not found: ${body.reasonCodeId}`);

        const priorReturns = await tx.purchaseReturn.findMany({
          where: { companyId, goodsReceiptId: receipt.id },
          include: { lines: true },
        });
        const alreadyReturned = new Map<string, number>();
        for (const ret of priorReturns) {
          for (const line of ret.lines) {
            alreadyReturned.set(line.skuId, (alreadyReturned.get(line.skuId) ?? 0) + n(line.qty));
          }
        }

        for (const line of body.lines) {
          const received = receipt.lines.find((l) => l.skuId === line.skuId);
          if (!received) throw new HttpError(400, 'That SKU was not on this receipt');
          const remaining = roundQty(n(received.qty) - (alreadyReturned.get(line.skuId) ?? 0));
          if (line.qty <= 0) throw new HttpError(400, 'Return quantities must be positive');
          if (line.qty > remaining) {
            throw new HttpError(409, `Only ${remaining} of that SKU may still be returned`);
          }
        }
        // The goods have to still be on the shelf to go back to the supplier.
        await assertAvailable(tx, companyId, receipt.locationId, body.lines);

        const location = await locationIn(tx, companyId, receipt.locationId);
        const at = new Date();
        const costOf = (skuId: string) =>
          n(receipt.lines.find((l) => l.skuId === skuId)?.unitCost);

        const created = await tx.purchaseReturn.create({
          data: {
            companyId,
            number: await nextDocNumber(tx, companyId, 'PRET', location.code),
            goodsReceiptId: receipt.id,
            supplierId: receipt.supplierId,
            locationId: receipt.locationId,
            reasonCodeId: reason.id,
            createdBy: caller.userId,
            createdAt: at,
            lines: {
              create: body.lines.map((line) => ({
                skuId: line.skuId,
                qty: line.qty,
                unitCost: costOf(line.skuId),
              })),
            },
          },
          include: { lines: true },
        });

        // No movement type exists for goods going back to a supplier, so this is
        // a signed adjustment tagged `purchase_return` on refType.
        await tx.stockMovement.createMany({
          data: body.lines.map((line) => ({
            companyId,
            skuId: line.skuId,
            locationId: receipt.locationId,
            type: 'adjustment' as const,
            qty: signedQty('adjustment', -line.qty),
            refType: 'purchase_return' as const,
            refId: created.id,
            reasonCodeId: reason.id,
            unitCost: costOf(line.skuId),
            note: `Returned to supplier on ${created.number}`,
            createdBy: caller.userId,
            createdAt: at,
          })),
        });

        await auditIn(tx, {
          companyId,
          actorId: caller.userId,
          entity: 'purchase_return',
          entityId: created.id,
          action: 'create',
          summary: `Purchase return ${created.number} against ${receipt.number}`,
        });
        return created;
      }, TX),
    );

    reply.code(201);
    return purchaseReturn;
  });

  /* --------------------------------------------------------------- day-end */

  app.get('/closings/preview', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().min(1),
        counterId: z.string().min(1),
        businessDate: businessDateInput,
      })
      .parse(request.query);
    const { caller, companyId } = requireCompany(await principal(request), query.companyId);
    requirePermission(caller, 'closing.perform');

    const preview = await buildPreview(prisma, companyId, query);
    return preview.wire;
  });

  app.post('/closings', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string().min(1),
        counterId: z.string().min(1),
        businessDate: businessDateInput,
        openingCash: z.number(),
        physicalCash: z.number(),
        depositedAmount: z.number(),
        carriedForward: z.number(),
        note: z.string().optional(),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'closing.perform');

    const closing = await prisma.$transaction(async (tx) => {
      await locationIn(tx, companyId, body.storeId);
      const preview = await buildPreview(tx, companyId, body);

      if (preview.existing?.status === 'approved') {
        throw new HttpError(409, `Business day ${body.businessDate} is already locked`);
      }

      const calc = calcClosing({
        openingCash: body.openingCash,
        salesByMethod: preview.salesByMethod,
        physicalCash: body.physicalCash,
      });

      const frozen = {
        openingCash: body.openingCash,
        expectedCash: calc.expectedCash,
        physicalCash: calc.physicalCash,
        variance: calc.variance,
        depositedAmount: body.depositedAmount,
        carriedForward: body.carriedForward,
        note: body.note ?? null,
        status: 'submitted' as const,
        submittedBy: caller.userId,
        submittedAt: new Date(),
      };

      // The tender breakdown is frozen into the closing, so a resubmission
      // replaces it wholesale rather than merging into yesterday's snapshot.
      const saved = await tx.dayEndClosing.upsert({
        where: {
          storeId_counterId_businessDate: {
            storeId: body.storeId,
            counterId: body.counterId,
            businessDate: body.businessDate,
          },
        },
        create: {
          companyId,
          storeId: body.storeId,
          counterId: body.counterId,
          businessDate: body.businessDate,
          ...frozen,
        },
        update: { ...frozen, salesByMethod: { deleteMany: {} } },
        include: { salesByMethod: true },
      });

      await tx.dayEndSalesByMethod.createMany({
        data: preview.salesByMethod.map((row) => ({
          closingId: saved.id,
          paymentMethodId: row.paymentMethodId,
          paymentMethodName: row.paymentMethodName,
          kind: row.kind,
          countedInDrawer: row.countedInDrawer,
          txnCount: row.txnCount,
          amount: row.amount,
        })),
      });

      if (needsDiscrepancy(calc.variance)) {
        // A drawer that is off by more than the tolerance is a question for a
        // human, so it becomes a first-class row rather than a note.
        await tx.discrepancy.create({
          data: {
            companyId,
            kind: 'cash',
            locationId: body.storeId,
            businessDate: body.businessDate,
            refType: 'day_end_closing',
            refId: saved.id,
            expected: calc.expectedCash,
            actual: calc.physicalCash,
            variance: calc.variance,
            note: body.note ?? null,
            status: 'open',
            raisedBy: caller.userId,
          },
        });
      }

      await auditIn(tx, {
        companyId,
        actorId: caller.userId,
        entity: 'day_end_closing',
        entityId: saved.id,
        action: 'create',
        summary: `Day-end submitted for ${body.businessDate} (variance ₹${calc.variance})`,
      });

      return tx.dayEndClosing.findUniqueOrThrow({
        where: { id: saved.id },
        include: { salesByMethod: true },
      });
    }, TX);

    reply.code(201);
    return closingWire(closing);
  });

  app.post('/closings/:id/approve', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ companyId: z.string().optional() }).parse(request.body ?? {});
    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'closing.approve');

    const closing = await prisma.$transaction(async (tx) => {
      const existing = await tx.dayEndClosing.findFirst({ where: { id, companyId } });
      if (!existing) throw new HttpError(404, `DayEndClosing not found: ${id}`);

      const approved = await tx.dayEndClosing.update({
        where: { id },
        data: { status: 'approved', approvedBy: caller.userId, approvedAt: new Date() },
        include: { salesByMethod: true },
      });
      await auditIn(tx, {
        companyId,
        actorId: caller.userId,
        entity: 'day_end_closing',
        entityId: id,
        action: 'approve',
        summary: `Day ${approved.businessDate} locked`,
      });
      return approved;
    }, TX);

    return closingWire(closing);
  });

  app.get('/closings', async (request) => {
    const query = z
      .object({ companyId: z.string().optional(), storeId: z.string().optional() })
      .parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    const rows = await prisma.dayEndClosing.findMany({
      where: { companyId, storeId: query.storeId },
      include: { salesByMethod: true },
      orderBy: { businessDate: 'desc' },
    });
    return rows.map(closingWire);
  });

  /* --------------------------------------------------------- discrepancies */

  app.get('/discrepancies', async (request) => {
    const query = z
      .object({ companyId: z.string().optional(), locationId: z.string().optional() })
      .parse(request.query);
    const { companyId } = requireCompany(await principal(request), query.companyId);

    return prisma.discrepancy.findMany({
      where: { companyId, locationId: query.locationId },
      orderBy: { raisedAt: 'desc' },
    });
  });

  app.post('/discrepancies/:id/resolve', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        companyId: z.string().optional(),
        status: z.enum(['open', 'investigating', 'resolved', 'written_off']),
        reasonCodeId: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(await principal(request), body.companyId);
    requirePermission(caller, 'closing.approve');

    return prisma.$transaction(async (tx) => {
      const existing = await tx.discrepancy.findFirst({ where: { id, companyId } });
      if (!existing) throw new HttpError(404, `Discrepancy not found: ${id}`);
      if (body.reasonCodeId) {
        const reason = await tx.reasonCode.findFirst({
          where: { id: body.reasonCodeId, companyId },
        });
        if (!reason) throw new HttpError(404, `ReasonCode not found: ${body.reasonCodeId}`);
      }

      const closed = body.status === 'resolved' || body.status === 'written_off';
      const resolved = await tx.discrepancy.update({
        where: { id },
        data: {
          status: body.status,
          // An omitted field keeps what was already there; a resolution never
          // blanks the cause somebody else recorded.
          reasonCodeId: body.reasonCodeId ?? existing.reasonCodeId,
          note: body.note ?? existing.note,
          ...(closed ? { resolvedBy: caller.userId, resolvedAt: new Date() } : {}),
        },
      });

      await auditIn(tx, {
        companyId,
        actorId: caller.userId,
        entity: 'discrepancy',
        entityId: id,
        action: 'update',
        summary: `Discrepancy marked ${body.status}`,
      });
      return resolved;
    }, TX);
  });
}

async function customerIn(tx: Tx, companyId: string, customerId: string) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, companyId } });
  if (!customer) throw new HttpError(404, `Customer not found: ${customerId}`);
  return customer;
}
