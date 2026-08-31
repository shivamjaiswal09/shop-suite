import { z } from 'zod';
import { businessDateSchema, idSchema, moneySchema, timestampSchema } from './common.ts';

export const salesByMethodSchema = z.object({
  paymentMethodId: idSchema,
  paymentMethodName: z.string(),
  kind: z.string(),
  countedInDrawer: z.boolean(),
  txnCount: z.number().int().nonnegative(),
  amount: moneySchema,
});
export type SalesByMethod = z.infer<typeof salesByMethodSchema>;

export const closingStatusSchema = z.enum(['open', 'submitted', 'approved', 'rejected']);
export type ClosingStatus = z.infer<typeof closingStatusSchema>;

/**
 * Day-end closing per counter. Locks the business day once approved:
 * no further invoices or payments may be dated into it.
 */
export const dayEndClosingSchema = z.object({
  id: idSchema,
  storeId: idSchema,
  counterId: idSchema,
  businessDate: businessDateSchema,
  openingCash: moneySchema.nonnegative(),
  salesByMethod: z.array(salesByMethodSchema),
  /** Sum of drawer-counted methods + opening cash. */
  expectedCash: moneySchema,
  physicalCash: moneySchema.nonnegative(),
  /** physicalCash − expectedCash. Negative = short, positive = excess. */
  variance: moneySchema,
  depositedAmount: moneySchema.nonnegative().default(0),
  carriedForward: moneySchema.nonnegative().default(0),
  note: z.string().optional(),
  status: closingStatusSchema,
  submittedBy: idSchema.optional(),
  submittedAt: timestampSchema.optional(),
  approvedBy: idSchema.optional(),
  approvedAt: timestampSchema.optional(),
});
export type DayEndClosing = z.infer<typeof dayEndClosingSchema>;
