import { roundMoney, roundQty } from '../entities/common.ts';
import type {
  InventoryLevel,
  StockMovement,
  StockMovementType,
  StockReservation,
  StockTransfer,
} from '../entities/stock.ts';

/**
 * Direction each movement type applies to on-hand stock.
 * `adjustment` is signed by the caller (a count correction can go either way).
 */
const DIRECTION: Record<StockMovementType, 1 | -1 | 0> = {
  opening: 1,
  receipt: 1,
  sale: -1,
  sale_return: 1,
  transfer_in: 1,
  transfer_out: -1,
  adjustment: 0,
  damage: -1,
};

/**
 * Normalises a caller-supplied magnitude into the signed qty stored on the ledger.
 * Callers pass positive magnitudes for everything except adjustments, where the
 * sign they pass is preserved.
 */
export function signedQty(type: StockMovementType, qty: number): number {
  const direction = DIRECTION[type];
  if (direction === 0) return roundQty(qty);
  return roundQty(Math.abs(qty) * direction);
}

export const emptyLevel = (skuId: string, locationId: string): InventoryLevel => ({
  skuId,
  locationId,
  onHand: 0,
  reserved: 0,
  available: 0,
  damaged: 0,
  avgCost: 0,
  value: 0,
});

/**
 * Folds a single movement into a running projection.
 * Inbound movements carrying a unitCost update the weighted-average cost.
 */
export function applyMovement(level: InventoryLevel, movement: StockMovement): InventoryLevel {
  const qty = movement.qty;
  const onHand = roundQty(level.onHand + qty);

  let avgCost = level.avgCost;
  if (qty > 0 && movement.unitCost !== undefined) {
    const priorValue = level.onHand > 0 ? level.onHand * level.avgCost : 0;
    const incomingValue = qty * movement.unitCost;
    const totalQty = (level.onHand > 0 ? level.onHand : 0) + qty;
    avgCost = totalQty > 0 ? roundMoney((priorValue + incomingValue) / totalQty) : movement.unitCost;
  }

  const damaged = movement.type === 'damage' ? roundQty(level.damaged + Math.abs(qty)) : level.damaged;
  const reserved = level.reserved;

  return {
    ...level,
    onHand,
    reserved,
    available: roundQty(onHand - reserved),
    damaged,
    avgCost,
    value: roundMoney(onHand * avgCost),
    lastMovementAt:
      level.lastMovementAt && level.lastMovementAt > movement.createdAt
        ? level.lastMovementAt
        : movement.createdAt,
  };
}

export interface DeriveInventoryLevelInput {
  skuId: string;
  locationId: string;
  /** Ledger rows — may be unfiltered; this function filters by sku + location. */
  movements: readonly StockMovement[];
  /** Active reservations. Reduce `available` without touching `onHand`. */
  reservations?: readonly StockReservation[];
}

/**
 * The single source of truth for stock. Never read a stored quantity — fold the
 * ledger. The contract stays identical when a real backend serves materialised
 * balances: same inputs, same output shape.
 */
export function deriveInventoryLevel(input: DeriveInventoryLevelInput): InventoryLevel {
  const { skuId, locationId, movements, reservations = [] } = input;

  const relevant = movements
    .filter((m) => m.skuId === skuId && m.locationId === locationId)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  const folded = relevant.reduce(applyMovement, emptyLevel(skuId, locationId));

  const reserved = roundQty(
    reservations
      .filter((r) => r.skuId === skuId && r.locationId === locationId && r.status === 'active')
      .reduce((sum, r) => sum + r.qty, 0),
  );

  return {
    ...folded,
    reserved,
    available: roundQty(folded.onHand - reserved),
  };
}

/** Derives levels for every (sku, location) pair present in the ledger. */
export function deriveAllInventoryLevels(
  movements: readonly StockMovement[],
  reservations: readonly StockReservation[] = [],
): InventoryLevel[] {
  const buckets = new Map<string, { skuId: string; locationId: string }>();
  for (const m of movements) {
    buckets.set(`${m.skuId}::${m.locationId}`, { skuId: m.skuId, locationId: m.locationId });
  }
  for (const r of reservations) {
    buckets.set(`${r.skuId}::${r.locationId}`, { skuId: r.skuId, locationId: r.locationId });
  }
  return [...buckets.values()].map(({ skuId, locationId }) =>
    deriveInventoryLevel({ skuId, locationId, movements, reservations }),
  );
}

/**
 * Rolls several location projections into one — e.g. a store plus the
 * locations rolled together. Quantities sum; `avgCost` is re-derived from total
 * value so it stays a true weighted average, not an average of averages.
 */
export function aggregateInventoryLevels(
  levels: readonly InventoryLevel[],
  scopeId = 'network',
): InventoryLevel {
  const first = levels[0];
  if (!first) return emptyLevel('', scopeId);

  const totals = levels.reduce(
    (acc, level) => ({
      onHand: acc.onHand + level.onHand,
      reserved: acc.reserved + level.reserved,
      damaged: acc.damaged + level.damaged,
      value: acc.value + level.value,
    }),
    { onHand: 0, reserved: 0, damaged: 0, value: 0 },
  );

  const onHand = roundQty(totals.onHand);
  const reserved = roundQty(totals.reserved);
  const value = roundMoney(totals.value);
  const lastMovementAt = levels
    .map((l) => l.lastMovementAt)
    .filter((at): at is string => Boolean(at))
    .sort()
    .pop();

  return {
    skuId: first.skuId,
    locationId: scopeId,
    onHand,
    reserved,
    available: roundQty(onHand - reserved),
    damaged: roundQty(totals.damaged),
    avgCost: onHand > 0 ? roundMoney(value / onHand) : 0,
    value,
    lastMovementAt,
  };
}

/**
 * Quantity per SKU currently in transit *towards* a location — dispatched but
 * not yet received. It belongs to no location's on-hand until receipt.
 */
export function deriveInboundInTransit(
  transfers: readonly StockTransfer[],
  toLocationId: string,
): Map<string, number> {
  const inbound = new Map<string, number>();
  for (const transfer of transfers) {
    if (transfer.status !== 'in_transit' || transfer.toLocationId !== toLocationId) continue;
    for (const line of transfer.lines) {
      inbound.set(line.skuId, roundQty((inbound.get(line.skuId) ?? 0) + line.qty));
    }
  }
  return inbound;
}

export type StockAlert = 'out_of_stock' | 'below_min' | 'reorder' | 'ok';

export function stockAlertFor(level: InventoryLevel, minStock: number, reorderLevel: number): StockAlert {
  if (level.available <= 0) return 'out_of_stock';
  if (minStock > 0 && level.available < minStock) return 'below_min';
  if (reorderLevel > 0 && level.available <= reorderLevel) return 'reorder';
  return 'ok';
}
