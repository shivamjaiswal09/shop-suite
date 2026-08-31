import { z } from 'zod';
import { idSchema, moneySchema, quantitySchema, timestampSchema } from './common.ts';

export const productSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  name: z.string().min(1),
  categoryId: idSchema,
  brand: z.string().optional(),
  description: z.string().optional(),
  active: z.boolean().default(true),
  createdAt: timestampSchema,
});
export type Product = z.infer<typeof productSchema>;

/** A sellable variant of a product. Stock is always tracked at SKU level. */
export const skuSchema = z.object({
  id: idSchema,
  productId: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  barcode: z.string().min(1),
  uomId: idSchema,
  taxId: idSchema,
  purchasePrice: moneySchema.nonnegative(),
  sellingPrice: moneySchema.nonnegative(),
  mrp: moneySchema.nonnegative().optional(),
  minStock: quantitySchema.nonnegative().default(0),
  reorderLevel: quantitySchema.nonnegative().default(0),
  active: z.boolean().default(true),
});
export type Sku = z.infer<typeof skuSchema>;
