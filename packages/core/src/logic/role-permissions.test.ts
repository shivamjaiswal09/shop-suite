import { describe, expect, it } from 'vitest';
import type { Permission } from '../entities/user.ts';
import { NAV_TREE } from '../nav.ts';
import {
  isNodeVisible,
  normalizeRolePermissions,
  setActionGranted,
  setScreenGranted,
  visibleNav,
} from './role-permissions.ts';

const has = (perms: readonly Permission[], p: Permission) => perms.includes(p);

describe('normalizeRolePermissions', () => {
  it('grants the screen an action is performed on', () => {
    // You cannot discount at a till you cannot open. Ticking the action alone
    // would otherwise produce a role that holds a power it can never reach.
    const result = normalizeRolePermissions(['sales.override_price']);
    expect(has(result, 'view.sales.billing')).toBe(true);
    expect(has(result, 'sales.override_price')).toBe(true);
  });

  it('grants inventory.view alongside any inventory screen', () => {
    // The API's inventory reads still check the coarse key, so a role holding
    // only the fine-grained screen would see an empty page full of 403s.
    expect(has(normalizeRolePermissions(['view.inventory.warehouses']), 'inventory.view')).toBe(true);
  });

  it('keeps an admin able to reach the role editor', () => {
    // admin.manage without the screen that hosts the editor is a soft lockout:
    // the last-admin guardrail counts the permission and sees nothing wrong,
    // while the person holding it has no way in.
    const result = normalizeRolePermissions(['admin.manage']);
    expect(has(result, 'view.onboarding.users')).toBe(true);
    expect(has(result, 'view.admin')).toBe(true);
  });

  it('drops strings that are not permissions', () => {
    expect(normalizeRolePermissions(['sales.bill', 'sales.bil', 'nonsense'] as string[])).toEqual([
      'sales.bill',
      'view.sales.billing',
    ]);
  });

  it('de-duplicates', () => {
    expect(normalizeRolePermissions(['sales.bill', 'sales.bill'])).toEqual([
      'sales.bill',
      'view.sales.billing',
    ]);
  });

  it('is idempotent', () => {
    const once = normalizeRolePermissions(['sales.override_price', 'closing.approve']);
    expect(normalizeRolePermissions(once)).toEqual(once);
  });

  it('orders output stably regardless of input order', () => {
    const a = normalizeRolePermissions(['closing.approve', 'sales.bill']);
    const b = normalizeRolePermissions(['sales.bill', 'closing.approve']);
    expect(a).toEqual(b);
  });

  it('leaves an empty set empty', () => {
    // A role that can do nothing is a legitimate thing to save mid-edit; it is
    // the guardrails, not the normaliser, that refuse a harmful one.
    expect(normalizeRolePermissions([])).toEqual([]);
  });
});

describe('setScreenGranted', () => {
  it('revokes the actions on a screen it turns off', () => {
    const granted = normalizeRolePermissions(['sales.bill', 'sales.override_price']);
    const result = setScreenGranted(granted, 'view.sales.billing', false);
    expect(has(result, 'sales.bill')).toBe(false);
    expect(has(result, 'sales.override_price')).toBe(false);
    expect(has(result, 'view.sales.billing')).toBe(false);
  });

  it('turning a screen on does not grant its actions', () => {
    // Seeing a screen and acting on it are different grants — that split is the
    // whole reason sales.override_price exists.
    const result = setScreenGranted([], 'view.sales.billing', true);
    expect(has(result, 'view.sales.billing')).toBe(true);
    expect(has(result, 'sales.bill')).toBe(false);
  });

  it('does not strip inventory.view while another inventory screen remains', () => {
    const granted = normalizeRolePermissions([
      'view.inventory.stores',
      'view.inventory.warehouses',
    ]);
    const result = setScreenGranted(granted, 'view.inventory.warehouses', false);
    expect(has(result, 'inventory.view')).toBe(true);
    expect(has(result, 'view.inventory.stores')).toBe(true);
  });

  it('strips inventory.view once the last inventory screen goes', () => {
    const granted = normalizeRolePermissions(['view.inventory.stores']);
    const result = setScreenGranted(granted, 'view.inventory.stores', false);
    expect(has(result, 'inventory.view')).toBe(false);
  });
});

describe('setActionGranted', () => {
  it('turning an action on grants its screen', () => {
    const result = setActionGranted([], 'closing.approve', true);
    expect(has(result, 'view.closing.dayend')).toBe(true);
  });

  it('turning an action off leaves the screen visible', () => {
    const granted = normalizeRolePermissions(['closing.perform', 'closing.approve']);
    const result = setActionGranted(granted, 'closing.approve', false);
    expect(has(result, 'view.closing.dayend')).toBe(true);
    expect(has(result, 'closing.perform')).toBe(true);
    expect(has(result, 'closing.approve')).toBe(false);
  });
});

describe('visibility', () => {
  const sales = NAV_TREE.find((n) => n.id === 'sales')!;
  const billing = sales.children!.find((n) => n.id === 'sales.billing')!;

  it('shows a group when any child is visible', () => {
    const granted = normalizeRolePermissions(['view.sales.invoices']);
    expect(isNodeVisible(sales, new Set(granted))).toBe(true);
  });

  it('hides a group when every child is hidden', () => {
    expect(isNodeVisible(sales, new Set())).toBe(false);
  });

  it('hides a leaf without its screen', () => {
    expect(isNodeVisible(billing, new Set())).toBe(false);
  });

  it('prunes hidden children out of the returned tree', () => {
    const granted = new Set(normalizeRolePermissions(['view.sales.invoices']));
    const tree = visibleNav(granted);
    const visibleSales = tree.find((n) => n.id === 'sales');
    expect(visibleSales?.children?.map((c) => c.id)).toEqual(['sales.invoices']);
  });

  it('returns nothing for a role granted nothing', () => {
    // Which is why the API refuses to leave a company without an admin: this is
    // what that person's sidebar would look like.
    expect(visibleNav(new Set())).toEqual([]);
  });
});
