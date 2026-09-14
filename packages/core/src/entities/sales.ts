import { z } from 'zod';
import { businessDateSchema, idSchema, moneySchema, quantitySchema, timestampSchema } from './common.ts';

/** A priced line, shared shape between cart / order / invoice. */
export const saleLineSchema = z.object({
  id: idSchema,
  skuId: idSchema,
  skuCode: z.string(),
  name: z.string(),
  qty: quantitySchema.positive(),
  unitPrice: moneySchema.nonnegative(),
  /** Absolute discount on the line, in currency. */
  discount: moneySchema.nonnegative().default(0),
  taxId: idSchema,
  taxRate: z.number().min(0).max(100),
  taxInclusive: z.boolean(),
  taxableValue: moneySchema,
  taxAmount: moneySchema,
  lineTotal: moneySchema,
});
export type SaleLine = z.infer<typeof saleLineSchema>;

export const saleTotalsSchema = z.object({
  subTotal: moneySchema,
  discountTotal: moneySchema,
  taxableValue: moneySchema,
  taxTotal: moneySchema,
  roundOff: moneySchema,
  grandTotal: moneySchema,
});
export type SaleTotals = z.infer<typeof saleTotalsSchema>;

export const orderStatusSchema = z.enum(['draft', 'confirmed', 'invoiced', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderSchema = z.object({
  id: idSchema,
  number: z.string(),
  /** The store both sells and holds the stock, so this is the stock location. */
  storeId: idSchema,
  customerId: idSchema.optional(),
  status: orderStatusSchema,
  lines: z.array(saleLineSchema),
  totals: saleTotalsSchema,
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type Order = z.infer<typeof orderSchema>;

export const invoiceStatusSchema = z.enum(['unpaid', 'partially_paid', 'paid', 'cancelled', 'returned']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceSchema = z.object({
  id: idSchema,
  number: z.string(),
  orderId: idSchema.optional(),
  /** The store both sells and holds the stock, so this is the stock location. */
  storeId: idSchema,
  counterId: idSchema,
  customerId: idSchema.optional(),
  customerName: z.string().optional(),
  /** Sale-scope bill-field answers, keyed by BillFieldConfig.key. */
  customerDetails: z.record(z.string()).optional(),
  businessDate: businessDateSchema,
  status: invoiceStatusSchema,
  lines: z.array(saleLineSchema),
  totals: saleTotalsSchema,
  amountPaid: moneySchema.default(0),
  amountDue: moneySchema.default(0),
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const salesReturnSchema = z.object({
  id: idSchema,
  number: z.string(),
  invoiceId: idSchema,
  /** The store both sells and holds the stock, so this is the stock location. */
  storeId: idSchema,
  reasonCodeId: idSchema,
  lines: z.array(z.object({ skuId: idSchema, qty: quantitySchema.positive(), refundAmount: moneySchema })),
  refundTotal: moneySchema,
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type SalesReturn = z.infer<typeof salesReturnSchema>;
