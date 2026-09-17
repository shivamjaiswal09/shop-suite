import { z } from 'zod';
import { idSchema } from './common.ts';

/**
 * A brand, or one of its sub-brands.
 *
 * One shape for both: a sub-brand is a brand with a parent. Separate types
 * would duplicate every field to express a difference the data already carries.
 * Nesting is one level deep — the API refuses a parent that is itself a child.
 */
export const brandSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  name: z.string().min(1),
  /** Absent for a top-level brand. */
  parentId: idSchema.optional(),
  active: z.boolean().default(true),
});
export type Brand = z.infer<typeof brandSchema>;

/** Top-level brands, alphabetical. */
export const topLevelBrands = (brands: readonly Brand[]): Brand[] =>
  brands.filter((b) => !b.parentId).sort((a, b) => a.name.localeCompare(b.name));

/** The sub-brands of one brand. Empty for a brand that has none. */
export const subBrandsOf = (brands: readonly Brand[], brandId: string | undefined): Brand[] =>
  brandId
    ? brands.filter((b) => b.parentId === brandId).sort((a, b) => a.name.localeCompare(b.name))
    : [];
