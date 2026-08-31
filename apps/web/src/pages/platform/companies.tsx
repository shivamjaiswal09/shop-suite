import { useCompanies, useCreateCompany, useLogout, useSessionStore, useUpdateCompany } from '@shop/state';
import { Building2, LogOut, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { Stat } from '@/components/ui/stat';
import { shortDateTime } from '@/lib/utils';
import { CompanyDetail } from './company-detail';

/**
 * The super admin's whole application. They sit outside every company and never
 * sell, so none of the retail modules apply to them — creating a company and
 * its first administrator is the entire job.
 */
export function PlatformConsolePage() {
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();
  const companies = useCompanies();
  const update = useUpdateCompany();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = companies.data ?? [];
  const active = rows.filter((c) => c.active);

  return (
    <div className="min-h-screen bg-muted/40 p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Platform Console</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {user?.email} — super admin, outside every company.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New company
            </Button>
            <Button variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Companies" value={String(rows.length)} icon={Building2} />
          <Stat label="Active" value={String(active.length)} />
          <Stat
            label="Users across platform"
            value={String(rows.reduce((sum, c) => sum + (c._count?.users ?? 0), 0))}
          />
        </div>

        <Card>
          <CardHeader
            title="Companies"
            description="Each is a hard boundary — no user can see across one."
          />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Legal name</Th>
                <Th>GSTIN</Th>
                <Th className="text-right">Users</Th>
                <Th className="text-right">Locations</Th>
                <Th>Created</Th>
                <Th className="w-28 text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {companies.isLoading ? (
                <EmptyRow colSpan={7}>Loading…</EmptyRow>
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={7}>No companies yet — create the first one.</EmptyRow>
              ) : (
                rows.map((company) => (
                  <tr
                    key={company.id}
                    onClick={() => setSelectedId(company.id)}
                    className="cursor-pointer transition-colors hover:bg-muted"
                  >
                    <Td className="font-medium">{company.name}</Td>
                    <Td className="text-muted-foreground">{company.legalName}</Td>
                    <Td className="text-xs text-muted-foreground">{company.gstin ?? '—'}</Td>
                    <Td className="tabular text-right">{company._count?.users ?? '—'}</Td>
                    <Td className="tabular text-right">{company._count?.locations ?? '—'}</Td>
                    <Td className="text-xs text-muted-foreground">
                      {shortDateTime(String(company.createdAt))}
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={update.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          update.mutate({ id: company.id, patch: { active: !company.active } });
                        }}
                      >
                        <Badge tone={company.active ? 'success' : 'neutral'}>
                          {company.active ? 'active' : 'inactive'}
                        </Badge>
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <p className="text-xs text-muted-foreground">
          Select a company to manage its users, reset passwords, or delete it. Deactivating signs
          out everyone in it immediately.
        </p>
      </div>

      <NewCompanyDialog open={creating} onClose={() => setCreating(false)} />

      <CompanyDetail
        company={rows.find((c) => c.id === selectedId) ?? null}
        onClose={() => setSelectedId(null)}
        onDeleted={() => setSelectedId(null)}
      />
    </div>
  );
}

function NewCompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCompany();
  const [form, setForm] = useState({
    name: '',
    legalName: '',
    gstin: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; company: string } | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await create.mutateAsync({
        name: form.name,
        legalName: form.legalName,
        gstin: form.gstin || undefined,
        admin: {
          name: form.adminName,
          email: form.adminEmail,
          password: form.adminPassword,
        },
      });
      setCreated({ email: result.admin.email, company: result.company.name });
      setForm({ name: '', legalName: '', gstin: '', adminName: '', adminEmail: '', adminPassword: '' });
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const close = () => {
    setCreated(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="New company"
      description="The company and its first administrator are created together — a company nobody can sign into is not a useful thing to leave behind."
      onClose={close}
      footer={
        created ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button form="new-company" type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create company'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <CardBody className="space-y-2 rounded-md border border-success/40 bg-success/10 p-4">
          <p className="text-sm font-medium text-success">{created.company} created.</p>
          <p className="text-sm">
            Its administrator signs in as <strong>{created.email}</strong> with the password you set.
            Hand it over directly — nothing is emailed.
          </p>
        </CardBody>
      ) : (
        <form id="new-company" onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-name">Company name</Label>
              <Input id="c-name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="c-legal">Legal name</Label>
              <Input
                id="c-legal"
                required
                value={form.legalName}
                onChange={(e) => set('legalName', e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="c-gstin">GSTIN</Label>
            <Input id="c-gstin" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} />
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-3 text-xs font-medium text-muted-foreground">First administrator</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="a-name">Name</Label>
                <Input
                  id="a-name"
                  required
                  value={form.adminName}
                  onChange={(e) => set('adminName', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="a-email">Email</Label>
                <Input
                  id="a-email"
                  type="email"
                  required
                  value={form.adminEmail}
                  onChange={(e) => set('adminEmail', e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="a-pw">Password (min 8 characters)</Label>
              <Input
                id="a-pw"
                type="password"
                required
                minLength={8}
                value={form.adminPassword}
                onChange={(e) => set('adminPassword', e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Stored only as an argon2 hash. You will not be able to read it back.
              </p>
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </form>
      )}
    </Modal>
  );
}
