import { describe, expect, it } from 'vitest';
import type { StockLocation } from '../entities/org.ts';
import { resolveSignInLanding } from './session.ts';

const store = (id: string): StockLocation =>
  ({ id, companyId: 'c1', kind: 'store', code: id.toUpperCase(), name: id, active: true }) as StockLocation;

const base = {
  isSuperAdmin: false,
  permissions: ['sales.bill'] as string[],
  locationIds: [] as string[],
  stores: [] as StockLocation[],
};

describe('resolveSignInLanding', () => {
  it('lets a super admin in with no store', () => {
    // They administer the platform and belong to no company, so there is
    // nothing to sell from and nothing to pick.
    expect(resolveSignInLanding({ ...base, isSuperAdmin: true })).toEqual({ ok: true, store: null });
  });

  it('lands a user on their only store', () => {
    const s = store('s1');
    expect(resolveSignInLanding({ ...base, stores: [s] })).toEqual({ ok: true, store: s });
  });

  it('honours an access list', () => {
    const [s1, s2] = [store('s1'), store('s2')];
    expect(resolveSignInLanding({ ...base, stores: [s1, s2], locationIds: ['s2'] })).toEqual({
      ok: true,
      store: s2,
    });
  });

  it('treats an empty access list as access to every store', () => {
    const [s1, s2] = [store('s1'), store('s2')];
    expect(resolveSignInLanding({ ...base, stores: [s1, s2], locationIds: [] })).toEqual({
      ok: true,
      store: s1,
    });
  });

  it('refuses a user whose access list matches no existing store', () => {
    // Previously this fell through to the first store in the company, which
    // silently granted a till the user had never been given.
    const result = resolveSignInLanding({ ...base, stores: [store('s1')], locationIds: ['gone'] });
    expect(result.ok).toBe(false);
  });

  it('lets an admin in store-less so they can create the first store', () => {
    // The bootstrap case: a freshly created company has no locations, and the
    // only person who can add one is an admin who must therefore be able to
    // sign in without one.
    expect(
      resolveSignInLanding({ ...base, permissions: ['admin.manage'], stores: [] }),
    ).toEqual({ ok: true, store: null });
  });

  it('refuses a cashier when the company has no stores', () => {
    // Nothing they can do about it, so say so plainly rather than admitting
    // them to an app with no till.
    const result = resolveSignInLanding({ ...base, stores: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no stores yet/i);
  });

  it('blames the company, not the user, when there are no stores at all', () => {
    // The old message read "This user has no store access yet", which sent
    // admins to check permissions that were already correct.
    const result = resolveSignInLanding({ ...base, stores: [] });
    if (!result.ok) expect(result.reason).not.toMatch(/your access|no store access/i);
  });

  it('blames access, not the company, when stores exist', () => {
    const result = resolveSignInLanding({ ...base, stores: [store('s1')], locationIds: ['gone'] });
    if (!result.ok) expect(result.reason).toMatch(/access/i);
  });
});
