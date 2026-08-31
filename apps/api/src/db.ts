import { PrismaClient } from '@prisma/client';

/**
 * One client per process, not one per invocation.
 *
 * A serverless function is re-entered on a warm container, and module state
 * usually survives that — but not always, and `node --watch` re-evaluates this
 * module on every save. Either way a fresh PrismaClient opens a fresh pool and
 * the old one is never disconnected, so connections accumulate on the database
 * until Postgres starts refusing them. Parking the client on globalThis, which
 * outlives module re-evaluation, means we hand back the pool that already
 * exists instead of opening another.
 *
 * This is why DATABASE_URL must be the Supabase pooler (port 6543) with
 * `?pgbouncer=true&connection_limit=1`: many short-lived functions each holding
 * a single pooled connection is the shape Postgres can actually serve. See
 * apps/api/README.md.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
