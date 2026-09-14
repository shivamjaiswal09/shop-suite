import type { StockLocation } from '../entities/org.ts';

/**
 * Where a sign-in lands, or why it cannot.
 *
 * `store: null` with `ok: true` is a real, working session — a super admin has
 * no company to sell from, and an admin bootstrapping a new company has no
 * store yet. Screens already treat the active store as nullable.
 */
export type SignInLanding =
  | { ok: true; store: StockLocation | null }
  | { ok: false; reason: string };

export interface SignInLandingInput {
  isSuperAdmin: boolean;
  /** The caller's permissions, used only to decide who may bootstrap. */
  permissions: readonly string[];
  /** Stores the caller is restricted to. Empty means every store. */
  locationIds: readonly string[];
  /** Every store in the caller's company. */
  stores: readonly StockLocation[];
}

/**
 * Decides which store a session opens on.
 *
 * This exists as a pure function, away from the sign-in hook, because it is the
 * rule that decides whether a company is usable at all, and getting it wrong is
 * invisible until somebody cannot log in. It is also the only part worth
 * testing: the hook around it just moves the result into a store.
 *
 * The bootstrap case is the subtle one. Creating a company creates its roles
 * and its admin but no location, and only an admin can add one — so refusing a
 * store-less admin locks the company permanently, with no screen anywhere able
 * to repair it. An admin is therefore admitted without a store; a cashier is
 * not, because there is genuinely nothing for them to do until someone else
 * acts.
 */
export function resolveSignInLanding(input: SignInLandingInput): SignInLanding {
  const { isSuperAdmin, permissions, locationIds, stores } = input;

  // A super admin sits outside tenancy entirely. They administer, never sell.
  if (isSuperAdmin) return { ok: true, store: null };

  // An empty access list is the common case and means "every store".
  const permitted = locationIds.length
    ? stores.filter((s) => locationIds.includes(s.id))
    : stores;

  const store = permitted[0];
  if (store) return { ok: true, store };

  // Distinguish the two failures. They look identical to the user and have
  // opposite remedies: one needs a store created, the other needs a grant.
  if (stores.length === 0) {
    if (permissions.includes('admin.manage')) return { ok: true, store: null };
    return {
      ok: false,
      reason: 'This company has no stores yet. An administrator must create one before you can sign in.',
    };
  }

  // Stores exist and none of them are this user's. Deliberately not falling
  // back to the company's first store: doing so silently seated a user at a
  // till they had never been given.
  return { ok: false, reason: 'You have not been given access to any store yet.' };
}
