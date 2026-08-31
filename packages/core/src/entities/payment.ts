import { z } from 'zod';
import { businessDateSchema, idSchema, moneySchema, timestampSchema } from './common.ts';

export const paymentStatusSchema = z.enum(['success', 'pending', 'failed', 'refunded']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * One row per tender. A split payment is simply several rows against the same
 * invoice. `idempotencyKey` is required from day one so a retried capture can
 * never double-charge. Refunds are the same row with a negative amount, which
 * is what lets the cash drawer and sales-by-method figures net out on their own.
 */
export const paymentSchema = z.object({
  id: idSchema,
  invoiceId: idSchema,
  storeId: idSchema,
  counterId: idSchema,
  businessDate: businessDateSchema,
  paymentMethodId: idSchema,
  /** Positive for a capture, negative for a refund — so day-end nets correctly. */
  amount: moneySchema.refine((v) => v !== 0, 'Amount must not be zero'),
  reference: z.string().optional(),
  status: paymentStatusSchema,
  idempotencyKey: z.string().min(1),
  createdBy: idSchema,
  createdAt: timestampSchema,
});
export type Payment = z.infer<typeof paymentSchema>;
