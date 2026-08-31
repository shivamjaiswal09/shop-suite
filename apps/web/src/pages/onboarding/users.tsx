import {
  useCreateUser,
  useLocations,
  useRoles,
  useSessionStore,
  useUpdateUser,
  useUsers,
} from '@shop/state';
import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { activeField, EditDialog, type EditTarget } from './edit-dialog';
import { RecordForm, type FormValues } from './record-form';

const ALL_STORES = '__all__';

export function OnboardUsersPage() {
  const actor = useSessionStore((s) => s.user);
  const users = useUsers();
  const roles = useRoles();
  const locations = useLocations('store');
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [editing, setEditing] = useState<EditTarget | null>(null);

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
          <CardHeader title="Roles & permissions" description="Fixed in Phase 1." />
          <Table>
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Permissions</Th>
              </tr>
            </thead>
            <tbody>
              {(roles.data ?? []).map((role) => (
                <tr key={role.id}>
                  <Td className="font-medium">{role.name}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map((permission) => (
                        <Badge key={permission}>{permission}</Badge>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

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
