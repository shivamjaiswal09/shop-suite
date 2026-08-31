import type { PlatformCompany } from '@shop/data';
import {
  useCompanyRoles,
  useCompanyUsers,
  useCreateUserInCompany,
  useDeleteCompany,
  useDeleteUser,
  useSetUserPassword,
} from '@shop/state';
import { KeyRound, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardBody } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';

/** Everything a super admin can do inside one company. */
export function CompanyDetail({
  company,
  onClose,
  onDeleted,
}: {
  company: PlatformCompany | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const users = useCompanyUsers(company?.id);
  const roles = useCompanyRoles(company?.id);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<{ id: string; email: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteUser = useDeleteUser();
  const [error, setError] = useState<string | null>(null);

  if (!company) return null;

  return (
    <Modal
      open
      title={company.name}
      description={`${company.legalName} · ${users.data?.length ?? 0} users`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" /> Delete company
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Add user
          </Button>
        </div>

        <div className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th className="text-right">Active</Th>
                <Th className="w-44 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.isLoading ? (
                <EmptyRow colSpan={4}>Loading…</EmptyRow>
              ) : (users.data ?? []).length === 0 ? (
                <EmptyRow colSpan={4}>No users in this company.</EmptyRow>
              ) : (
                users.data!.map((user) => (
                  <tr key={user.id}>
                    <Td>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </Td>
                    <Td className="text-xs">
                      {roles.data?.find((r) => r.id === user.roleId)?.name ?? '—'}
                    </Td>
                    <Td className="text-right">
                      <Badge tone={user.active ? 'success' : 'neutral'}>
                        {user.active ? 'yes' : 'no'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setResetting({ id: user.id, email: user.email })}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Reset
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteUser.isPending}
                          onClick={async () => {
                            setError(null);
                            try {
                              await deleteUser.mutateAsync(user.id);
                            } catch (cause) {
                              setError((cause as Error).message);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Passwords cannot be viewed — they are stored as one-way argon2 hashes, so nobody, including
          you, can read one back. <strong>Reset</strong> replaces the credential with one you choose,
          which is how you restore access.
        </p>
      </div>

      {adding ? (
        <AddUserDialog
          companyId={company.id}
          roles={(roles.data ?? []).map((r) => ({ id: r.id, name: r.name }))}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {resetting ? (
        <ResetPasswordDialog target={resetting} onClose={() => setResetting(null)} />
      ) : null}

      {deleting ? (
        <DeleteCompanyDialog
          company={company}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onDeleted();
          }}
        />
      ) : null}
    </Modal>
  );
}

function AddUserDialog({
  companyId,
  roles,
  onClose,
}: {
  companyId: string;
  roles: { id: string; name: string }[];
  onClose: () => void;
}) {
  const create = useCreateUserInCompany();
  const [form, setForm] = useState({ name: '', email: '', password: '', roleId: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        companyId,
        name: form.name,
        email: form.email,
        password: form.password,
        roleId: form.roleId || roles[0]?.id || '',
        storeIds: [],
        locationIds: [],
      });
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <Modal
      open
      title="Add user"
      description="Created directly in this company. No email is sent — hand the password over yourself."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="add-user" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="add-user" onSubmit={(e) => void submit(e)} className="space-y-3">
        <div>
          <Label htmlFor="u-name">Name</Label>
          <Input id="u-name" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="u-role">Role</Label>
          <Select id="u-role" value={form.roleId || roles[0]?.id || ''} onChange={(e) => setForm((p) => ({ ...p, roleId: e.target.value }))}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="u-pw">Password (min 8)</Label>
          <Input id="u-pw" type="password" required minLength={8} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: { id: string; email: string };
  onClose: () => void;
}) {
  const setPassword = useSetUserPassword();
  const [password, setPasswordValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <Modal
      open
      title={`Reset password · ${target.email}`}
      description="Their existing sessions are destroyed, so they must sign in again with the new one."
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={setPassword.isPending || password.length < 8}
              onClick={async () => {
                setError(null);
                try {
                  await setPassword.mutateAsync({ userId: target.id, password });
                  setDone(true);
                } catch (cause) {
                  setError((cause as Error).message);
                }
              }}
            >
              {setPassword.isPending ? 'Setting…' : 'Set password'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <CardBody className="rounded-md border border-success/40 bg-success/10 p-4 text-sm">
          Password set. Tell {target.email} directly — this is the last moment it is readable by
          anyone, including you.
        </CardBody>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="r-pw">New password (min 8)</Label>
            <Input
              id="r-pw"
              type="text"
              autoFocus
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="Choose something you can pass on"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shown in clear here because you have to relay it. Once saved it becomes a hash and
              cannot be recovered.
            </p>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}

function DeleteCompanyDialog({
  company,
  onClose,
  onDeleted,
}: {
  company: PlatformCompany;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteCompany();
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      title="Delete company"
      description="This cannot be undone."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || confirmName !== company.name}
            onClick={async () => {
              setError(null);
              try {
                await remove.mutateAsync({ id: company.id, confirmName });
                onDeleted();
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            {remove.isPending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Deleting <strong>{company.name}</strong> also destroys every user, location, invoice,
          payment and stock-ledger row it owns. A retailer is often required to retain those records
          — deactivating the company blocks access without losing the history.
        </p>
        <div>
          <Label htmlFor="confirm">Type “{company.name}” to confirm</Label>
          <Input
            id="confirm"
            autoFocus
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
          />
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
