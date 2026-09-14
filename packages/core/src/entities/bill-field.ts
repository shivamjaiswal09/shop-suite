import { z } from 'zod';
import { idSchema } from './common.ts';

/**
 * Where a captured value belongs.
 *
 * `customer` outlives the sale: a phone number identifies the person and should
 * find them again next visit. `sale` describes one bill: the same customer
 * brings a different vehicle next month, and a bill from March has to keep
 * saying which vehicle it was for.
 */
export const billFieldScopeSchema = z.enum(['customer', 'sale']);
export type BillFieldScope = z.infer<typeof billFieldScopeSchema>;

export const billFieldTypeSchema = z.enum(['text', 'number', 'phone']);
export type BillFieldType = z.infer<typeof billFieldTypeSchema>;

export const billFieldConfigSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  /**
   * The `Customer` column this field drives, named exactly — so the mapping
   * needs no lookup table. Null for a field the company invented.
   */
  builtin: z.enum(['name', 'phone', 'email', 'gstin', 'addressLine']).nullable(),
  /** Stable. Invoices store answers against it, so it is never re-keyed. */
  key: z.string().min(1),
  label: z.string().min(1),
  scope: billFieldScopeSchema,
  type: billFieldTypeSchema.default('text'),
  required: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type BillFieldConfig = z.infer<typeof billFieldConfigSchema>;

export interface BuiltinField {
  builtin: NonNullable<BillFieldConfig['builtin']>;
  key: string;
  label: string;
  scope: BillFieldScope;
  type: BillFieldType;
}

/**
 * The fields that already exist as indexed columns on `Customer`. They are
 * offered as a checklist rather than reinvented, because `phone` is uniquely
 * indexed per company and is how a counter finds a returning customer.
 */
export const BUILTIN_FIELDS: readonly BuiltinField[] = [
  { builtin: 'name', key: 'name', label: 'Name', scope: 'customer', type: 'text' },
  { builtin: 'phone', key: 'phone', label: 'Phone', scope: 'customer', type: 'phone' },
  { builtin: 'email', key: 'email', label: 'Email', scope: 'customer', type: 'text' },
  { builtin: 'gstin', key: 'gstin', label: 'GSTIN', scope: 'customer', type: 'text' },
  { builtin: 'addressLine', key: 'addressLine', label: 'Address', scope: 'customer', type: 'text' },
] as const;
