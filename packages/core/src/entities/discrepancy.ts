import { z } from 'zod';
import { businessDateSchema, idSchema, moneySchema, timestampSchema } from './common.ts';

export const discrepancyKindSchema = z.enum(['payment', 'sales', 'stock', 'cash']);
export type DiscrepancyKind = z.infer<typeof discrepancyKindSchema>;

export const discrepancySchema = z.object({
  id: idSchema,
  kind: discrepancyKindSchema,
  /** Where it arose: a store for cash, any location for stock. */
  locationId: idSchema,
  businessDate: businessDateSchema,
  refType: z.string(),
  refId: idSchema,
  expected: moneySchema,
  actual: moneySchema,
  variance: moneySchema,
  reasonCodeId: idSchema.optional(),
  note: z.string().optional(),
  status: z.enum(['open', 'investigating', 'resolved', 'written_off']),
  raisedBy: idSchema,
  raisedAt: timestampSchema,
  resolvedBy: idSchema.optional(),
  resolvedAt: timestampSchema.optional(),
});
export type Discrepancy = z.infer<typeof discrepancySchema>;
