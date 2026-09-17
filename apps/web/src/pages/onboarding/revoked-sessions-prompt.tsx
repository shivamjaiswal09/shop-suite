import { navNodeFor, type ScreenPermission } from '@shop/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export interface RevokedTarget {
  roleId: string;
  name: string;
  lost: string[];
}

/** Screens read as their menu label; actions keep their key, which is the clearest name they have. */
const describe = (permission: string) =>
  permission.startsWith('view.')
    ? (navNodeFor(permission as ScreenPermission)?.label ?? permission)
    : permission;

/**
 * Offered immediately after a save that took a permission away.
 *
 * Permissions are snapshotted at sign-in, which is what stops a menu
 * rearranging under somebody mid-shift. The cost is that a revocation lies
 * dormant until the holder signs in again — up to a week. That is fine when an
 * admin is tidying up, and wrong in the case people actually revoke things:
 * somebody is doing something they should not be, and "next week" is not an
 * answer.
 *
 * So the choice is put here, at the only moment it is obvious, rather than
 * buried as a menu action nobody would find while it mattered.
 */
export function RevokedSessionsPrompt({
  target,
  pending,
  onClose,
  onSignOut,
}: {
  target: RevokedTarget | null;
  pending?: boolean;
  onClose: () => void;
  onSignOut: (roleId: string) => Promise<void>;
}) {
  const [error, setError] = useState<string>();

  if (!target) return null;

  return (
    <Modal
      open
      title="Apply this now?"
      description={`${target.name} lost ${target.lost.length} permission${target.lost.length === 1 ? '' : 's'}. Anyone already signed in keeps it until they sign in again.`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Removed</p>
          <ul className="space-y-1">
            {target.lost.map((permission) => (
              <li key={permission} className="text-sm">
                {describe(permission)}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted-foreground">
          Signing them out applies it immediately. They will need to sign in again — mid-sale, if
          they are at a counter. Your own session is not affected.
        </p>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Leave until next sign-in
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setError(undefined);
              try {
                await onSignOut(target.roleId);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Could not sign them out');
              }
            }}
          >
            {pending ? 'Signing out…' : 'Sign out everyone on this role'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
