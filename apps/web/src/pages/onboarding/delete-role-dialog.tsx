import type { Role } from '@shop/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export interface DeleteRoleTarget {
  role: Role;
  userCount: number;
}

/**
 * Deleting a role is the one destructive action on this screen, and the users
 * holding it are the reason it needs a dialog rather than a confirm.
 *
 * `User.roleId` is nullable in the schema, so a role deleted out from under its
 * users would leave them pointing at nothing — which reads as "no permissions
 * at all" rather than failing loudly, and would look to the person affected
 * like the app had simply lost their access. So the destination is a required
 * answer, not a default.
 */
export function DeleteRoleDialog({
  target,
  roles,
  pending,
  onClose,
  onConfirm,
}: {
  target: DeleteRoleTarget | null;
  roles: Role[];
  pending?: boolean;
  onClose: () => void;
  onConfirm: (reassignToRoleId: string) => Promise<void>;
}) {
  const alternatives = roles.filter((r) => r.id !== target?.role.id);
  const [reassignTo, setReassignTo] = useState(alternatives[0]?.id ?? '');
  const [error, setError] = useState<string>();

  if (!target) return null;

  const { role, userCount } = target;

  return (
    <Modal
      open
      title={`Delete ${role.name}?`}
      description="This cannot be undone. The role's permissions go with it."
      onClose={onClose}
    >
      <div className="space-y-4">
        {userCount > 0 ? (
          <>
            <p className="text-sm">
              <span className="font-medium">
                {userCount} user{userCount === 1 ? '' : 's'}
              </span>{' '}
              {userCount === 1 ? 'holds' : 'hold'} this role. Move{' '}
              {userCount === 1 ? 'them' : 'them'} to:
            </p>
            <select
              value={reassignTo}
              onChange={(event) => setReassignTo(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              aria-label="Role to move users to"
            >
              {alternatives.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              They will see whatever that role sees the next time they sign in.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No users hold this role.</p>
        )}

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || (userCount > 0 && !reassignTo)}
            onClick={async () => {
              setError(undefined);
              try {
                // Even with no users holding it, the server wants somewhere to
                // point — it does not trust the count the client just read.
                await onConfirm(reassignTo || alternatives[0]?.id || '');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not delete the role');
              }
            }}
          >
            {pending ? 'Deleting…' : 'Delete role'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
