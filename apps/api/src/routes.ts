import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  assertLoginAllowed,
  assertPasswordAcceptable,
  clearLoginFailures,
  createSession,
  currentSessionId,
  destroySession,
  purgeExpired,
  recordFailedLogin,
  hashPassword,
  HttpError,
  principalFrom,
  requireCompany,
  requirePermission,
  requireSuperAdmin,
  verifyPassword,
  type Principal,
} from './auth.ts';
import { prisma } from './db.ts';

/** Permissions a freshly created company's Admin role gets. */
const ADMIN_PERMISSIONS = [
  'sales.bill',
  // Deliberately separate from `sales.bill`. Typing a price over the one the
  // catalogue says is how a till gets robbed: ring the item at zero, take the
  // cash, and the books balance. A cashier bills; a supervisor discounts.
  'sales.override_price',
  'sales.refund',
  'inventory.view',
  'inventory.adjust',
  'purchase.manage',
  'closing.perform',
  'closing.approve',
  'admin.manage',
];

const DEFAULT_ROLES = [
  { name: 'Admin', permissions: ADMIN_PERMISSIONS },
  { name: 'Manager', permissions: ADMIN_PERMISSIONS.filter((p) => p !== 'admin.manage') },
  { name: 'Cashier', permissions: ['sales.bill', 'inventory.view', 'closing.perform'] },
];

const audit = (data: {
  companyId?: string | null;
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
}) => prisma.auditEntry.create({ data });

/**
 * Projects a user row for the wire. Explicitly picks fields rather than
 * spreading, so a column added to the schema later — a password hash, a reset
 * token — cannot leak by default.
 */
type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  companyId: string | null;
  roleId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const publicUser = (user: UserRow, access?: { locationId: string }[]) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  active: user.active,
  isSuperAdmin: user.isSuperAdmin,
  mustChangePassword: user.mustChangePassword,
  companyId: user.companyId,
  roleId: user.roleId,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  // Always arrays, never undefined: an empty list means "every location in the
  // company", which is a meaningful answer. Absent is not.
  storeIds: user.companyId ? (access ?? []).map((a) => a.locationId) : [],
  locationIds: (access ?? []).map((a) => a.locationId),
});

export async function registerRoutes(app: FastifyInstance) {
  // Every handler resolves the caller once, up front.
  app.decorateRequest('principal', null);
  app.addHook('preHandler', async (request) => {
    (request as { principal?: Principal | null }).principal = await principalFrom(request);
  });

  const who = (request: unknown) => (request as { principal: Principal | null }).principal;

  /* ----------------------------------------------------------------- auth */

  app.post('/auth/login', async (request, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(request.body);

    const email = body.email.trim().toLowerCase();
    // Before the lookup and before argon2: an attempt that is already over the
    // limit must cost us nothing to refuse.
    await assertLoginAllowed(request, email);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true, access: true },
    });

    // One message for both branches: revealing which emails exist is a gift
    // to anyone enumerating accounts.
    const invalid = new HttpError(401, 'Email or password is incorrect');
    if (!user || !user.active) {
      await recordFailedLogin(request, email);
      throw invalid;
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      await recordFailedLogin(request, email);
      throw invalid;
    }
    if (user.company && !user.company.active) throw new HttpError(403, 'This company is deactivated');

    await createSession(reply, user.id, request.headers['user-agent']);
    await Promise.all([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      clearLoginFailures(email),
    ]);
    purgeExpired();

    return { user: publicUser(user, user.access), company: user.company };
  });

  app.post('/auth/logout', async (request, reply) => {
    await destroySession(request, reply);
    return { ok: true };
  });

  app.get('/auth/me', async (request) => {
    const caller = who(request);
    if (!caller) return { user: null };

    const user = await prisma.user.findUnique({
      where: { id: caller.userId },
      include: { company: true, role: true, access: true },
    });
    if (!user) return { user: null };

    return {
      user: publicUser(user, user.access),
      company: user.company,
      role: user.role,
      permissions: caller.permissions,
      locationIds: user.access.map((a) => a.locationId),
    };
  });

  /** Changing your own password. Requires the current one. */
  app.post('/auth/change-password', async (request) => {
    const caller = who(request);
    if (!caller) throw new HttpError(401, 'Not signed in');
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) })
      .parse(request.body);

    assertPasswordAcceptable(body.newPassword);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: caller.userId } });
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw new HttpError(400, 'Current password is incorrect');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false },
    });
    // Every other session for this user dies with the old password — but not
    // the one doing the changing. Logging someone out for choosing a stronger
    // password teaches them not to bother.
    const keep = currentSessionId(request);
    await prisma.session.deleteMany({
      where: { userId: user.id, ...(keep ? { NOT: { id: keep } } : {}) },
    });
    await audit({
      companyId: user.companyId,
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      action: 'update',
      summary: 'Changed own password',
    });
    return { ok: true };
  });

  /* ------------------------------------------------------- companies (SA) */

  app.get('/companies', async (request) => {
    requireSuperAdmin(who(request));
    return prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, locations: true } } },
    });
  });

  /**
   * Creating a company and its first admin is one transaction: a company with
   * no way in is not a useful outcome to leave behind on a partial failure.
   */
  app.post('/companies', async (request, reply) => {
    const caller = requireSuperAdmin(who(request));
    const body = z
      .object({
        name: z.string().min(1),
        legalName: z.string().min(1),
        gstin: z.string().optional(),
        admin: z.object({
          name: z.string().min(1),
          email: z.string().email(),
          phone: z.string().optional(),
          password: z.string().min(1),
        }),
      })
      .parse(request.body);

    assertPasswordAcceptable(body.admin.password);
    const email = body.admin.email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, `A user with ${email} already exists`);
    }

    const passwordHash = await hashPassword(body.admin.password);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: body.name, legalName: body.legalName, gstin: body.gstin },
      });
      await tx.role.createMany({
        data: DEFAULT_ROLES.map((role) => ({ ...role, companyId: company.id, system: true })),
      });
      const adminRole = await tx.role.findFirstOrThrow({
        where: { companyId: company.id, name: 'Admin' },
      });
      const admin = await tx.user.create({
        data: {
          companyId: company.id,
          roleId: adminRole.id,
          name: body.admin.name,
          email,
          phone: body.admin.phone,
          passwordHash,
          createdById: caller.userId,
        },
      });
      return { company, admin };
    });

    await audit({
      companyId: result.company.id,
      actorId: caller.userId,
      entity: 'company',
      entityId: result.company.id,
      action: 'create',
      summary: `Company ${result.company.name} created with admin ${result.admin.email}`,
    });

    reply.code(201);
    return { company: result.company, admin: publicUser(result.admin, []) };
  });

  app.patch('/companies/:id', async (request) => {
    const caller = requireSuperAdmin(who(request));
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const patch = z
      .object({
        name: z.string().min(1).optional(),
        legalName: z.string().min(1).optional(),
        gstin: z.string().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const company = await prisma.company.update({ where: { id }, data: patch });
    // Deactivating a company must not leave its people signed in.
    if (patch.active === false) {
      await prisma.session.deleteMany({ where: { user: { companyId: id } } });
    }
    await audit({
      companyId: id,
      actorId: caller.userId,
      entity: 'company',
      entityId: id,
      action: 'update',
      summary: `Company ${company.name} updated`,
    });
    return company;
  });

  /** The caller's own company. Derived from the session, never from a param. */
  app.get('/company', async (request) => {
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(who(request), query.companyId);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new HttpError(404, 'Company not found');
    return company;
  });

  /** Moves the primary flag within a store rather than adding a second one. */
  app.post('/links/:id/primary', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const link = await prisma.storeWarehouseLink.findUnique({ where: { id } });
    if (!link) throw new HttpError(404, 'Link not found');
    const { caller, companyId } = requireCompany(who(request), link.companyId);
    requirePermission(caller, 'admin.manage');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.storeWarehouseLink.updateMany({
        where: { storeId: link.storeId },
        data: { isPrimary: false },
      });
      return tx.storeWarehouseLink.update({ where: { id }, data: { isPrimary: true } });
    });

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'store_warehouse_link',
      entityId: id,
      action: 'update',
      summary: 'Primary supply source changed',
    });
    return updated;
  });

  /**
   * Hard-deletes a company and everything under it — every location, user,
   * invoice and ledger row, by cascade.
   *
   * This is destructive in a way deactivation is not: it removes the audit
   * trail, which a retailer may be legally required to retain. The caller must
   * echo the company name back, so it cannot happen from a mis-click.
   */
  app.delete('/companies/:id', async (request) => {
    const caller = requireSuperAdmin(who(request));
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ confirmName: z.string() }).parse(request.body);

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) throw new HttpError(404, 'Company not found');
    if (body.confirmName !== company.name) {
      throw new HttpError(400, 'Type the company name exactly to confirm deletion');
    }

    const counts = await prisma.$transaction([
      prisma.user.count({ where: { companyId: id } }),
      prisma.stockMovement.count({ where: { companyId: id } }),
      prisma.invoice.count({ where: { companyId: id } }),
    ]);

    await prisma.company.delete({ where: { id } });
    // Audit rows survive on purpose: the record that a company was destroyed
    // must outlive the company, or the deletion itself leaves no trace.
    await audit({
      companyId: null,
      actorId: caller.userId,
      entity: 'company',
      entityId: id,
      action: 'delete',
      summary:
        `Company ${company.name} deleted with ${counts[0]} user(s), ` +
        `${counts[1]} stock movement(s), ${counts[2]} invoice(s)`,
    });
    return { ok: true, deleted: { users: counts[0], movements: counts[1], invoices: counts[2] } };
  });

  /**
   * Removes a user outright. Prefer deactivating: a deleted user's name can no
   * longer be resolved on the invoices and ledger rows they created, which
   * leaves the audit trail readable but anonymous.
   */
  app.delete('/users/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'User not found');

    const { caller } = requireCompany(who(request), target.companyId ?? undefined);
    requirePermission(caller, 'admin.manage');

    if (target.id === caller.userId) throw new HttpError(400, 'You cannot delete your own account');
    if (target.isSuperAdmin && !caller.isSuperAdmin) {
      throw new HttpError(403, 'Only a super admin may remove a super admin');
    }

    await prisma.user.delete({ where: { id } });
    await audit({
      companyId: target.companyId,
      actorId: caller.userId,
      entity: 'user',
      entityId: id,
      action: 'delete',
      summary: `User ${target.email} deleted`,
    });
    return { ok: true };
  });

  /* ----------------------------------------------------------------- roles */

  app.get('/roles', async (request) => {
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(who(request), query.companyId);
    return prisma.role.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  });

  /* ----------------------------------------------------------------- users */

  app.get('/users', async (request) => {
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(who(request), query.companyId);
    const users = await prisma.user.findMany({
      where: { companyId },
      include: { role: true, access: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => ({
      ...publicUser(user, user.access),
      role: user.role,
      locationIds: user.access.map((a) => a.locationId),
    }));
  });

  app.post('/users', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        roleId: z.string(),
        password: z.string().min(1),
        locationIds: z.array(z.string()).default([]),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(who(request), body.companyId);
    requirePermission(caller, 'admin.manage');
    assertPasswordAcceptable(body.password);

    const email = body.email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, `A user with ${email} already exists`);
    }

    // The role and every granted location must belong to the same company —
    // otherwise an admin could hand out access outside their tenant.
    const role = await prisma.role.findFirst({ where: { id: body.roleId, companyId } });
    if (!role) throw new HttpError(400, 'Unknown role for this company');
    await assertLocationsInCompany(body.locationIds, companyId);

    const user = await prisma.user.create({
      data: {
        companyId,
        roleId: role.id,
        name: body.name,
        email,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
        createdById: caller.userId,
        access: { create: body.locationIds.map((locationId) => ({ locationId })) },
      },
      include: { role: true, access: true },
    });

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'user',
      entityId: user.id,
      action: 'create',
      summary: `User ${user.email} created as ${role.name}`,
    });

    reply.code(201);
    return { ...publicUser(user, user.access), role: user.role };
  });

  app.patch('/users/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        roleId: z.string().optional(),
        active: z.boolean().optional(),
        locationIds: z.array(z.string()).optional(),
      })
      .parse(request.body);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'User not found');
    const { caller, companyId } = requireCompany(who(request), target.companyId ?? undefined);
    requirePermission(caller, 'admin.manage');
    if (target.isSuperAdmin) throw new HttpError(403, 'A super admin cannot be edited here');

    if (body.roleId) {
      const role = await prisma.role.findFirst({ where: { id: body.roleId, companyId } });
      if (!role) throw new HttpError(400, 'Unknown role for this company');
    }
    if (body.locationIds) await assertLocationsInCompany(body.locationIds, companyId);

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        phone: body.phone,
        roleId: body.roleId,
        active: body.active,
        ...(body.locationIds
          ? {
              access: {
                deleteMany: {},
                create: body.locationIds.map((locationId) => ({ locationId })),
              },
            }
          : {}),
      },
      include: { role: true, access: true },
    });

    // A deactivated user should stop being able to act immediately.
    if (body.active === false) await prisma.session.deleteMany({ where: { userId: id } });

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'user',
      entityId: id,
      action: 'update',
      summary: `User ${user.email} updated`,
    });
    return { ...publicUser(user, user.access), role: user.role };
  });

  /** An admin setting someone else's password. No current password needed. */
  app.post('/users/:id/password', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ password: z.string().min(1) }).parse(request.body);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'User not found');
    const { caller, companyId } = requireCompany(who(request), target.companyId ?? undefined);
    requirePermission(caller, 'admin.manage');
    if (target.isSuperAdmin) throw new HttpError(403, 'A super admin cannot be edited here');
    assertPasswordAcceptable(body.password);

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(body.password) },
    });
    // Force them back through the door with the new credential.
    await prisma.session.deleteMany({ where: { userId: id } });

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'user',
      entityId: id,
      action: 'update',
      summary: `Password reset for ${target.email}`,
    });
    return { ok: true };
  });

  /* ------------------------------------------------------------- locations */

  app.get('/locations', async (request) => {
    const query = z
      .object({ companyId: z.string().optional(), includeInactive: z.coerce.boolean().optional() })
      .parse(request.query);
    const { companyId } = requireCompany(who(request), query.companyId);
    return prisma.stockLocation.findMany({
      where: { companyId, ...(query.includeInactive ? {} : { active: true }) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  });

  app.post('/locations', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        kind: z.enum(['store', 'warehouse']),
        code: z.string().min(1),
        name: z.string().min(1),
        city: z.string().optional(),
        phone: z.string().optional(),
        gstin: z.string().optional(),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(who(request), body.companyId);
    requirePermission(caller, 'admin.manage');

    const code = body.code.trim().toUpperCase();
    if (await prisma.stockLocation.findFirst({ where: { companyId, code } })) {
      throw new HttpError(409, `Location code ${code} already exists`);
    }

    const location = await prisma.stockLocation.create({
      data: { ...body, companyId, code },
    });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'stock_location',
      entityId: location.id,
      action: 'create',
      summary: `${body.kind === 'store' ? 'Store' : 'Warehouse'} ${location.name} created`,
    });
    reply.code(201);
    return location;
  });

  app.patch('/locations/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        city: z.string().optional(),
        phone: z.string().optional(),
        gstin: z.string().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.stockLocation.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Location not found');
    const { caller, companyId } = requireCompany(who(request), existing.companyId);
    requirePermission(caller, 'admin.manage');

    if (body.code) {
      const code = body.code.trim().toUpperCase();
      const clash = await prisma.stockLocation.findFirst({
        where: { companyId, code, NOT: { id } },
      });
      if (clash) throw new HttpError(409, `Location code ${code} already exists`);
      body.code = code;
    }

    const location = await prisma.stockLocation.update({ where: { id }, data: body });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'stock_location',
      entityId: id,
      action: 'update',
      summary: `Location ${location.name} updated`,
    });
    return location;
  });

  /* ----------------------------------------------------------- supply links */

  app.get('/links', async (request) => {
    const query = z.object({ companyId: z.string().optional() }).parse(request.query);
    const { companyId } = requireCompany(who(request), query.companyId);
    return prisma.storeWarehouseLink.findMany({ where: { companyId } });
  });

  app.post('/links', async (request, reply) => {
    const body = z
      .object({
        companyId: z.string().optional(),
        storeId: z.string(),
        warehouseId: z.string(),
        isPrimary: z.boolean().default(false),
      })
      .parse(request.body);

    const { caller, companyId } = requireCompany(who(request), body.companyId);
    requirePermission(caller, 'admin.manage');

    const [store, warehouse] = await Promise.all([
      prisma.stockLocation.findFirst({ where: { id: body.storeId, companyId, kind: 'store' } }),
      prisma.stockLocation.findFirst({
        where: { id: body.warehouseId, companyId, kind: 'warehouse' },
      }),
    ]);
    if (!store) throw new HttpError(400, 'Link source must be a store in this company');
    if (!warehouse) throw new HttpError(400, 'Link target must be a warehouse in this company');

    const link = await prisma.$transaction(async (tx) => {
      if (body.isPrimary) {
        await tx.storeWarehouseLink.updateMany({
          where: { storeId: body.storeId },
          data: { isPrimary: false },
        });
      }
      return tx.storeWarehouseLink.create({
        data: { companyId, storeId: body.storeId, warehouseId: body.warehouseId, isPrimary: body.isPrimary },
      });
    });

    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'store_warehouse_link',
      entityId: link.id,
      action: 'create',
      summary: `${warehouse.name} now supplies ${store.name}`,
    });
    reply.code(201);
    return link;
  });

  app.delete('/links/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const link = await prisma.storeWarehouseLink.findUnique({ where: { id } });
    if (!link) throw new HttpError(404, 'Link not found');
    const { caller, companyId } = requireCompany(who(request), link.companyId);
    requirePermission(caller, 'admin.manage');

    await prisma.storeWarehouseLink.delete({ where: { id } });
    await audit({
      companyId,
      actorId: caller.userId,
      entity: 'store_warehouse_link',
      entityId: id,
      action: 'delete',
      summary: 'Supply link removed',
    });
    return { ok: true };
  });

  /* ----------------------------------------------------------------- audit */

  app.get('/audit', async (request) => {
    const query = z
      .object({ companyId: z.string().optional(), limit: z.coerce.number().max(200).default(50) })
      .parse(request.query);
    const { companyId } = requireCompany(who(request), query.companyId);
    return prisma.auditEntry.findMany({
      where: { companyId },
      orderBy: { at: 'desc' },
      take: query.limit,
    });
  });
}

async function assertLocationsInCompany(locationIds: string[], companyId: string) {
  if (locationIds.length === 0) return;
  const found = await prisma.stockLocation.count({
    where: { id: { in: locationIds }, companyId },
  });
  if (found !== locationIds.length) {
    throw new HttpError(400, 'One or more locations do not belong to this company');
  }
}
