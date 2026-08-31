import { z } from 'zod';
import { idSchema } from './common.ts';

export const unitOfMeasureSchema = z.object({
  id: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  /** Decimals allowed when transacting, e.g. 0 for `pcs`, 3 for `kg`. */
  precision: z.number().int().min(0).max(3).default(0),
  active: z.boolean().default(true),
});
export type UnitOfMeasure = z.infer<typeof unitOfMeasureSchema>;

export const taxSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  /** Percentage, e.g. 18 for GST 18%. */
  rate: z.number().min(0).max(100),
  /** When true, sellingPrice already contains this tax. */
  inclusive: z.boolean().default(false),
  hsnCode: z.string().optional(),
  active: z.boolean().default(true),
});
export type Tax = z.infer<typeof taxSchema>;

export const customerSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  gstin: z.string().optional(),
  addressLine: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  active: z.boolean().default(true),
});
export type Customer = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  gstin: z.string().optional(),
  paymentTermsDays: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const paymentMethodKindSchema = z.enum(['cash', 'card', 'upi', 'wallet', 'credit', 'bank_transfer']);
export type PaymentMethodKind = z.infer<typeof paymentMethodKindSchema>;

export const paymentMethodSchema = z.object({
  id: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  kind: paymentMethodKindSchema,
  /** Counted in the physical cash drawer at day-end. */
  countedInDrawer: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const reasonCodeUsageSchema = z.enum(['cancellation', 'return', 'adjustment', 'damage', 'discrepancy']);
export type ReasonCodeUsage = z.infer<typeof reasonCodeUsageSchema>;

export const reasonCodeSchema = z.object({
  id: idSchema,
  usage: reasonCodeUsageSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean().default(true),
});
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
