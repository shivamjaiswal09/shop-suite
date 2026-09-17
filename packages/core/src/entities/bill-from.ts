import { z } from 'zod';
import { idSchema } from './common.ts';

/**
 * A legal entity a company issues bills as.
 *
 * Separate from the company itself because one business may bill under more
 * than one registration, and separate from the branch because the same entity
 * is usually billable from several of them.
 */
export const billFromSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  legalName: z.string().min(1),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  addressLine: z.string().optional(),
  email: z.string().optional(),
  /** A shop often publishes more than one number. Ordered as entered. */
  phones: z.array(z.string()).default([]),
  /** Branches allowed to bill under it. */
  locationIds: z.array(idSchema).default([]),
  active: z.boolean().default(true),
});
export type BillFrom = z.infer<typeof billFromSchema>;

/** What a bill records about the entity that issued it. Snapshot, not a join. */
export const billFromSnapshotSchema = z.object({
  id: idSchema.optional(),
  legalName: z.string().min(1),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  addressLine: z.string().optional(),
  email: z.string().optional(),
  phones: z.array(z.string()).default([]),
});
export type BillFromSnapshot = z.infer<typeof billFromSnapshotSchema>;

/**
 * The entities a given branch may bill under.
 *
 * Inactive ones are excluded here rather than by the caller, so a screen cannot
 * offer one by forgetting to filter.
 */
export const billFromFor = (entities: readonly BillFrom[], locationId: string | undefined): BillFrom[] =>
  locationId
    ? entities.filter((e) => e.active && e.locationIds.includes(locationId))
    : [];
