import {
  useCreateRole,
  useCreateUser,
  useDeleteRole,
  useLocations,
  useRoleUserCounts,
  useRoles,
  useSessionStore,
  useSignOutRole,
  useUpdateRole,
  useUpdateUser,
  useUsers,
} from '@shop/state';
import { navNodeFor, type ScreenPermission } from '@shop/core';
import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { activeField, EditDialog, type EditTarget } from './edit-dialog';
import { DeleteRoleDialog, type DeleteRoleTarget } from './delete-role-dialog';
import { duplicateOf, RoleEditor, roleDraft, type RoleDraft } from './role-editor';
import { RevokedSessionsPrompt } from './revoked-sessions-prompt';
import { RecordForm, type FormValues } from './record-form';

const ALL_STORES = '__all__';

export function OnboardUsersPage() {
  const actor = useSessionStore((s) => s.user);
  const users = useUsers();
  const roles = useRoles();
  const locations = useLocations('store');
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const roleCounts = useRoleUserCounts();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const signOutRole = useSignOutRole();
  // Offered only after a save that took something away. Permissions now apply
  // at next sign-in, so a revocation sits dormant until then — which is fine
  // for a tidy-up and wrong for the reason you usually revoke something.
  const [revoked, setRevoked] = useState<{ roleId: string; name: string; lost: string[] } | null>(
    null,
  );
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [roleDraftState, setRoleDraftState] = useState<RoleDraft | null>(null);
  const [roleError, setRoleError] = useState<string>();
  const [deleting, setDeleting] = useState<DeleteRoleTarget | null>(null);

  const roleById = useMemo(() => new Map((roles.data ?? []).map((r) => [r.id, r])), [roles.data]);
  const storeById = useMemo(
    () => new Map((locations.data ?? []).map((s) => [s.id, s])),
    [locations.data],
  );

  const onSubmit = async (values: FormValues) => {
    if (!actor) return;
      await createUser.mutateAsync({
        name: values.name ?? '',
        email: values.email ?? '',
        phone: values.phone || undefined,
        roleId: values.roleId ?? '',
        storeIds: values.storeId && values.storeId !== ALL_STORES ? [values.storeId] : [],
        createdBy: actor.id,
      });
  };

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description="Who can sign in, what they may do, and which stores they may work in."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Add a user"
            description="Phase 1 signs in on email alone — no password is stored."
          />
          <RecordForm
            submitLabel="Create user"
            pending={createUser.isPending}
            onSubmit={onSubmit}
            fields={[
              { name: 'name', label: 'Name', required: true, placeholder: 'Anita Rao' },
              { name: 'email', label: 'Email', required: true, placeholder: 'anita@nandiretail.in' },
              { name: 'phone', label: 'Phone' },
              {
                name: 'roleId',
                label: 'Role',
                type: 'select',
                initial: (roles.data ?? [])[0]?.id,
                options: (roles.data ?? []).map((r) => ({ value: r.id, label: r.name })),
              },
              {
                name: 'storeId',
                label: 'Store access',
                type: 'select',
                initial: ALL_STORES,
                span: 2,
                options: [
                  { value: ALL_STORES, label: 'All stores' },
                  ...(locations.data ?? []).map((s) => ({ value: s.id, label: s.name })),
                ],
              },
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Users" />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Store access</Th>
                <Th className="text-right">Active</Th>
                <Th className="w-24 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).length === 0 ? (
                <EmptyRow colSpan={5}>No users yet.</EmptyRow>
              ) : (
                users.data!.map((user) => (
                  <tr key={user.id}>
                    <Td>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </Td>
                    <Td>{roleById.get(user.roleId)?.name ?? '—'}</Td>
                    <Td className="text-xs">
                      {(user.storeIds ?? []).length === 0
                        ? 'All stores'
                        : (user.storeIds ?? []).map((id) => storeById.get(id)?.code ?? id).join(', ')}
                    </Td>
                    <Td className="text-right">
                      <Badge tone={user.active ? 'success' : 'neutral'}>{user.active ? 'Yes' : 'No'}</Badge>
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: user.id,
                            title: `Edit ${user.name}`,
                            fields: [
                              { name: 'name', label: 'Name', initial: user.name, required: true, span: 2 },
                              { name: 'phone', label: 'Phone', initial: user.phone ?? '' },
                              {
                                name: 'roleId',
                                label: 'Role',
                                type: 'select',
                                initial: user.roleId,
                                options: (roles.data ?? []).map((r) => ({ value: r.id, label: r.name })),
                              },
                              {
                                name: 'storeId',
                                label: 'Store access',
                                type: 'select',
                                initial: user.storeIds?.[0] ?? ALL_STORES,
                                span: 2,
                                options: [
                                  { value: ALL_STORES, label: 'All stores' },
                                  ...(locations.data ?? []).map((s) => ({ value: s.id, label: s.name })),
                                ],
                              },
                              activeField(user.active),
                            ],
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Roles & permissions"
            description="What each role sees in the sidebar and the phone app, and what it may do there."
            action={
              <Button size="sm" onClick={() => setRoleDraftState(roleDraft())}>
                <Plus className="h-3.5 w-3.5" /> New role
              </Button>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Sees</Th>
                <Th className="text-right">Users</Th>
                <Th className="w-56 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(roles.data ?? []).map((role) => {
                const screens = role.permissions.filter((p) => p.startsWith('view.'));
                const userCount = roleCounts.data?.[role.id] ?? 0;
                return (
                  <tr key={role.id}>
                    <Td>
                      <p className="font-medium">{role.name}</p>
                      {role.system ? (
                        <p className="text-xs text-muted-foreground">Built-in</p>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {/* Named screens, not raw keys — `view.inventory.stores`
                            tells an admin nothing that "Store Stock" does not. */}
                        {screens.slice(0, 4).map((permission) => (
                          <Badge key={permission}>
                            {navNodeFor(permission as ScreenPermission)?.label ?? permission}
                          </Badge>
                        ))}
                        {screens.length > 4 ? (
                          <Badge tone="neutral">+{screens.length - 4} more</Badge>
                        ) : null}
                        {screens.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nothing</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="text-right text-sm">{userCount}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRoleDraftState(roleDraft(role))}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {role.system ? 'View' : 'Edit'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRoleDraftState(duplicateOf(role))}
                        >
                          <Copy className="h-3.5 w-3.5" /> Duplicate
                        </Button>
                        {!role.system ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleting({ role, userCount })}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </div>

      <RoleEditor
        draft={roleDraftState}
        pending={createRole.isPending || updateRole.isPending}
        error={roleError}
        onClose={() => {
          setRoleDraftState(null);
          setRoleError(undefined);
        }}
        onSave={async (draft) => {
          if (!actor) return;
          setRoleError(undefined);
          try {
            if (draft.id) {
              const before = roles.data?.find((r) => r.id === draft.id)?.permissions ?? [];
              await updateRole.mutateAsync({
                id: draft.id,
                actorId: actor.id,
                patch: { name: draft.name, permissions: draft.permissions },
              });
              const lost = before.filter((p) => !draft.permissions.includes(p));
              if (lost.length) setRevoked({ roleId: draft.id, name: draft.name, lost });
            } else {
              await createRole.mutateAsync({
                input: { name: draft.name, permissions: draft.permissions },
                actorId: actor.id,
              });
            }
            setRoleDraftState(null);
          } catch (error) {
            // Shown in the dialog rather than thrown away: every one of these
            // is a guardrail explaining what to fix — the last admin, a name
            // already taken — and closing the dialog would lose the edit too.
            setRoleError(error instanceof Error ? error.message : 'Could not save the role');
          }
        }}
      />

      <RevokedSessionsPrompt
        target={revoked}
        pending={signOutRole.isPending}
        onClose={() => setRevoked(null)}
        onSignOut={async (roleId) => {
          await signOutRole.mutateAsync(roleId);
          setRevoked(null);
        }}
      />

      <DeleteRoleDialog
        target={deleting}
        roles={roles.data ?? []}
        pending={deleteRole.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={async (reassignToRoleId) => {
          if (!actor) return;
          await deleteRole.mutateAsync({
            id: deleting!.role.id,
            reassignToRoleId,
            actorId: actor.id,
          });
          setDeleting(null);
        }}
      />

      <EditDialog
        target={editing}
        pending={updateUser.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, values) => {
          if (!actor) return;
          await updateUser.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              name: values.name,
              phone: values.phone || undefined,
              roleId: values.roleId,
              storeIds: values.storeId && values.storeId !== ALL_STORES ? [values.storeId] : [],
              active: values.active === 'true',
            },
          });
        }}
      />
    </>
  );
}
