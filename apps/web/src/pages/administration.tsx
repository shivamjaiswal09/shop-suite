import {
  useAuditLog,
  useStores,
  useCompany,
  useStoreWarehouseLinks,
  useWarehouses,
} from '@shop/state';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { shortDateTime } from '@/lib/utils';

const TABS = ['Company', 'Audit Log'] as const;
type Tab = (typeof TABS)[number];

export function AdministrationPage() {
  const [tab, setTab] = useState<Tab>('Company');

  return (
    <>
      <PageHeader title="Administration" description="Company profile and the audit trail. Set up locations, users and masters under Onboarding." />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={tab === item ? 'default' : 'outline'}
            onClick={() => setTab(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      {tab === 'Company' ? <OrganisationTab /> : null}
      {tab === 'Audit Log' ? <AuditTab /> : null}
    </>
  );
}

function OrganisationTab() {
  const company = useCompany();
  const stores = useStores();
  const warehouses = useWarehouses();
  const links = useStoreWarehouseLinks();

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader title="Company" />
        <CardBody className="space-y-2 text-sm">
          <Field label="Name" value={company.data?.name ?? '—'} />
          <Field label="Legal name" value={company.data?.legalName ?? '—'} />
          <Field label="GSTIN" value={company.data?.gstin ?? '—'} />
          <Field label="Currency" value={company.data?.currency ?? '—'} />
          <Field label="Timezone" value={company.data?.timezone ?? '—'} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Stores & Warehouses"
          description="Independent locations. A warehouse may supply several stores, and a store may draw on several warehouses."
        />
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Code</Th>
              <Th>City</Th>
              <Th>Warehouses</Th>
            </tr>
          </thead>
          <tbody>
            {(stores.data ?? []).map((store) => (
              <tr key={store.id}>
                <Td className="font-medium">{store.name}</Td>
                <Td>{store.code}</Td>
                <Td className="text-muted-foreground">{store.city ?? '—'}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {(links.data ?? [])
                      .filter((link) => link.storeId === store.id)
                      .map((link) => {
                        const wh = (warehouses.data ?? []).find((w) => w.id === link.warehouseId);
                        return (
                          <Badge key={link.id} tone={link.isPrimary ? 'info' : 'neutral'}>
                            {wh?.code ?? link.warehouseId}
                            {link.isPrimary ? ' · primary' : ''}
                          </Badge>
                        );
                      })}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function AuditTab() {
  const audit = useAuditLog(100);

  return (
    <Card>
      <CardHeader title="Audit log" description="Append-only record of every mutating action." />
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Entity</Th>
            <Th>Action</Th>
            <Th>Summary</Th>
            <Th>Actor</Th>
          </tr>
        </thead>
        <tbody>
          {(audit.data ?? []).length === 0 ? (
            <EmptyRow colSpan={5}>Nothing recorded yet.</EmptyRow>
          ) : (
            audit.data!.map((log) => (
              <tr key={log.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{shortDateTime(log.at)}</Td>
                <Td>
                  <Badge>{log.entity}</Badge>
                </Td>
                <Td>{log.action}</Td>
                <Td className="text-xs">{log.summary}</Td>
                <Td className="text-xs text-muted-foreground">{log.actorId}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
