import {
  useCreateLocation,
  useLinkWarehouse,
  useLocations,
  useSessionStore,
  useStoreWarehouseLinks,
  useSetPrimaryWarehouse,
  useUnlinkWarehouse,
  useUpdateLocation,
  useWarehouses,
} from '@shop/state';
import { useState } from 'react';
import { Link2Off, Pencil, Star } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { activeField, EditDialog, type EditTarget } from './edit-dialog';
import { RecordForm, type FormValues } from './record-form';

/** Onboard the physical network: stores, warehouses, and who supplies whom. */
export function OnboardLocationsPage() {
  const user = useSessionStore((s) => s.user);
  const locations = useLocations(undefined, true);
  const warehouses = useWarehouses();
  const links = useStoreWarehouseLinks();
  const createLocation = useCreateLocation();
  const linkWarehouse = useLinkWarehouse();
  const unlink = useUnlinkWarehouse();
  const setPrimary = useSetPrimaryWarehouse();
  const updateLocation = useUpdateLocation();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const stores = (locations.data ?? []).filter((l) => l.kind === 'store');

  const onCreate = async (values: FormValues) => {
    if (!user) return;
    await createLocation.mutateAsync({
        kind: values.kind === 'warehouse' ? 'warehouse' : 'store',
        code: values.code ?? '',
        name: values.name ?? '',
        city: values.city || undefined,
        phone: values.phone || undefined,
        createdBy: user.id,
      });
  };

  const onLink = async (values: FormValues) => {
    if (!user) return;
    await linkWarehouse.mutateAsync({
        storeId: values.storeId ?? '',
        warehouseId: values.warehouseId ?? '',
        isPrimary: values.isPrimary === 'true',
        createdBy: user.id,
      });
  };

  return (
    <>
      <PageHeader
        title="Stores & Warehouses"
        description="Stores and warehouses are independent. Link them to say which warehouse may replenish which store."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Add a location" description="A store sells; a warehouse holds bulk stock." />
          <RecordForm
            submitLabel="Create location"
            pending={createLocation.isPending}
            onSubmit={onCreate}
            fields={[
              {
                name: 'kind',
                label: 'Kind',
                type: 'select',
                initial: 'store',
                options: [
                  { value: 'store', label: 'Store (sells)' },
                  { value: 'warehouse', label: 'Warehouse (bulk)' },
                ],
              },
              { name: 'code', label: 'Code', required: true, placeholder: 'ST-KOR' },
              { name: 'name', label: 'Name', required: true, placeholder: 'Koramangala Store', span: 2 },
              { name: 'city', label: 'City', placeholder: 'Bengaluru' },
              { name: 'phone', label: 'Phone' },
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="Locations" description={`${locations.data?.length ?? 0} configured`} />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Kind</Th>
                <Th>City</Th>
                <Th className="text-right">Status</Th>
                <Th className="w-24 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(locations.data ?? []).length === 0 ? (
                <EmptyRow colSpan={7}>No locations yet.</EmptyRow>
              ) : (
                locations.data!.map((location) => (
                  <tr key={location.id}>
                    <Td className="font-medium">{location.name}</Td>
                    <Td>{location.code}</Td>
                    <Td>
                      <Badge tone={location.kind === 'store' ? 'info' : 'neutral'}>{location.kind}</Badge>
                    </Td>
                    <Td className="text-muted-foreground">{location.city ?? '—'}</Td>
                    <Td className="text-right">
                      <Badge tone={location.active ? 'success' : 'neutral'}>
                        {location.active ? 'active' : 'inactive'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: location.id,
                            title: `Edit ${location.name}`,
                            fields: [
                              { name: 'code', label: 'Code', initial: location.code, required: true },
                              { name: 'name', label: 'Name', initial: location.name, required: true, span: 3 },
                              { name: 'city', label: 'City', initial: location.city ?? '' },
                              { name: 'phone', label: 'Phone', initial: location.phone ?? '' },
                              activeField(location.active),
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
            title="Supply links"
            description="Which warehouses may replenish which stores. A store may draw on several."
          />
          <RecordForm
            submitLabel="Link warehouse to store"
            pending={linkWarehouse.isPending}
            onSubmit={onLink}
            fields={[
              {
                name: 'storeId',
                label: 'Store',
                type: 'select',
                initial: stores[0]?.id,
                options: stores.map((s) => ({ value: s.id, label: s.name })),
              },
              {
                name: 'warehouseId',
                label: 'Warehouse',
                type: 'select',
                initial: (warehouses.data ?? [])[0]?.id,
                options: (warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name })),
              },
              { name: 'isPrimary', label: 'Primary source', type: 'checkbox' },
            ]}
          />
          <Table>
            <thead>
              <tr>
                <Th>Store</Th>
                <Th>Supplied by</Th>
                <Th>Primary</Th>
                <Th className="w-24 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(links.data ?? []).length === 0 ? (
                <EmptyRow colSpan={4}>No supply links — stores cannot be replenished yet.</EmptyRow>
              ) : (
                links.data!.map((link) => (
                  <tr key={link.id}>
                    <Td className="font-medium">
                      {stores.find((s) => s.id === link.storeId)?.name ?? link.storeId}
                    </Td>
                    <Td>
                      {(warehouses.data ?? []).find((w) => w.id === link.warehouseId)?.name ??
                        link.warehouseId}
                    </Td>
                    <Td>
                      {link.isPrimary ? (
                        <Badge tone="info">primary</Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={setPrimary.isPending}
                          onClick={() => user && setPrimary.mutate({ linkId: link.id, actorId: user.id })}
                        >
                          <Star className="h-3.5 w-3.5" /> Make primary
                        </Button>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={unlink.isPending}
                        onClick={() => user && unlink.mutate({ linkId: link.id, actorId: user.id })}
                      >
                        <Link2Off className="h-3.5 w-3.5" /> Unlink
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <EditDialog
        target={editing}
        pending={updateLocation.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, values) => {
          if (!user) return;
          await updateLocation.mutateAsync({
            id,
            actorId: user.id,
            patch: {
              code: values.code,
              name: values.name,
              city: values.city || undefined,
              phone: values.phone || undefined,
                    active: values.active === 'true',
            },
          });
        }}
      />
    </>
  );
}
