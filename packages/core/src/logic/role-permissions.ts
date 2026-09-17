import {
  isActionPermission,
  isScreenPermission,
  type ActionPermission,
  type Permission,
  type ScreenPermission,
} from '../entities/user.ts';
import { flattenNav, navScreens, NAV_TREE, type NavNode } from '../nav.ts';

/**
 * The rules that keep a role's permission list coherent.
 *
 * These live here, as pure functions away from any screen, because the role
 * editor is not the only thing that writes a permission list — the API accepts
 * one over HTTP and must apply the identical rules, or a hand-rolled request
 * gets a role the editor could never have produced. Same shape as the stock
 * ledger: one derivation, used by everybody, rather than a rule re-implemented
 * per caller.
 */

/**
 * Grants that follow from other grants.
 *
 * `inventory.view` is the interesting one. It is a coarse read key that predates
 * per-screen permissions and is still what the API's inventory routes check, so
 * a role holding only `view.inventory.warehouses` would load a screen it is
 * allowed to see and fill it with 403s. Granting it alongside any inventory
 * screen keeps the old check satisfied without weakening it.
 */
const IMPLIED: Partial<Record<Permission, readonly Permission[]>> = {
  // An admin who cannot open the role editor is locked out in every way that
  // matters, and the last-admin guardrail would not notice: it counts the
  // permission, not the path to it.
  'admin.manage': ['view.onboarding.users', 'view.admin'],
};

/** Screens whose presence implies a coarse read key the API still checks. */
const COARSE_READ: { screens: readonly ScreenPermission[]; grants: Permission }[] = [
  {
    screens: navScreens()
      .filter((node) => node.id.startsWith('inventory.'))
      .map((node) => node.screen),
    grants: 'inventory.view',
  },
];

/** The screen an action is performed on, from the nav tree. */
function screenForAction(action: ActionPermission): ScreenPermission | undefined {
  return navScreens().find((node) => node.actions?.includes(action))?.screen;
}

/** The actions belonging to a screen. */
function actionsForScreen(screen: ScreenPermission): readonly ActionPermission[] {
  return navScreens().find((node) => node.screen === screen)?.actions ?? [];
}

/** Canonical order: menu order for screens, then the actions each screen hosts. */
const ORDER: Permission[] = flattenNav().flatMap((node) => [
  ...(node.screen ? [node.screen as Permission] : []),
  ...((node.actions ?? []) as Permission[]),
]);

/**
 * Applies every implication, drops anything that is not a permission, removes
 * duplicates and returns the result in a stable order.
 *
 * Total and idempotent by construction: callers may hand it any array of
 * strings, including one straight off the wire or out of a database written
 * before a key existed.
 */
export function normalizeRolePermissions(input: readonly string[]): Permission[] {
  const granted = new Set<Permission>();

  for (const raw of input) {
    if (isActionPermission(raw) || isScreenPermission(raw)) granted.add(raw);
  }

  // An action is meaningless without the screen it is performed on.
  for (const permission of [...granted]) {
    if (!isActionPermission(permission)) continue;
    const screen = screenForAction(permission);
    if (screen) granted.add(screen);
  }

  for (const [permission, implied] of Object.entries(IMPLIED)) {
    if (granted.has(permission as Permission)) for (const p of implied ?? []) granted.add(p);
  }

  for (const { screens, grants } of COARSE_READ) {
    if (screens.some((screen) => granted.has(screen))) granted.add(grants);
  }

  // Sorted by the canonical order rather than alphabetically, so a stored list
  // reads in the same order as the editor that produced it and two equivalent
  // sets compare equal.
  return [...granted].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

/**
 * Turns a screen on or off.
 *
 * Turning one off takes its actions with it — leaving `sales.override_price`
 * behind on a role that can no longer open Quick Billing would be a permission
 * nobody can audit, and `normalizeRolePermissions` would faithfully hand the
 * screen straight back on the next save.
 */
export function setScreenGranted(
  permissions: readonly Permission[],
  screen: ScreenPermission,
  granted: boolean,
): Permission[] {
  if (granted) return normalizeRolePermissions([...permissions, screen]);

  const dropped = new Set<Permission>([screen, ...actionsForScreen(screen)]);
  const remaining = permissions.filter((p) => !dropped.has(p));

  // Re-normalising would re-derive a coarse read key from whatever screens are
  // left, which is what we want — but it would also re-derive it from the one
  // just removed if that key were still present, so strip the derived keys and
  // let them be recomputed.
  const derived = new Set<Permission>(COARSE_READ.map((rule) => rule.grants));
  return normalizeRolePermissions(remaining.filter((p) => !derived.has(p)));
}

/** Turns an action on or off. Turning it on reveals the screen it lives on. */
export function setActionGranted(
  permissions: readonly Permission[],
  action: ActionPermission,
  granted: boolean,
): Permission[] {
  if (granted) return normalizeRolePermissions([...permissions, action]);
  return normalizeRolePermissions(permissions.filter((p) => p !== action));
}

/**
 * Whether a node belongs in the menu. A group has no permission of its own —
 * it is visible exactly when it still has something to show, so hiding every
 * child of Inventory hides Inventory rather than leaving a dead heading.
 */
export function isNodeVisible(node: NavNode, granted: ReadonlySet<string>): boolean {
  if (node.children?.length) {
    return node.children.some((child) => isNodeVisible(child, granted));
  }
  return node.screen !== undefined && granted.has(node.screen);
}

/** The nav tree with every hidden node pruned out. */
export function visibleNav(
  granted: ReadonlySet<string>,
  nodes: readonly NavNode[] = NAV_TREE,
): NavNode[] {
  return nodes
    .filter((node) => isNodeVisible(node, granted))
    .map((node) =>
      node.children?.length ? { ...node, children: visibleNav(granted, node.children) } : node,
    );
}

/**
 * Where to send someone who has landed somewhere they may not be — their first
 * visible screen, or null if they have none, which is a company-configuration
 * problem rather than a navigation one.
 */
export function firstVisiblePath(granted: ReadonlySet<string>): string | null {
  const visible = visibleNav(granted);
  const walk = (nodes: readonly NavNode[]): string | null => {
    for (const node of nodes) {
      if (node.children?.length) {
        const found = walk(node.children);
        if (found) return found;
      } else if (node.screen) {
        return node.path;
      }
    }
    return null;
  };
  return walk(visible);
}
