import {
  SCREEN_PERMISSIONS,
  type ActionPermission,
  type ScreenPermission,
} from './entities/user.ts';

/**
 * The navigation taxonomy, in one place, free of any icon or routing library so
 * that both apps and the API can read it.
 *
 * It used to live in `apps/web/src/components/nav.ts` carrying Lucide icons,
 * which meant mobile could not import it and kept its own parallel list. That
 * is the drift the old NavList comment warned about — a phone showing a
 * different menu from a laptop is a bug nobody notices for months. Now there is
 * one tree, and five things read it:
 *
 *   - the role editor, which renders it as the permission checklist
 *   - the web sidebar and drawer
 *   - the web route guards
 *   - the mobile tab bar
 *   - the API, which maps a route to the screen key it must check
 *
 * Each app keeps its own icon map keyed by `id`, because Lucide and Ionicons
 * have neither the same names nor the same shape.
 */

export type MobileTab = 'home' | 'bill' | 'stock' | 'closing';

export interface NavNode {
  /** Stable key. Icon maps and the role editor's checkbox state are keyed on it. */
  id: string;
  label: string;
  /** Web route. A group's path is a prefix that redirects to its first child. */
  path: string;
  /**
   * The permission that reveals this screen and admits a request to the routes
   * serving it. Absent on a group, whose visibility is folded from its children
   * — a group with every child hidden has nothing to show and hides itself.
   */
  screen?: ScreenPermission;
  /**
   * Actions available on this screen, rendered nested beneath it in the role
   * editor. Granting one implies the screen: you cannot discount on a till you
   * cannot open.
   */
  actions?: ActionPermission[];
  /** The mobile tab this screen drives, if any. Marked 📱 in the editor. */
  mobileTab?: MobileTab;
  children?: NavNode[];
}

export const NAV_TREE: readonly NavNode[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    screen: 'view.home',
    mobileTab: 'home',
  },
  {
    id: 'sales',
    label: 'Sales',
    path: '/sales',
    children: [
      {
        id: 'sales.billing',
        label: 'Quick Billing',
        path: '/sales/billing',
        screen: 'view.sales.billing',
        actions: ['sales.bill', 'sales.override_price'],
        mobileTab: 'bill',
      },
      { id: 'sales.orders', label: 'Orders', path: '/sales/orders', screen: 'view.sales.orders' },
      {
        id: 'sales.invoices',
        label: 'Invoices',
        path: '/sales/invoices',
        screen: 'view.sales.invoices',
      },
      {
        id: 'sales.returns',
        label: 'Returns',
        path: '/sales/returns',
        screen: 'view.sales.returns',
        actions: ['sales.refund'],
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    path: '/inventory',
    children: [
      {
        id: 'inventory.stores',
        label: 'Store Stock',
        path: '/inventory/stores',
        screen: 'view.inventory.stores',
        actions: ['inventory.adjust'],
        mobileTab: 'stock',
      },
      {
        id: 'inventory.warehouses',
        label: 'Warehouse Stock',
        path: '/inventory/warehouses',
        screen: 'view.inventory.warehouses',
        actions: ['inventory.adjust'],
      },
      {
        id: 'inventory.all',
        label: 'Total Inventory',
        path: '/inventory/all',
        screen: 'view.inventory.all',
      },
      {
        id: 'inventory.transfers',
        label: 'Transfers',
        path: '/inventory/transfers',
        screen: 'view.inventory.transfers',
        actions: ['inventory.adjust'],
      },
      {
        id: 'inventory.replenishment',
        label: 'Replenishment',
        path: '/inventory/replenishment',
        screen: 'view.inventory.replenishment',
      },
      {
        id: 'inventory.movements',
        label: 'Stock Movements',
        path: '/inventory/movements',
        screen: 'view.inventory.movements',
      },
    ],
  },
  {
    id: 'purchases',
    label: 'Purchases',
    path: '/purchases',
    screen: 'view.purchases',
    actions: ['purchase.manage'],
  },
  {
    id: 'closing',
    label: 'Closing & Reconciliation',
    path: '/closing',
    children: [
      {
        id: 'closing.dayend',
        label: 'Day-End Closing',
        path: '/closing/day-end',
        screen: 'view.closing.dayend',
        actions: ['closing.perform', 'closing.approve'],
        mobileTab: 'closing',
      },
      {
        id: 'closing.reconciliation',
        label: 'Reconciliation',
        path: '/closing/reconciliation',
        screen: 'view.closing.reconciliation',
      },
    ],
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    path: '/onboarding',
    children: [
      {
        id: 'onboarding.locations',
        label: 'Stores & Warehouses',
        path: '/onboarding/locations',
        screen: 'view.onboarding.locations',
        actions: ['admin.manage'],
      },
      {
        id: 'onboarding.products',
        label: 'Products & SKUs',
        path: '/onboarding/products',
        screen: 'view.onboarding.products',
        actions: ['inventory.adjust'],
      },
      {
        id: 'onboarding.users',
        label: 'Users & Roles',
        path: '/onboarding/users',
        screen: 'view.onboarding.users',
        actions: ['admin.manage'],
      },
      {
        id: 'onboarding.masters',
        label: 'Masters',
        path: '/onboarding/masters',
        screen: 'view.onboarding.masters',
        actions: ['inventory.adjust'],
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    path: '/admin',
    screen: 'view.admin',
    actions: ['admin.manage'],
  },
];

/** Every node, groups included, depth-first in menu order. */
export function flattenNav(nodes: readonly NavNode[] = NAV_TREE): NavNode[] {
  return nodes.flatMap((node) => [node, ...flattenNav(node.children ?? [])]);
}

/** Only the nodes that are a screen — i.e. that carry a permission of their own. */
export function navScreens(): (NavNode & { screen: ScreenPermission })[] {
  return flattenNav().filter(
    (node): node is NavNode & { screen: ScreenPermission } => node.screen !== undefined,
  );
}

/** The node a screen permission belongs to. */
export function navNodeFor(screen: ScreenPermission): NavNode | undefined {
  return navScreens().find((node) => node.screen === screen);
}

/** The screen that must be granted for a mobile tab to appear. */
export function screenForMobileTab(tab: MobileTab): ScreenPermission | undefined {
  return navScreens().find((node) => node.mobileTab === tab)?.screen;
}

/**
 * The parent group of a node, or undefined for a top-level node. Used by the
 * editor to tick a group when a child is ticked.
 */
export function navParentOf(id: string): NavNode | undefined {
  return flattenNav().find((node) => node.children?.some((child) => child.id === id));
}

/**
 * The tree and the enum are two lists of the same thing, and two lists drift.
 * Checking them against each other at module load turns a screen added without
 * a key — which would silently grant nothing to anybody, and look like a
 * permissions bug rather than a missing constant — into an immediate crash on
 * the first import.
 */
function assertTreeMatchesEnum(): void {
  const inTree = navScreens().map((node) => node.screen);
  const duplicates = inTree.filter((screen, i) => inTree.indexOf(screen) !== i);
  if (duplicates.length) {
    throw new Error(`NAV_TREE reuses screen permission(s): ${duplicates.join(', ')}`);
  }

  const missing = SCREEN_PERMISSIONS.filter((screen) => !inTree.includes(screen));
  if (missing.length) {
    throw new Error(`Screen permission(s) with no NAV_TREE node: ${missing.join(', ')}`);
  }
}

assertTreeMatchesEnum();
