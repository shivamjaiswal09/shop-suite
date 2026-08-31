import { z } from 'zod';
import { idSchema, moneySchema, quantitySchema, timestampSchema } from './common.ts';

export const purchaseOrderStatusSchema = z.enum(['draft', 'sent', 'partially_received', 'received', 'cancelled']);
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

export const purchaseOrderSchema = z.object({
  id: idSchema,
  number: z.string(),
  supplierId: idSchema,
  /** Where the goods land — usually a warehouse, but any location works. */
  locationId: idSchema,
  status: purchaseOrderStatusSchema,
  lines: z.array(
    z.object({
      skuId: idSchema,
      qty: quantitySchema.positive(),
      receivedQty: quantitySchema.nonnegative().default(0),
      unitCost: moneySchema.nonnegative(),
    }),
  ),
  expectedAt: timestampSchema.optional(),
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export const goodsReceiptSchema = z.object({
  id: idSchema,
  number: z.string(),
  purchaseOrderId: idSchema,
  supplierId: idSchema,
  locationId: idSchema,
  supplierInvoiceNo: z.string().optional(),
  lines: z.array(
    z.object({
      skuId: idSchema,
      qty: quantitySchema.positive(),
      unitCost: moneySchema.nonnegative(),
      damagedQty: quantitySchema.nonnegative().default(0),
    }),
  ),
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type GoodsReceipt = z.infer<typeof goodsReceiptSchema>;

export const purchaseReturnSchema = z.object({
  id: idSchema,
  number: z.string(),
  goodsReceiptId: idSchema,
  supplierId: idSchema,
  locationId: idSchema,
  reasonCodeId: idSchema,
  lines: z.array(z.object({ skuId: idSchema, qty: quantitySchema.positive(), unitCost: moneySchema.nonnegative() })),
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type PurchaseReturn = z.infer<typeof purchaseReturnSchema>;
