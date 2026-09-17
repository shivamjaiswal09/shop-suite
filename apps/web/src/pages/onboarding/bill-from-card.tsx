import type { BillFrom } from '@shop/core';
import {
  useBillFromEntities,
  useCreateBillFrom,
  useLocations,
  useSessionStore,
  useUpdateBillFrom,
} from '@shop/state';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';

interface Draft {
  legalName: string;
  gstin: string;
  pan: string;
  addressLine: string;
  email: string;
  phone: string;
}

const EMPTY_DRAFT: Draft = {
  legalName: '',
  gstin: '',
  pan: '',
  addressLine: '',
  email: '',
  phone: '',
};

/**
 * The fields of an entity, rendered identically whether it is being created or
 * corrected. Shared rather than written twice: the add form had drifted and was
 * missing the address the edit form offered.
 */
function EntityFields({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const field = (key: keyof Draft, label: string, placeholder?: string, span?: boolean) => (
    <div className={span ? 'sm:col-span-2' : undefined}>
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <Input
        id={`${idPrefix}-${key}`}
        placeholder={placeholder}
        value={draft[key]}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {field('legalName', 'Legal name', 'S.M Automobiles Pvt Ltd')}
      {field('gstin', 'GSTIN', '29AAAAA0000A1Z5')}
      {field('pan', 'PAN', 'AAAAA1111A')}
      {field('addressLine', 'Address', '12 MG Road, Bengaluru', true)}
      {field('phone', 'Phone', '+91 80 4000 1001')}
      {field('email', 'Email', 'billing@smauto.in', true)}
    </div>
  );
}

/**
 * The legal entities this company issues bills as, and which branches may use
 * each one.
 *
 * Only stores are offered. Stock moves through a warehouse; bills do not come
 * from one.
 */
export function BillFromCard() {
  const user = useSessionStore((s) => s.user);
  const entities = useBillFromEntities(true);
  const stores = useLocations('store');
  const create = useCreateBillFrom();
  const update = useUpdateBillFrom();

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** The entity being edited, held as a draft so a half-typed GSTIN is not saved. */
  const [editing, setEditing] = useState<(Draft & { id: string }) | null>(null);

  const all = entities.data ?? [];
  const storeList = stores.data ?? [];

  const add = async () => {
    if (!draft.legalName.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({
        legalName: draft.legalName.trim(),
        gstin: draft.gstin.trim() || undefined,
        pan: draft.pan.trim() || undefined,
        addressLine: draft.addressLine.trim() || undefined,
        email: draft.email.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        locationIds,
      });
      setDraft(EMPTY_DRAFT);
      setLocationIds([]);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const saveEdit = async () => {
    if (!editing || !user || !editing.legalName.trim()) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: editing.id,
        // Empty clears rather than leaves alone, which is what an emptied box
        // on a form means.
        patch: {
          legalName: editing.legalName.trim(),
          gstin: editing.gstin.trim() || null,
          pan: editing.pan.trim() || null,
          addressLine: editing.addressLine.trim() || null,
          email: editing.email.trim() || null,
          phone: editing.phone.trim() || null,
        },
        actorId: user.id,
      });
      setEditing(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const toggleStore = (entity: BillFrom, storeId: string) => {
    if (!user) return;
    setError(null);
    // The whole set is sent, not a diff — the API replaces the mapping, so the
    // ticked boxes are the answer rather than an instruction.
    const next = entity.locationIds.includes(storeId)
      ? entity.locationIds.filter((id) => id !== storeId)
      : [...entity.locationIds, storeId];
    update.mutate({ id: entity.id, patch: { locationIds: next }, actorId: user.id });
  };

  return (
    <Card>
      <CardHeader
        title="Bill from"
        description="The legal entities you issue bills as. Each branch bills under the ones ticked for it."
      />

      <CardBody className="space-y-3 border-b border-border">
        <EntityFields
          idPrefix="bf"
          draft={draft}
          onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
        />

        <div>
          <Label>Billable from</Label>
          <div className="flex flex-wrap gap-2">
            {storeList.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No stores yet — add one under Stores &amp; Warehouses first.
              </p>
            ) : (
              storeList.map((store) => (
                <Button
                  key={store.id}
                  type="button"
                  size="sm"
                  variant={locationIds.includes(store.id) ? 'default' : 'outline'}
                  onClick={() =>
                    setLocationIds((prev) =>
                      prev.includes(store.id)
                        ? prev.filter((id) => id !== store.id)
                        : [...prev, store.id],
                    )
                  }
                >
                  {store.name}
                </Button>
              ))
            )}
          </div>
        </div>

        <Button disabled={create.isPending || !draft.legalName.trim()} onClick={() => void add()}>
          {create.isPending ? 'Adding…' : 'Add entity'}
        </Button>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
      </CardBody>

      <CardBody className="space-y-4">
        {all.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No entities yet. Billing will leave the supplier details blank until one exists.
          </p>
        ) : (
          all.map((entity) => (
            <div key={entity.id} className={entity.active ? undefined : 'opacity-50'}>
              {editing?.id === entity.id ? (
                <div className="space-y-3 border-b border-border pb-3">
                  <EntityFields
                    idPrefix={`e-${entity.id}`}
                    draft={editing}
                    onChange={(patch) => setEditing({ ...editing, ...patch })}
                  />
                  <div className="flex items-end gap-2">
                    <Button disabled={update.isPending} onClick={() => void saveEdit()}>
                      {update.isPending ? 'Saving…' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5">
                  <div className="min-w-0">
                    <p className="font-medium">{entity.legalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        entity.gstin ? `GSTIN ${entity.gstin}` : 'No GSTIN',
                        entity.pan ? `PAN ${entity.pan}` : null,
                        entity.addressLine,
                        entity.phone,
                        entity.email,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          id: entity.id,
                          legalName: entity.legalName,
                          gstin: entity.gstin ?? '',
                          pan: entity.pan ?? '',
                          addressLine: entity.addressLine ?? '',
                          email: entity.email ?? '',
                          phone: entity.phone ?? '',
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        user &&
                        update.mutate({
                          id: entity.id,
                          patch: { active: !entity.active },
                          actorId: user.id,
                        })
                      }
                    >
                      {entity.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Billable from:</span>
                {storeList.map((store) => (
                  <Button
                    key={store.id}
                    size="sm"
                    variant={entity.locationIds.includes(store.id) ? 'default' : 'outline'}
                    onClick={() => toggleStore(entity, store.id)}
                  >
                    {store.name}
                  </Button>
                ))}
                {entity.locationIds.length === 0 ? (
                  <Badge tone="warning">Not billable anywhere</Badge>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}
