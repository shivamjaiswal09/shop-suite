import { hash, verify } from '@node-rs/argon2';
import { normalizeRolePermissions } from '@shop/core';
import { createHash, randomBytes } from 'node:crypto';
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

/**
 * The database stores the hash of a session token, never the token itself.
 *
 * The cookie value is a bearer credential: whoever holds it is the user, with
 * no second factor to stop them. Stored raw, the sessions table is a list of
 * live logins that a leaked backup, a support engineer with console access, or
 * one future SQL injection converts straight into account takeover — no
 * password needed. Storing the digest makes the table useless to a reader.
 *
 * A plain SHA-256 is the right primitive here, not argon2: the input is already
 * 256 bits of CSPRNG output, so there is no guessable secret to slow an attacker
 * down over, and this runs on every single authenticated request.
 */
const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(reply: FastifyReply, userId: string, userAgent?: string) {
  // Opaque and random — never derived from the user, so it leaks nothing.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  // Snapshot the permissions the user signs in with. Read once here rather than
  // on every request, which is also one fewer join per authenticated call.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  await prisma.session.create({
    data: {
      id: tokenDigest(token),
      userId,
      expiresAt,
      userAgent,
      permissions: normalizeRolePermissions(user?.role?.permissions ?? []),
    },
  });
  reply.setCookie(COOKIE, token, {
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
  const token = request.cookies[COOKIE];
  if (token) await prisma.session.deleteMany({ where: { id: tokenDigest(token) } });
  reply.clearCookie(COOKIE, { path: '/' });
}

/** The stored id for the caller's current session, used to spare it from a purge. */
export const currentSessionId = (request: FastifyRequest): string | undefined => {
  const token = request.cookies[COOKIE];
  return token ? tokenDigest(token) : undefined;
};

/** Resolves the caller from their session cookie, or null if unauthenticated. */
export async function principalFrom(request: FastifyRequest): Promise<Principal | null> {
  const token = request.cookies[COOKIE];
  if (!token) return null;
  const id = tokenDigest(token);

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

  // Answered from the snapshot taken at sign-in, not from the role as it stands
  // now: a role edited mid-shift must not rearrange the menu under the person
  // using it. A session predating this column has an empty array and falls back
  // to the live role, so deploying this does not sign anybody out.
  //
  // Still normalised on the way out. The stored list records what an admin
  // chose; the implications of those choices are a rule, and a rule that
  // changes must apply to lists already saved rather than waiting for each one
  // to be re-saved.
  const snapshot = session.permissions.length ? session.permissions : user.role?.permissions;

  return {
    userId: user.id,
    companyId: user.companyId,
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.isSuperAdmin ? ['*'] : normalizeRolePermissions(snapshot ?? []),
    name: user.name,
    email: user.email,
  };
}

/* --------------------------------------------------------- login throttling */

const WINDOW_MS = 15 * 60_000;
/** Per account. Generous enough for a cashier fumbling a new password. */
const MAX_PER_EMAIL = 10;
/** Per source address, which is what catches spraying across many accounts. */
const MAX_PER_IP = 30;

/**
 * The client's address, trusted only where it can be.
 *
 * Deployed, every request arrives through Vercel's proxy, so `request.ip` is
 * derived from X-Forwarded-For and is meaningful. Run directly, that header is
 * attacker-supplied — which is exactly why `trustProxy` in app.ts is gated on
 * VERCEL=1. Getting this wrong would let anyone reset their own bucket by
 * inventing a header, so the two settings have to stay in step.
 */
const sourceOf = (request: FastifyRequest) => request.ip;

/**
 * Refuses a sign-in attempt that is part of a burst, before any password is
 * verified.
 *
 * Checked ahead of argon2 on purpose: verification is deliberately expensive
 * (19 MB and ~50 ms each), so an unthrottled login route is simultaneously a
 * guessing oracle and a way to bill the account for someone else's compute.
 *
 * The failure is a 429 rather than a 401, and it does not vary by whether the
 * email exists — a throttle that only tripped on real accounts would answer the
 * very question the generic 401 exists to hide.
 */
export async function assertLoginAllowed(request: FastifyRequest, email: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { key: `email:${email}`, at: { gte: since } } }),
    prisma.loginAttempt.count({ where: { key: `ip:${sourceOf(request)}`, at: { gte: since } } }),
  ]);

  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP) {
    throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  }
}

/** Records a failure against both buckets. Never called on success. */
export async function recordFailedLogin(request: FastifyRequest, email: string): Promise<void> {
  await prisma.loginAttempt.createMany({
    data: [{ key: `email:${email}` }, { key: `ip:${sourceOf(request)}` }],
  });
}

/**
 * Clears an account's failures once the right password arrives, so a cashier
 * who mistypes four times and then succeeds starts the next shift with a clean
 * slate. The IP bucket is left alone: on shared retail wifi, one success must
 * not wipe the evidence of everyone else's failures.
 */
export async function clearLoginFailures(email: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key: `email:${email}` } });
}

/**
 * Opportunistic cleanup of both expiring tables, fired on a successful sign-in.
 *
 * Neither is ever cleared otherwise: a session row is only removed if that exact
 * cookie is presented again after expiry, so sessions belonging to people who
 * simply stopped coming back accumulate indefinitely. Login attempts have the
 * sharper problem — the throttle counts rows in a window, so an ever-growing
 * table makes the check that protects login slower the more it is attacked.
 *
 * Deliberately not awaited. This is housekeeping, and the person who just
 * signed in correctly should not wait on it or fail because of it.
 */
export function purgeExpired(): void {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  void prisma.loginAttempt.deleteMany({ where: { at: { lt: cutoff } } }).catch(() => {});
  void prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
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
