import { z } from 'zod';
import { idSchema, moneySchema, quantitySchema, timestampSchema } from './common.ts';

export const productSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  name: z.string().min(1),
  categoryId: idSchema,
  brandId: idSchema.optional(),
  subBrandId: idSchema.optional(),
  /**
   * Composed by the API from the master — "Ceat · Milaze X5". Read-only: the
   * ids above are what a write sets.
   */
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
  /**
   * Always present, though the form may not ask for it: a blank name falls
   * back to the parent product's. It is copied onto every invoice line, so an
   * empty one would print a blank column on a customer's bill.
   */
  name: z.string().min(1),
  /** Absent for anything unbranded or loose — never an empty string. */
  barcode: z.string().min(1).nullable(),
  /** Commodity code for GST. Defaults from the tax, but overridable per SKU. */
  hsnCode: z.string().min(1).nullable().optional(),
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
