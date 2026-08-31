import type { Permission, Role } from '@shop/core';
import { useMemo } from 'react';
import { useSessionStore } from '../session';
import { useRoles } from './use-org';

/**
 * Authorisation, derived rather than stored. The session holds a `roleId`; the
 * permission set is folded from the role master, so revoking a permission on a
 * role takes effect everywhere without touching a screen — the same shape as
 * the stock ledger's derive-don't-store rule.
 *
 * Shared by both apps: web can gate its sidebar with the identical hooks.
 */

/** The signed-in user's role, resolved against the role master. */
export function useCurrentRole(): Role | undefined {
  const user = useSessionStore((s) => s.user);
  const roles = useRoles();

  return useMemo(
    () => (user ? roles.data?.find((role) => role.id === user.roleId) : undefined),
    [roles.data, user],
  );
}

/**
 * The permissions granted to the signed-in user. Empty while the role master is
 * still loading — callers must treat "not yet known" as "not permitted", which
 * is what keeps a gated surface from flashing into view before the check lands.
 */
export function usePermissions(): ReadonlySet<Permission> {
  const role = useCurrentRole();
  return useMemo(() => new Set(role?.permissions ?? []), [role]);
}

/** Whether the signed-in user holds a specific permission. */
export function useCan(permission: Permission): boolean {
  return usePermissions().has(permission);
}

/** Whether the user holds at least one of several permissions. */
export function useCanAny(permissions: readonly Permission[]): boolean {
  const granted = usePermissions();
  return permissions.some((permission) => granted.has(permission));
}
