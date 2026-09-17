import { ACTION_PERMISSIONS, navScreens, SCREEN_PERMISSIONS } from '@shop/core';
import { describe, expect, it } from 'vitest';
import { upgradeRolePermissions } from './backfill-screen-permissions.ts';

/**
 * This migration runs once, against a live database, and its failure mode is
 * somebody signing in on Monday to an empty sidebar. So the thing under test is
 * not "does it add keys" but "can every role still reach what it could reach on
 * Friday".
 */

/** The three roles every company created before this change actually has. */
const ADMIN = [
  'sales.bill',
  'sales.override_price',
  'sales.refund',
  'inventory.view',
  'inventory.adjust',
  'purchase.manage',
  'closing.perform',
  'closing.approve',
  'admin.manage',
];
const MANAGER = ADMIN.filter((p) => p !== 'admin.manage');
const CASHIER = ['sales.bill', 'inventory.view', 'closing.perform'];

describe('upgradeRolePermissions', () => {
  it('keeps every action permission a role already held', () => {
    // The screens are additive. Taking an action away would change what people
    // can do, which is not a migration's business.
    for (const role of [ADMIN, MANAGER, CASHIER]) {
      const upgraded = upgradeRolePermissions(role);
      for (const permission of role) expect(upgraded).toContain(permission);
    }
  });

  it('gives an admin every screen there is', () => {
    // The role that repairs all the others cannot come out of this missing one.
    const upgraded = upgradeRolePermissions(ADMIN);
    for (const node of navScreens()) expect(upgraded).toContain(node.screen);
  });

  it('gives a manager everything except company administration', () => {
    const upgraded = upgradeRolePermissions(MANAGER);
    expect(upgraded).not.toContain('view.admin');
    expect(upgraded).toContain('view.purchases');
    expect(upgraded).toContain('view.inventory.transfers');
  });

  it('gives a cashier the counter and nothing more', () => {
    const upgraded = upgradeRolePermissions(CASHIER);

    expect(upgraded).toContain('view.sales.billing');
    expect(upgraded).toContain('view.closing.dayend');
    expect(upgraded).toContain('view.inventory.stores');

    // The screens a cashier could never open before must not appear now: a
    // migration that quietly widens access is worse than one that narrows it.
    expect(upgraded).not.toContain('view.purchases');
    expect(upgraded).not.toContain('view.admin');
    expect(upgraded).not.toContain('view.onboarding.users');
    expect(upgraded).not.toContain('view.inventory.transfers');
  });

  it('does not grant a price override to anyone who lacked it', () => {
    // The permission exists to keep a cashier from ringing items at zero, and
    // that must survive the migration intact.
    expect(upgradeRolePermissions(CASHIER)).not.toContain('sales.override_price');
  });

  it('lands every non-empty role somewhere', () => {
    // An empty sidebar is indistinguishable from a broken deploy, so every role
    // that could sign in before must still have a screen to land on.
    for (const role of [ADMIN, MANAGER, CASHIER, ['inventory.view'], ['purchase.manage']]) {
      expect(upgradeRolePermissions(role).some((p) => p.startsWith('view.'))).toBe(true);
    }
  });

  it('leaves a role with no permissions alone', () => {
    // It could not sign in usefully before either. Inventing access for it
    // would be the migration making a decision that is not its to make.
    expect(upgradeRolePermissions([])).toEqual([]);
  });

  it('is idempotent', () => {
    // It will be run twice. Someone always runs it twice.
    const once = upgradeRolePermissions(MANAGER);
    expect(upgradeRolePermissions(once)).toEqual(once);
  });

  it('produces only permissions that exist', () => {
    // Checked against the enums rather than the nav tree: the tree defines what
    // an admin can *tick*, the enums what is *valid*. `inventory.view` is the
    // difference — it belongs to no screen and is derived from holding any
    // inventory screen, so it is a real permission that never appears as a
    // checkbox.
    const known = new Set<string>([...ACTION_PERMISSIONS, ...SCREEN_PERMISSIONS]);
    for (const permission of upgradeRolePermissions(ADMIN)) {
      expect(known.has(permission)).toBe(true);
    }
  });

  it('derives the coarse inventory read key the API still checks', () => {
    // Without it the old inventory routes answer 403 and the screen the role
    // was just granted renders empty.
    expect(upgradeRolePermissions(CASHIER)).toContain('inventory.view');
  });
});
