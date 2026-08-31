import { z } from 'zod';
import { idSchema, moneySchema, quantitySchema, timestampSchema } from './common.ts';

/**
 * THE core invariant of Shop Suite: stock is never a stored mutable number.
 * Every stock-changing event appends a row here; on-hand / available / reserved
 * are projections folded from this ledger (see logic/inventory.ts).
 */
export const stockMovementTypeSchema = z.enum([
  'opening',
  'receipt',
  'sale',
  'sale_return',
  'transfer_out',
  'transfer_in',
  'adjustment',
  'damage',
]);
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

export const movementRefTypeSchema = z.enum([
  'opening',
  'goods_receipt',
  'purchase_return',
  'invoice',
  'sales_return',
  'transfer',
  'adjustment',
  'stock_count',
]);
export type MovementRefType = z.infer<typeof movementRefTypeSchema>;

export const stockMovementSchema = z.object({
  id: idSchema,
  skuId: idSchema,
  locationId: idSchema,
  type: stockMovementTypeSchema,
  /** Signed: positive adds to on-hand, negative removes. See `signedQty()`. */
  qty: quantitySchema,
  refType: movementRefTypeSchema,
  refId: idSchema,
  reasonCodeId: idSchema.optional(),
  unitCost: moneySchema.nonnegative().optional(),
  note: z.string().optional(),
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

/** Soft hold placed by a confirmed order; released on invoice or cancellation. */
export const stockReservationSchema = z.object({
  id: idSchema,
  skuId: idSchema,
  locationId: idSchema,
  qty: quantitySchema.nonnegative(),
  refType: z.enum(['order']),
  refId: idSchema,
  status: z.enum(['active', 'released', 'consumed']),
  createdAt: timestampSchema,
});
export type StockReservation = z.infer<typeof stockReservationSchema>;

/** Projection — derived, never persisted. */
export const inventoryLevelSchema = z.object({
  skuId: idSchema,
  locationId: idSchema,
  onHand: quantitySchema,
  reserved: quantitySchema,
  available: quantitySchema,
  damaged: quantitySchema,
  avgCost: moneySchema,
  value: moneySchema,
  lastMovementAt: timestampSchema.optional(),
});
export type InventoryLevel = z.infer<typeof inventoryLevelSchema>;

export const transferLineSchema = z.object({
  skuId: idSchema,
  /** Quantity that left the source warehouse. */
  qty: quantitySchema.positive(),
  /** Quantity confirmed at the destination. Short receipts raise a discrepancy. */
  receivedQty: quantitySchema.nonnegative().default(0),
});
export type TransferLine = z.infer<typeof transferLineSchema>;

export const transferStatusSchema = z.enum(['draft', 'in_transit', 'received', 'cancelled']);
export type TransferStatus = z.infer<typeof transferStatusSchema>;

/**
 * A two-step move between any two stock locations — warehouse → store to
 * replenish, store → store to rebalance, or warehouse → warehouse. Dispatch
 * writes `transfer_out` at the source; receipt writes `transfer_in` at the
 * destination. Between the two the stock belongs to neither location — it is
 * in transit, and visible as such.
 *
 * A dispatcher may opt into auto-receive, collapsing both movements into one
 * action. It is off by default: the two-step trail is what catches shortages.
 */
export const stockTransferSchema = z.object({
  id: idSchema,
  number: z.string(),
  fromLocationId: idSchema,
  toLocationId: idSchema,
  lines: z.array(transferLineSchema),
  status: transferStatusSchema,
  note: z.string().optional(),
  dispatchedBy: idSchema,
  dispatchedAt: timestampSchema,
  receivedBy: idSchema.optional(),
  receivedAt: timestampSchema.optional(),
  cancelledBy: idSchema.optional(),
  cancelledAt: timestampSchema.optional(),
});
export type StockTransfer = z.infer<typeof stockTransferSchema>;

export const stockAdjustmentSchema = z.object({
  id: idSchema,
  locationId: idSchema,
  reasonCodeId: idSchema,
  lines: z.array(z.object({ skuId: idSchema, qty: quantitySchema, note: z.string().optional() })),
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;
