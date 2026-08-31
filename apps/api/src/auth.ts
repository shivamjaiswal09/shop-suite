import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './db.ts';

const COOKIE = process.env.SESSION_COOKIE ?? 'shop_sid';
const SESSION_DAYS = 7;

/**
 * A `secure` cookie is silently dropped over plain http, so localhost must not
 * set it — but every deployed request is https and must. NODE_ENV alone is a
 * fragile signal (it is easy to deploy with it unset), so we also take Vercel's
 * word for it: VERCEL=1 is present in every deployed runtime and never locally.
 */
const COOKIE_SECURE = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

/**
 * argon2id with OWASP-recommended parameters. Deliberately slow: the whole
 * point is that a stolen database is not a stolen password list.
 */
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, ARGON);

export const verifyPassword = (storedHash: string, plain: string) =>
  verify(storedHash, plain, ARGON);

/** Minimum we are willing to store. Enforced on every path that sets one. */
export const PASSWORD_MIN = 8;

export function assertPasswordAcceptable(plain: string): void {
  if (plain.length < PASSWORD_MIN) {
    throw new HttpError(400, `Password must be at least ${PASSWORD_MIN} characters`);
  }
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Principal {
  userId: string;
  /** Null for a super admin, who sits outside every company. */
  companyId: string | null;
  isSuperAdmin: boolean;
  permissions: string[];
  name: string;
  email: string;
}

export async function createSession(reply: FastifyReply, userId: string, userAgent?: string) {
  // Opaque and random — never derived from the user, so it leaks nothing.
  const id = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await prisma.session.create({ data: { id, userId, expiresAt, userAgent } });
  reply.setCookie(COOKIE, id, {
    httpOnly: true,
    // The SPA and /api are served from one origin in both environments, so no
    // request that needs this cookie is cross-site and 'lax' costs us nothing
    // while still keeping the cookie off cross-site form posts.
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply) {
  const id = request.cookies[COOKIE];
  if (id) await prisma.session.deleteMany({ where: { id } });
  reply.clearCookie(COOKIE, { path: '/' });
}

/** Resolves the caller from their session cookie, or null if unauthenticated. */
export async function principalFrom(request: FastifyRequest): Promise<Principal | null> {
  const id = request.cookies[COOKIE];
  if (!id) return null;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { include: { role: true, company: true } } },
  });
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }

  const { user } = session;
  // A deactivated user, or one whose company was deactivated, is not a caller.
  if (!user.active) return null;
  if (user.company && !user.company.active) return null;

  return {
    userId: user.id,
    companyId: user.companyId,
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.isSuperAdmin ? ['*'] : (user.role?.permissions ?? []),
    name: user.name,
    email: user.email,
  };
}

export function requireAuth(principal: Principal | null): Principal {
  if (!principal) throw new HttpError(401, 'Not signed in');
  return principal;
}

export function requireSuperAdmin(principal: Principal | null): Principal {
  const caller = requireAuth(principal);
  if (!caller.isSuperAdmin) throw new HttpError(403, 'Super admin only');
  return caller;
}

/**
 * The tenancy guard. Returns the company the caller is acting on and proves
 * they may. A super admin must name the company explicitly; everyone else is
 * pinned to their own and cannot ask for another.
 */
export function requireCompany(principal: Principal | null, requested?: string): {
  caller: Principal;
  companyId: string;
} {
  const caller = requireAuth(principal);

  if (caller.isSuperAdmin) {
    if (!requested) throw new HttpError(400, 'companyId is required for a super admin');
    return { caller, companyId: requested };
  }

  if (!caller.companyId) throw new HttpError(403, 'User belongs to no company');
  if (requested && requested !== caller.companyId) {
    throw new HttpError(403, 'Cross-company access is not permitted');
  }
  return { caller, companyId: caller.companyId };
}

export function requirePermission(principal: Principal | null, permission: string): Principal {
  const caller = requireAuth(principal);
  if (caller.isSuperAdmin) return caller;
  if (!caller.permissions.includes(permission)) {
    throw new HttpError(403, `Missing permission: ${permission}`);
  }
  return caller;
}
