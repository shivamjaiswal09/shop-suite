import { z } from 'zod';
import { idSchema } from './common.ts';

/**
 * A real master rather than a string on the product, because categories drive
 * behaviour: the default tax a new SKU inherits, the order they merchandise in,
 * and whatever gets hung off them next. A free-text field could do none of that
 * — `Dairy`, `dairy` and `Dairy ` were three different categories.
 */
export const categorySchema = z.object({
  id: idSchema,
  companyId: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  /** Merchandising order — low numbers first, ties broken by name. */
  sortOrder: z.number().int().default(0),
  /**
   * Tax a new SKU in this category starts on. In Indian retail the rate is
   * effectively decided by category, so this is the first real feature the
   * master earns: staples at 0–5%, packaged snacks at 18%.
   */
  defaultTaxId: idSchema.optional(),
  description: z.string().optional(),
  active: z.boolean().default(true),
});
export type Category = z.infer<typeof categorySchema>;

/** Sort for display: explicit order first, then alphabetical. */
export const byCategoryOrder = (a: Category, b: Category): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
