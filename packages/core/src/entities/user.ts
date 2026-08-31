import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';

export const permissionSchema = z.enum([
  'sales.bill',
  /**
   * Typing a price over the catalogue's. Separate from `sales.bill` because
   * ringing an item through at zero is how a till gets robbed, and the two are
   * different jobs: a cashier bills, a supervisor discounts.
   */
  'sales.override_price',
  'sales.refund',
  'inventory.view',
  'inventory.adjust',
  'purchase.manage',
  'closing.perform',
  'closing.approve',
  'admin.manage',
]);
export type Permission = z.infer<typeof permissionSchema>;

export const roleSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  name: z.string().min(1),
  permissions: z.array(permissionSchema),
  system: z.boolean().default(false),
});
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: idSchema,
  /** Null for a super admin, who belongs to no company. */
  companyId: idSchema.nullable().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  roleId: idSchema,
  /** Empty array = access to every branch of the company. */
  storeIds: z.array(idSchema),
  locationIds: z.array(idSchema),
  active: z.boolean().default(true),
  /** Sits outside every company; the only principal that may act across them. */
  isSuperAdmin: z.boolean().default(false),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

/** What the session store holds after a (mock) login. */
export const sessionSchema = z.object({
  userId: idSchema,
  companyId: idSchema,
  storeId: idSchema,
  locationId: idSchema,
  loginAt: timestampSchema,
});
export type Session = z.infer<typeof sessionSchema>;
