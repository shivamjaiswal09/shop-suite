import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  deriveInventoryLevel,
  emptyLevel,
  roundMoney,
  signedQty,
  type InventoryLevel,
  type StockMovement,
  type StockReservation,
  type StockTransfer,
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
 * Inventory over Postgres — the ledger slice.
 *
 * The one rule this file exists to protect: stock is never a stored number.
 * Every level served here is folded from `stock_movements` by the pure
 * `deriveInventoryLevel` in @shop/core, the same function the mock and the unit
 * tests use. Reimplementing the fold as a SQL SUM would be faster to type and
 * would immediately be a second, divergent definition of what "on hand" means —
 * it would also silently drop weighted-average cost and the damaged tally,
 * which are not sums.
 */

const MOVEMENT_TYPES = [
  'opening',
  'receipt',
  'sale',
  'sale_return',
  'transfer_out',
  'transfer_in',
  'adjustment',
  'damage',
] as const;

const REF_TYPES = [
  'opening',
  'goods_receipt',
  'purchase_return',
  'invoice',
  'sales_return',
  'transfer',
  'adjustment',
  'stock_count',
] as const;

const VIEW = 'inventory.view';
const WRITE = 'inventory.adjust';

/* -------------------------------------------------------------- row shapes */

/** Prisma hands Decimal columns back as Decimal instances, never as numbers. */
type Decimalish = { toString(): string };

interface MovementRow {
  id: string;
  skuId: string;
  locationId: string;
  type: StockMovement['type'];
  qty: Decimalish;
  refType: StockMovement['refType'];
  refId: string;
  reasonCodeId: string | null;
  unitCost: Decimalish | null;
  note: string | null;
  createdBy: string;
  createdAt: Date;
}

interface ReservationRow {
  id: string;
  skuId: string;
  locationId: string;
  qty: Decimalish;
  refId: string;
  status: StockReservation['status'];
  createdAt: Date;
}

interface TransferLineRow {
  skuId: string;
  qty: Decimalish;
  receivedQty: Decimalish;
}

interface TransferRow {
  id: string;
  number: string;
  fromLocationId: string;
  toLocationId: string;
  status: StockTransfer['status'];
  note: string | null;
  dispatchedBy: string;
  dispatchedAt: Date;
  receivedBy: string | null;
  receivedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  lines: TransferLineRow[];
}

const num = (value: Decimalish): number => Number(value.toString());

const toMovement = (row: MovementRow): StockMovement => ({
  id: row.id,
  skuId: row.skuId,
  locationId: row.locationId,
  type: row.type,
  qty: num(row.qty),
  refType: row.refType,
  refId: row.refId,
  reasonCodeId: row.reasonCodeId ?? undefined,
  unitCost: row.unitCost === null ? undefined : num(row.unitCost),
  note: row.note ?? undefined,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
});

const toReservation = (row: ReservationRow): StockReservation => ({
  id: row.id,
  skuId: row.skuId,
  locationId: row.locationId,
  qty: num(row.qty),
  refType: 'order',
  refId: row.refId,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

const toTransfer = (row: TransferRow): StockTransfer => ({
  id: row.id,
  number: row.number,
  fromLocationId: row.fromLocationId,
  toLocationId: row.toLocationId,
  lines: row.lines.map((line) => ({
    skuId: line.skuId,
    qty: num(line.qty),
    receivedQty: num(line.receivedQty),
  })),
  status: row.status,
  note: row.note ?? undefined,
  dispatchedBy: row.dispatchedBy,
  dispatchedAt: row.dispatchedAt.toISOString(),
  receivedBy: row.receivedBy ?? undefined,
  receivedAt: row.receivedAt?.toISOString(),
  cancelledBy: row.cancelledBy ?? undefined,
  cancelledAt: row.cancelledAt?.toISOString(),
});

/** Lines have no sequence column, so their cuids stand in for dispatch order. */
const LINES = { lines: { orderBy: { id: 'asc' } } } as const;

/* ----------------------------------------------------------------- the fold */

/**
 * Every level in this file comes from here.
 *
 * One query loads the whole location's ledger, then the rows are bucketed by
 * SKU before the pure fold runs — a fold per SKU over the unbucketed array
 * would be O(skus x movements), and a query per SKU would be worse still.
 * Passing `skuIds` narrows the read when the caller only cares about a few.
 */
async function foldLocation(
  db: Prisma.TransactionClient,
  companyId: string,
  locationId: string,
  skuIds?: string[],
): Promise<Map<string, InventoryLevel>> {
  const only = skuIds ? { skuId: { in: skuIds } } : {};

  const [movementRows, reservationRows] = await Promise.all([
    db.stockMovement.findMany({
      where: { companyId, locationId, ...only },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    // Reservations never touch the ledger; they only hold back `available`.
    db.stockReservation.findMany({
      where: { companyId, locationId, status: 'active', ...only },
    }),
  ]);

  const movements = new Map<string, StockMovement[]>();
  for (const row of movementRows) {
    const movement = toMovement(row);
    const bucket = movements.get(movement.skuId);
    if (bucket) bucket.push(movement);
    else movements.set(movement.skuId, [movement]);
  }

  const reservations = new Map<string, StockReservation[]>();
  for (const row of reservationRows) {
    const reservation = toReservation(row);
    const bucket = reservations.get(reservation.skuId);
    if (bucket) bucket.push(reservation);
    else reservations.set(reservation.skuId, [reservation]);
  }

  const wanted = skuIds ?? [...new Set([...movements.keys(), ...reservations.keys()])];
  const levels = new Map<string, InventoryLevel>();
  for (const skuId of wanted) {
    levels.set(
      skuId,
      deriveInventoryLevel({
        skuId,
        locationId,
        movements: movements.get(skuId) ?? [],
        reservations: reservations.get(skuId) ?? [],
      }),
    );
  }
  return levels;
}

const levelFor = async (
  db: Prisma.TransactionClient,
  companyId: string,
  skuId: string,
  locationId: string,
): Promise<InventoryLevel> =>
  (await foldLocation(db, companyId, locationId, [skuId])).get(skuId) ??
  emptyLevel(skuId, locationId);

/* ---------------------------------------------------------------- guardrails */

async function assertLocation(companyId: string, locationId: string) {
  const location = await prisma.stockLocation.findFirst({
    where: { id: locationId, companyId },
    select: { id: true, code: true, name: true },
  });
  if (!location) throw new HttpError(404, `StockLocation not found: ${locationId}`);
  return location;
}

async function assertSkus(companyId: string, skuIds: string[]) {
  const ids = [...new Set(skuIds)];
  const found = await prisma.sku.count({ where: { id: { in: ids }, companyId } });
  if (found !== ids.length) throw new HttpError(400, 'One or more SKUs do not belong to this company');
}

/**
 * Transfer numbers are per company and per source location, zero padded to a
 * fixed width so the lexicographic max is also the numeric max — that is what
 * lets the next number come from an index scan instead of a count.
 */
async function nextTransferNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  scope: string,
): Promise<string> {
  const prefix = `TRF-${scope}-`;
  const last = await tx.stockTransfer.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const next = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

/**
 * Writes here cross Supabase's transaction pooler, where one round trip costs
 * orders of magnitude more than a local socket. Prisma's 5s default expires
 * part-way through a multi-statement write and rolls back a transfer that was
 * never wrong, so the budget is stated rather than inherited.
 */
const TX = { maxWait: 15_000, timeout: 30_000 } as const;

const audit = (data: {
  companyId: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
}) => prisma.auditEntry.create({ data });

/* --------------------------------------------------------------- the routes */

export function registerInventoryRoutes(app: FastifyInstance) {
  /**
   * `routes.ts` decorates each request with its principal, but this file is
   * registered independently of it — depending on that hook having run would
   * make these routes break on a registration-order change somewhere else.
   */
  async function callerOf(request: FastifyRequest): Promise<Principal | null> {
    const decorated = request as { principal?: Principal | null };
    return decorated.principal ?? principalFrom(request);
  }

  /** Tenancy plus permission, resolved once per handler. */
  async function scope(request: FastifyRequest, requested: string | undefined, permission: string) {
    const { caller, companyId } = requireCompany(await callerOf(request), requested);
    requirePermission(caller, permission);
    return { caller, companyId };
  }

  /* ---------------------------------------------------------------- stock */

  app.get('/stock/level', async (request) => {
    const query = z
      .object({ companyId: z.string().optional(), skuId: z.string(), locationId: z.string() })
      .parse(request.query);
    const { companyId } = await scope(request, query.companyId, VIEW);

    await assertLocation(companyId, query.locationId);
    return levelFor(prisma, companyId, query.skuId, query.locationId);
  });

  app.get('/stock/levels', async (request) => {
    const query = z
      .object({ companyId: z.string().optional(), locationId: z.string() })
      .parse(request.query);
    const { companyId } = await scope(request, query.companyId, VIEW);

    await assertLocation(companyId, query.locationId);
    const [skus, levels] = await Promise.all([
      prisma.sku.findMany({ where: { companyId, active: true }, select: { id: true } }),
      foldLocation(prisma, companyId, query.locationId),
    ]);

    // Every active SKU gets a row, including the ones that have never moved at
    // this location — an absent line and a zero line mean different things to a
    // stock take.
    return skus
      .map((sku) => levels.get(sku.id) ?? emptyLevel(sku.id, query.locationId))
      .sort((a, b) => a.skuId.localeCompare(b.skuId));
  });

  app.get('/stock/movements', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        skuId: z.string().optional(),
        locationId: z.string().optional(),
        type: z.enum(MOVEMENT_TYPES).optional(),
        // Defaulted, not optional. Omitting it used to mean "every movement this
        // company has ever recorded" — the one table guaranteed to grow without
        // bound, streamed to whoever asked.
        limit: z.coerce.number().int().positive().max(1000).default(200),
      })
      .parse(request.query);
    const { companyId } = await scope(request, query.companyId, VIEW);

    const rows = await prisma.stockMovement.findMany({
      where: {
        companyId,
        ...(query.skuId ? { skuId: query.skuId } : {}),
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      // Newest first, with the id breaking ties so a batch posted on one
      // timestamp still comes back in the order it was written.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: query.limit,
    });
    return rows.map(toMovement);
  });

  app.post('/stock/movements', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        movements: z
          .array(
            z.object({
              skuId: z.string(),
              locationId: z.string(),
              type: z.enum(MOVEMENT_TYPES),
              qty: z.number().finite(),
              refType: z.enum(REF_TYPES),
              refId: z.string(),
              reasonCodeId: z.string().optional(),
              unitCost: z.number().finite().nonnegative().optional(),
              note: z.string().optional(),
            }),
          )
          .min(1),
      })
      .parse(request.body);
    const { caller, companyId } = await scope(request, body.companyId, WRITE);

    await assertSkus(companyId, body.movements.map((m) => m.skuId));
    for (const locationId of new Set(body.movements.map((m) => m.locationId))) {
      await assertLocation(companyId, locationId);
    }

    // One timestamp for the whole batch: these rows describe a single event, and
    // splitting them across milliseconds would let a fold interleave them.
    const createdAt = new Date();
    const rows = await prisma.$transaction(
      body.movements.map((movement) =>
        prisma.stockMovement.create({
          data: {
            companyId,
            skuId: movement.skuId,
            locationId: movement.locationId,
            type: movement.type,
            // The caller passes a magnitude; the ledger stores the direction.
            qty: signedQty(movement.type, movement.qty),
            refType: movement.refType,
            refId: movement.refId,
            reasonCodeId: movement.reasonCodeId,
            unitCost: movement.unitCost,
            note: movement.note,
            // The session is the authority on who acted, not the request body.
            createdBy: caller.userId,
            createdAt,
          },
        }),
      ),
    );

    reply.code(201);
    return rows.map(toMovement);
  });

  /* ------------------------------------------------------------ transfers */

  app.post('/transfers', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        fromLocationId: z.string(),
        toLocationId: z.string(),
        lines: z.array(z.object({ skuId: z.string(), qty: z.number().finite() })).min(1),
        note: z.string().optional(),
        autoReceive: z.boolean().default(false),
      })
      .parse(request.body);
    const { caller, companyId } = await scope(request, body.companyId, WRITE);

    const [from, to] = await Promise.all([
      assertLocation(companyId, body.fromLocationId),
      assertLocation(companyId, body.toLocationId),
    ]);
    if (from.id === to.id) throw new HttpError(400, 'Source and destination must differ');
    for (const line of body.lines) {
      if (line.qty <= 0) throw new HttpError(400, 'Transfer quantities must be positive');
    }
    // A SKU twice on one transfer has no meaning and the line table forbids it;
    // saying so here beats a foreign-key error the cashier cannot read.
    const skuIds = body.lines.map((line) => line.skuId);
    if (new Set(skuIds).size !== skuIds.length) {
      throw new HttpError(400, 'A SKU may appear only once on a transfer');
    }
    await assertSkus(companyId, skuIds);

    // Availability is proved against the source before anything is written.
    const levels = await foldLocation(prisma, companyId, from.id, skuIds);
    for (const line of body.lines) {
      const available = levels.get(line.skuId)?.available ?? 0;
      if (available < line.qty) {
        throw new HttpError(
          409,
          `Insufficient stock: requested ${line.qty}, available ${available}`,
        );
      }
    }

    const at = new Date();
    const autoReceive = body.autoReceive;

    const created = await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          companyId,
          number: await nextTransferNumber(tx, companyId, from.code),
          fromLocationId: from.id,
          toLocationId: to.id,
          status: autoReceive ? 'received' : 'in_transit',
          note: body.note,
          dispatchedBy: caller.userId,
          dispatchedAt: at,
          receivedBy: autoReceive ? caller.userId : null,
          receivedAt: autoReceive ? at : null,
          lines: {
            create: body.lines.map((line) => ({
              skuId: line.skuId,
              qty: line.qty,
              receivedQty: autoReceive ? line.qty : 0,
            })),
          },
        },
        include: LINES,
      });

      // Dispatch only ever removes from the source. Until a receipt is posted
      // the goods are in transit and belong to neither location's on-hand —
      // auto-receive is the dispatcher asserting the receipt in the same breath.
      await tx.stockMovement.createMany({
        data: body.lines.flatMap((line) => [
          {
            companyId,
            skuId: line.skuId,
            locationId: from.id,
            type: 'transfer_out' as const,
            qty: signedQty('transfer_out', line.qty),
            refType: 'transfer' as const,
            refId: transfer.id,
            note: body.note,
            createdBy: caller.userId,
            createdAt: at,
          },
          ...(autoReceive
            ? [
                {
                  companyId,
                  skuId: line.skuId,
                  locationId: to.id,
                  type: 'transfer_in' as const,
                  qty: signedQty('transfer_in', line.qty),
                  refType: 'transfer' as const,
                  refId: transfer.id,
                  createdBy: caller.userId,
                  createdAt: at,
                },
              ]
            : []),
        ]),
      });

      return transfer;
    }, TX);

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'stock_transfer',
      entityId: created.id,
      action: 'create',
      summary: autoReceive
        ? `Transfer ${created.number} moved ${created.lines.length} SKU(s) ${from.code} → ${to.code}`
        : `Transfer ${created.number} dispatched ${from.code} → ${to.code}`,
    });

    reply.code(201);
    return toTransfer(created);
  });

  app.get('/transfers', async (request) => {
    const query = z
      .object({
        companyId: z.string().optional(),
        locationId: z.string().optional(),
        status: z.enum(['draft', 'in_transit', 'received', 'cancelled']).optional(),
        limit: z.coerce.number().int().positive().max(500).default(100),
      })
      .parse(request.query);
    const { companyId } = await scope(request, query.companyId, VIEW);

    const rows = await prisma.stockTransfer.findMany({
      where: {
        companyId,
        ...(query.status ? { status: query.status } : {}),
        // A location's transfers are the ones it sent and the ones it is owed.
        ...(query.locationId
          ? {
              OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }],
            }
          : {}),
      },
      include: LINES,
      orderBy: [{ dispatchedAt: 'desc' }, { id: 'asc' }],
      // Each row drags its lines along, so an unbounded read here is heavier
      // than the row count suggests.
      take: query.limit,
    });
    return rows.map(toTransfer);
  });

  app.get('/transfers/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = await scope(request, query.companyId, VIEW);

    const row = await prisma.stockTransfer.findFirst({
      where: { id, companyId },
      include: LINES,
    });
    // The repository contract returns undefined for a miss, so 404 with no body.
    if (!row) return reply.code(404).send({ error: `StockTransfer not found: ${id}` });
    return toTransfer(row);
  });

  app.post('/transfers/:id/receive', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        companyId: z.string().optional(),
        lines: z
          .array(z.object({ skuId: z.string(), receivedQty: z.number().finite() }))
          .optional(),
        note: z.string().optional(),
      })
      .parse(request.body ?? {});
    const { caller, companyId } = await scope(request, body.companyId, WRITE);

    const existing = await prisma.stockTransfer.findFirst({
      where: { id, companyId },
      include: LINES,
    });
    if (!existing) throw new HttpError(404, `StockTransfer not found: ${id}`);
    if (existing.status !== 'in_transit') {
      throw new HttpError(400, `Transfer ${existing.number} is ${existing.status}`);
    }

    // Omitted lines are received in full — the common case is "it all arrived".
    const counted = new Map((body.lines ?? []).map((line) => [line.skuId, line.receivedQty]));
    const at = new Date();
    const businessDate = at.toISOString().slice(0, 10);

    const settled = existing.lines.map((line) => {
      const dispatched = num(line.qty);
      const received = counted.get(line.skuId) ?? dispatched;
      if (received < 0) throw new HttpError(400, 'Received quantity cannot be negative');
      if (received > dispatched) {
        throw new HttpError(400, `Cannot receive more than the ${dispatched} dispatched`);
      }
      return { skuId: line.skuId, dispatched, received };
    });

    // Only what actually arrived is credited to the destination.
    const arrivals = settled
      .filter((line) => line.received > 0)
      .map((line) => ({
        companyId,
        skuId: line.skuId,
        locationId: existing.toLocationId,
        type: 'transfer_in' as const,
        qty: signedQty('transfer_in', line.received),
        refType: 'transfer' as const,
        refId: id,
        note: body.note,
        createdBy: caller.userId,
        createdAt: at,
      }));

    // Anything dispatched but not received is lost in transit — that is a stock
    // discrepancy against the RECEIVING location, not something to absorb.
    const shortfalls = settled
      .filter((line) => roundMoney(line.dispatched - line.received) > 0)
      .map((line) => ({
        companyId,
        kind: 'stock' as const,
        locationId: existing.toLocationId,
        businessDate,
        refType: 'stock_transfer',
        refId: id,
        expected: line.dispatched,
        actual: line.received,
        variance: roundMoney(line.received - line.dispatched),
        note: `Short receipt on ${existing.number}`,
        status: 'open' as const,
        raisedBy: caller.userId,
        raisedAt: at,
      }));

    const updated = await prisma.$transaction(async (tx) => {
      // Per-line counts differ, so these cannot collapse into one updateMany.
      for (const line of settled) {
        await tx.transferLine.update({
          where: { transferId_skuId: { transferId: id, skuId: line.skuId } },
          data: { receivedQty: line.received },
        });
      }
      if (arrivals.length > 0) await tx.stockMovement.createMany({ data: arrivals });
      if (shortfalls.length > 0) await tx.discrepancy.createMany({ data: shortfalls });

      return tx.stockTransfer.update({
        where: { id },
        data: { status: 'received', receivedBy: caller.userId, receivedAt: at },
        include: LINES,
      });
    }, TX);

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'stock_transfer',
      entityId: id,
      action: 'update',
      summary: `Transfer ${updated.number} received`,
    });
    return toTransfer(updated);
  });

  app.post('/transfers/:id/cancel', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ companyId: z.string().optional() }).parse(request.body ?? {});
    const { caller, companyId } = await scope(request, body.companyId, WRITE);

    const existing = await prisma.stockTransfer.findFirst({
      where: { id, companyId },
      include: LINES,
    });
    if (!existing) throw new HttpError(404, `StockTransfer not found: ${id}`);
    if (existing.status !== 'in_transit') {
      throw new HttpError(400, 'Only an in-transit transfer can be cancelled');
    }

    const at = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      // The goods come back to the source as a compensating movement. Deleting
      // the dispatch would be tidier and would also be a lie: the ledger is
      // append-only, so a reversal is the only honest way back.
      await tx.stockMovement.createMany({
        data: existing.lines.map((line) => ({
          companyId,
          skuId: line.skuId,
          locationId: existing.fromLocationId,
          type: 'transfer_in' as const,
          qty: signedQty('transfer_in', num(line.qty)),
          refType: 'transfer' as const,
          refId: id,
          note: `Cancelled ${existing.number} — returned to source`,
          createdBy: caller.userId,
          createdAt: at,
        })),
      });

      return tx.stockTransfer.update({
        where: { id },
        data: { status: 'cancelled', cancelledBy: caller.userId, cancelledAt: at },
        include: LINES,
      });
    }, TX);

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'stock_transfer',
      entityId: id,
      action: 'cancel',
      summary: `Transfer ${updated.number} cancelled, stock returned to source`,
    });
    return toTransfer(updated);
  });
}
