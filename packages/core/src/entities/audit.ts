import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';

/** Append-only. Every mutating repository call writes one of these. */
export const auditLogSchema = z.object({
  id: idSchema,
  entity: z.string().min(1),
  entityId: idSchema,
  action: z.enum(['create', 'update', 'delete', 'approve', 'cancel']),
  summary: z.string(),
  actorId: idSchema,
  locationId: idSchema.optional(),
  at: timestampSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;
