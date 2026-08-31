import { QueryClient } from '@tanstack/react-query';

/**
 * How long each kind of data may be served from cache before it is refetched.
 *
 * The split exists because "how fresh must this be" is a business question, not
 * a technical one, and the two ends of it are very far apart. A tax rate changes
 * when the government says so — refetching it every ten seconds is pure waste on
 * a shop's mobile data. Stock, at the other end, must never be served stale: the
 * cost of a cached level is selling the last unit twice and finding out at the
 * shelf.
 *
 * Anything not obviously reference data belongs in LIVE. Guess wrong towards
 * fresh and you spend a request; guess wrong towards stale and you oversell.
 */
export const STALE = {
  /** Must reflect the database now: stock, carts, today's takings. */
  LIVE: 0,
  /** Org shape — locations, roles, people. Edited occasionally, by an admin. */
  ORG: 5 * 60_000,
  /** Master data — taxes, categories, units, payment methods, reason codes. */
  REFERENCE: 30 * 60_000,
} as const;

/** One factory so web and native cache behave identically. */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // The safe default. Hooks that read reference data opt out explicitly by
        // passing a longer staleTime — the reverse default would make every new
        // hook stale-by-accident.
        staleTime: STALE.LIVE,
        retry: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
