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

  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** The entity being edited, held as a draft so a half-typed GSTIN is not saved. */
  const [editing, setEditing] = useState<{
    id: string;
    legalName: string;
    gstin: string;
    pan: string;
    addressLine: string;
  } | null>(null);

  const all = entities.data ?? [];
  const storeList = stores.data ?? [];

  const add = async () => {
    if (!legalName.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({
        legalName: legalName.trim(),
        gstin: gstin.trim() || undefined,
        pan: pan.trim() || undefined,
        locationIds,
      });
      setLegalName('');
      setGstin('');
      setPan('');
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="bf-legal">Legal name</Label>
            <Input
              id="bf-legal"
              required
              placeholder="S.M Automobiles Pvt Ltd"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="bf-gstin">GSTIN</Label>
            <Input
              id="bf-gstin"
              placeholder="29AAAAA0000A1Z5"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="bf-pan">PAN</Label>
            <Input
              id="bf-pan"
              placeholder="AAAAA1111A"
              value={pan}
              onChange={(e) => setPan(e.target.value)}
            />
          </div>
        </div>

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

        <Button disabled={create.isPending || !legalName.trim()} onClick={() => void add()}>
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
                <div className="grid gap-3 border-b border-border pb-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor={`e-legal-${entity.id}`}>Legal name</Label>
                    <Input
                      id={`e-legal-${entity.id}`}
                      value={editing.legalName}
                      onChange={(e) => setEditing({ ...editing, legalName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`e-gstin-${entity.id}`}>GSTIN</Label>
                    <Input
                      id={`e-gstin-${entity.id}`}
                      value={editing.gstin}
                      onChange={(e) => setEditing({ ...editing, gstin: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`e-pan-${entity.id}`}>PAN</Label>
                    <Input
                      id={`e-pan-${entity.id}`}
                      value={editing.pan}
                      onChange={(e) => setEditing({ ...editing, pan: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`e-addr-${entity.id}`}>Address</Label>
                    <Input
                      id={`e-addr-${entity.id}`}
                      value={editing.addressLine}
                      onChange={(e) => setEditing({ ...editing, addressLine: e.target.value })}
                    />
                  </div>
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
                      {entity.gstin ? `GSTIN ${entity.gstin}` : 'No GSTIN'}
                      {entity.pan ? ` · PAN ${entity.pan}` : ''}
                      {entity.addressLine ? ` · ${entity.addressLine}` : ''}
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
