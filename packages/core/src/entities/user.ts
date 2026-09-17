import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';

/**
 * What a role may *do*. These are verbs, not places: each one guards an action
 * that changes money or stock, and each is checked by the API independently of
 * any screen the action is reached from.
 *
 * Unchanged since roles became editable — every one of these strings is live in
 * a `requirePermission` call, so renaming one is a data migration, not a
 * refactor.
 */
export const actionPermissionSchema = z.enum([
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
export type ActionPermission = z.infer<typeof actionPermissionSchema>;

/**
 * What a role may *see*. One key per navigable screen, which is what lets an
 * admin hide Warehouse Stock while leaving Store Stock visible — `inventory.view`
 * alone could never express that, since it covers four screens at once.
 *
 * These are not cosmetic. The API checks the same key on the routes that serve
 * a single screen, because a hidden link is not a closed door: without the
 * server-side half, a removed menu entry is still reachable by typing its URL.
 *
 * Keys are derived from NAV_TREE and must stay in step with it — `navScreens()`
 * in `../nav.ts` asserts that at module load, so a screen added without a key
 * (or a key with no screen) fails the build rather than silently granting
 * nothing.
 */
export const screenPermissionSchema = z.enum([
  'view.home',

  'view.sales.billing',
  'view.sales.orders',
  'view.sales.invoices',
  'view.sales.returns',

  'view.inventory.stores',
  'view.inventory.warehouses',
  'view.inventory.all',
  'view.inventory.transfers',
  'view.inventory.replenishment',
  'view.inventory.movements',

  'view.purchases',

  'view.closing.dayend',
  'view.closing.reconciliation',

  'view.onboarding.locations',
  'view.onboarding.products',
  'view.onboarding.users',
  'view.onboarding.masters',

  'view.admin',
]);
export type ScreenPermission = z.infer<typeof screenPermissionSchema>;

/**
 * Both tiers in one type, because a role holds one flat list and every consumer
 * — the session, the API's principal, both apps' hooks — asks the same question
 * of it: is this string in the set?
 */
export const permissionSchema = z.union([actionPermissionSchema, screenPermissionSchema]);
export type Permission = z.infer<typeof permissionSchema>;

export const ACTION_PERMISSIONS = actionPermissionSchema.options;
export const SCREEN_PERMISSIONS = screenPermissionSchema.options;

export const isScreenPermission = (p: string): p is ScreenPermission =>
  screenPermissionSchema.safeParse(p).success;

export const isActionPermission = (p: string): p is ActionPermission =>
  actionPermissionSchema.safeParse(p).success;

export const roleSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  name: z.string().min(1),
  permissions: z.array(permissionSchema),
  /**
   * Seeded roles, which may not be edited or deleted. A company must keep a
   * working Admin however badly its own roles are configured — see
   * `resolveSignInLanding`, which documents why a company with no admin cannot
   * be repaired from any screen. Duplicate one to start a custom role.
   */
  system: z.boolean().default(false),
});
export type Role = z.infer<typeof roleSchema>;

export const newRoleSchema = z.object({
  name: z.string().min(1).max(60),
  permissions: z.array(permissionSchema),
});
export type NewRole = z.infer<typeof newRoleSchema>;

export const rolePatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  permissions: z.array(permissionSchema).optional(),
});
export type RolePatch = z.infer<typeof rolePatchSchema>;

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
