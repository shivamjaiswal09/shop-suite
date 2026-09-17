import {
  useCategories,
  useCreateCategory,
  useCreateCustomer,
  useCreatePaymentMethod,
  useCreateReasonCode,
  useCreateSupplier,
  useCreateTax,
  useCreateUnitOfMeasure,
  useCustomers,
  usePaymentMethods,
  useReasonCodes,
  useSessionStore,
  useSuppliers,
  useTaxes,
  useUnitsOfMeasure,
  useUpdateCategory,
  useUpdateCustomer,
  useUpdatePaymentMethod,
  useUpdateReasonCode,
  useUpdateSupplier,
  useUpdateTax,
  useUpdateUnitOfMeasure,
} from '@shop/state';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { BillFieldsCard } from './bill-fields-card';
import { BillFromCard } from './bill-from-card';
import { BrandsCard } from './brands-card';
import { activeField, EditDialog, type EditTarget } from './edit-dialog';
import { RecordForm, type FormValues } from './record-form';
import { money } from '@/lib/utils';

const TABS = ['Categories', 'Units', 'Taxes', 'Payment methods', 'Reason codes', 'Brands', 'Bill from', 'Bill fields', 'Customers', 'Suppliers'] as const;
type Tab = (typeof TABS)[number];

/** Every shared master, each with the form that creates it. */
export function OnboardMastersPage() {
  const [tab, setTab] = useState<Tab>('Categories');

  return (
    <>
      <PageHeader
        title="Masters"
        description="The shared vocabulary every module reads — units, taxes, tenders, reasons and parties."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Button key={item} size="sm" variant={tab === item ? 'default' : 'outline'} onClick={() => setTab(item)}>
            {item}
          </Button>
        ))}
      </div>

      {tab === 'Categories' ? <CategoriesCard /> : null}
      {tab === 'Units' ? <UnitsCard /> : null}
      {tab === 'Taxes' ? <TaxesCard /> : null}
      {tab === 'Payment methods' ? <PaymentMethodsCard /> : null}
      {tab === 'Reason codes' ? <ReasonCodesCard /> : null}
      {tab === 'Brands' ? <BrandsCard /> : null}
      {tab === 'Bill from' ? <BillFromCard /> : null}
      {tab === 'Bill fields' ? <BillFieldsCard /> : null}
      {tab === 'Customers' ? <CustomersCard /> : null}
      {tab === 'Suppliers' ? <SuppliersCard /> : null}
    </>
  );
}

function useActor() {
  return useSessionStore((s) => s.user);
}

function EditCell({ onClick }: { onClick: () => void }) {
  return (
    <Td className="text-right">
      <Button variant="ghost" size="sm" onClick={onClick}>
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
    </Td>
  );
}

function StatusCell({ active }: { active: boolean }) {
  return (
    <Td className="text-right">
      <Badge tone={active ? 'success' : 'neutral'}>{active ? 'active' : 'inactive'}</Badge>
    </Td>
  );
}

function CategoriesCard() {
  const actor = useActor();
  const categories = useCategories(true);
  const taxes = useTaxes();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const taxOptions = [
    { value: '', label: 'No default' },
    ...(taxes.data ?? []).map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <Card>
      <CardHeader
        title="Categories"
        description="Drives merchandising order and the tax a new product in the category starts on."
      />
      <RecordForm
        submitLabel="Add category"
        pending={create.isPending}
        onSubmit={async (v) => {
          if (!actor) return;
          await create.mutateAsync({
            code: v.code ?? '',
            name: v.name ?? '',
            sortOrder: Number(v.sortOrder) || 0,
            defaultTaxId: v.defaultTaxId || undefined,
            createdBy: actor.id,
          });
        }}
        fields={[
          { name: 'code', label: 'Code', required: true, placeholder: 'FROZEN' },
          { name: 'name', label: 'Name', required: true, placeholder: 'Frozen Foods' },
          { name: 'sortOrder', label: 'Sort order', initial: '70' },
          { name: 'defaultTaxId', label: 'Default tax', type: 'select', options: taxOptions },
        ]}
      />
      <Table>
        <thead>
          <tr>
            <Th className="text-right">Order</Th>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Default tax</Th>
            <Th className="text-right">Status</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(categories.data ?? []).map((category) => (
            <tr key={category.id}>
              <Td className="tabular text-right text-muted-foreground">{category.sortOrder}</Td>
              <Td className="font-medium">{category.code}</Td>
              <Td>{category.name}</Td>
              <Td>
                {category.defaultTaxId ? (
                  <Badge tone="info">
                    {(taxes.data ?? []).find((t) => t.id === category.defaultTaxId)?.name ?? '—'}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">none</span>
                )}
              </Td>
              <StatusCell active={category.active} />
              <EditCell
                onClick={() =>
                  setEditing({
                    id: category.id,
                    title: `Edit ${category.name}`,
                    fields: [
                      { name: 'code', label: 'Code', initial: category.code, required: true },
                      { name: 'name', label: 'Name', initial: category.name, required: true },
                      { name: 'sortOrder', label: 'Sort order', initial: String(category.sortOrder) },
                      {
                        name: 'defaultTaxId',
                        label: 'Default tax',
                        type: 'select',
                        initial: category.defaultTaxId ?? '',
                        options: taxOptions,
                      },
                      activeField(category.active),
                    ],
                  })
                }
              />
            </tr>
          ))}
        </tbody>
      </Table>
      <EditDialog
        target={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await update.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              code: v.code,
              name: v.name,
              sortOrder: Number(v.sortOrder) || 0,
              defaultTaxId: v.defaultTaxId || undefined,
              active: v.active === 'true',
            },
          });
        }}
      />
    </Card>
  );
}

function UnitsCard() {
  const actor = useActor();
  const uoms = useUnitsOfMeasure(true);
  const create = useCreateUnitOfMeasure();
  const update = useUpdateUnitOfMeasure();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const onSubmit = async (v: FormValues) => {
    if (!actor) return;
      await create.mutateAsync({
        code: v.code ?? '',
        name: v.name ?? '',
        precision: Number(v.precision) || 0,
        createdBy: actor.id,
      });
  };

  return (
    <Card>
      <CardHeader title="Units of measure" description="Decimals allowed when transacting." />
      <RecordForm
        submitLabel="Add unit"
        pending={create.isPending}
        onSubmit={onSubmit}
        fields={[
          { name: 'code', label: 'Code', required: true, placeholder: 'BOX' },
          { name: 'name', label: 'Name', required: true, placeholder: 'Box', span: 2 },
          { name: 'precision', label: 'Precision', initial: '0' },
        ]}
      />
      <Table>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th className="text-right">Precision</Th>
            <Th className="text-right">Status</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(uoms.data ?? []).map((uom) => (
            <tr key={uom.id}>
              <Td className="font-medium">{uom.code}</Td>
              <Td>{uom.name}</Td>
              <Td className="tabular text-right">{uom.precision}</Td>
              <StatusCell active={uom.active} />
              <EditCell
                onClick={() =>
                  setEditing({
                    id: uom.id,
                    title: `Edit ${uom.name}`,
                    fields: [
                      { name: 'code', label: 'Code', initial: uom.code, required: true },
                      { name: 'name', label: 'Name', initial: uom.name, required: true, span: 2 },
                      { name: 'precision', label: 'Precision', initial: String(uom.precision) },
                      activeField(uom.active),
                    ],
                  })
                }
              />
            </tr>
          ))}
        </tbody>
      </Table>
      <EditDialog
        target={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await update.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              code: v.code,
              name: v.name,
              precision: Number(v.precision) || 0,
              active: v.active === 'true',
            },
          });
        }}
      />
    </Card>
  );
}

function TaxesCard() {
  const actor = useActor();
  const taxes = useTaxes(true);
  const create = useCreateTax();
  const update = useUpdateTax();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const onSubmit = async (v: FormValues) => {
    if (!actor) return;
      await create.mutateAsync({
        name: v.name ?? '',
        rate: Number(v.rate) || 0,
        inclusive: v.inclusive === 'true',
        hsnCode: v.hsnCode || undefined,
        createdBy: actor.id,
      });
  };

  return (
    <Card>
      <CardHeader title="Taxes" description="Inclusive means the selling price already contains it." />
      <RecordForm
        submitLabel="Add tax"
        pending={create.isPending}
        onSubmit={onSubmit}
        fields={[
          { name: 'name', label: 'Name', required: true, placeholder: 'GST 28%', span: 2 },
          { name: 'rate', label: 'Rate %', required: true, placeholder: '28' },
          { name: 'inclusive', label: 'Inclusive', type: 'checkbox', initial: 'true' },
          { name: 'hsnCode', label: 'HSN code' },
        ]}
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th className="text-right">Rate</Th>
            <Th className="text-right">Mode</Th>
            <Th className="text-right">Status</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(taxes.data ?? []).map((tax) => (
            <tr key={tax.id}>
              <Td className="font-medium">{tax.name}</Td>
              <Td className="tabular text-right">{tax.rate}%</Td>
              <Td className="text-right">
                <Badge tone={tax.inclusive ? 'info' : 'neutral'}>
                  {tax.inclusive ? 'Inclusive' : 'Exclusive'}
                </Badge>
              </Td>
              <StatusCell active={tax.active} />
              <EditCell
                onClick={() =>
                  setEditing({
                    id: tax.id,
                    title: `Edit ${tax.name}`,
                    fields: [
                      { name: 'name', label: 'Name', initial: tax.name, required: true, span: 2 },
                      { name: 'rate', label: 'Rate %', initial: String(tax.rate), required: true },
                      { name: 'inclusive', label: 'Inclusive', type: 'checkbox', initial: String(tax.inclusive) },
                      { name: 'hsnCode', label: 'HSN code', initial: tax.hsnCode ?? '' },
                      activeField(tax.active),
                    ],
                  })
                }
              />
            </tr>
          ))}
        </tbody>
      </Table>
      <EditDialog
        target={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await update.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              name: v.name,
              rate: Number(v.rate) || 0,
              inclusive: v.inclusive === 'true',
              hsnCode: v.hsnCode || undefined,
              active: v.active === 'true',
            },
          });
        }}
      />
    </Card>
  );
}

function PaymentMethodsCard() {
  const actor = useActor();
  const methods = usePaymentMethods(true);
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const onSubmit = async (v: FormValues) => {
    if (!actor) return;
      await create.mutateAsync({
        code: v.code ?? '',
        name: v.name ?? '',
        kind: (v.kind ?? 'cash') as 'cash' | 'card' | 'upi' | 'wallet' | 'credit' | 'bank_transfer',
        countedInDrawer: v.countedInDrawer === 'true',
        createdBy: actor.id,
      });
  };

  return (
    <Card>
      <CardHeader
        title="Payment methods"
        description="Only drawer-counted tenders are expected in the cash count at day-end."
      />
      <RecordForm
        submitLabel="Add method"
        pending={create.isPending}
        onSubmit={onSubmit}
        fields={[
          { name: 'code', label: 'Code', required: true, placeholder: 'MEAL' },
          { name: 'name', label: 'Name', required: true, placeholder: 'Meal card' },
          {
            name: 'kind',
            label: 'Kind',
            type: 'select',
            initial: 'card',
            options: ['cash', 'card', 'upi', 'wallet', 'credit', 'bank_transfer'].map((k) => ({
              value: k,
              label: k.replace('_', ' '),
            })),
          },
          { name: 'countedInDrawer', label: 'In cash drawer', type: 'checkbox' },
        ]}
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Kind</Th>
            <Th className="text-right">Drawer</Th>
            <Th className="text-right">Status</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(methods.data ?? []).map((method) => (
            <tr key={method.id}>
              <Td className="font-medium">{method.name}</Td>
              <Td>{method.kind}</Td>
              <Td className="text-right">
                <Badge tone={method.countedInDrawer ? 'info' : 'neutral'}>
                  {method.countedInDrawer ? 'Counted' : 'Not counted'}
                </Badge>
              </Td>
              <StatusCell active={method.active} />
              <EditCell
                onClick={() =>
                  setEditing({
                    id: method.id,
                    title: `Edit ${method.name}`,
                    fields: [
                      { name: 'code', label: 'Code', initial: method.code, required: true },
                      { name: 'name', label: 'Name', initial: method.name, required: true },
                      {
                        name: 'kind',
                        label: 'Kind',
                        type: 'select',
                        initial: method.kind,
                        options: ['cash', 'card', 'upi', 'wallet', 'credit', 'bank_transfer'].map((k) => ({
                          value: k,
                          label: k.replace('_', ' '),
                        })),
                      },
                      {
                        name: 'countedInDrawer',
                        label: 'In cash drawer',
                        type: 'checkbox',
                        initial: String(method.countedInDrawer),
                      },
                      activeField(method.active),
                    ],
                  })
                }
              />
            </tr>
          ))}
        </tbody>
      </Table>
      <EditDialog
        target={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await update.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              code: v.code,
              name: v.name,
              kind: v.kind as 'cash' | 'card' | 'upi' | 'wallet' | 'credit' | 'bank_transfer',
              countedInDrawer: v.countedInDrawer === 'true',
              active: v.active === 'true',
            },
          });
        }}
      />
    </Card>
  );
}

function ReasonCodesCard() {
  const actor = useActor();
  const reasons = useReasonCodes(undefined, true);
  const create = useCreateReasonCode();
  const update = useUpdateReasonCode();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const onSubmit = async (v: FormValues) => {
    if (!actor) return;
      await create.mutateAsync({
        usage: (v.usage ?? 'adjustment') as 'cancellation' | 'return' | 'adjustment' | 'damage' | 'discrepancy',
        code: v.code ?? '',
        name: v.name ?? '',
        createdBy: actor.id,
      });
  };

  return (
    <Card>
      <CardHeader title="Reason codes" description="Why stock or cash moved when it was not a sale." />
      <RecordForm
        submitLabel="Add reason"
        pending={create.isPending}
        onSubmit={onSubmit}
        fields={[
          {
            name: 'usage',
            label: 'Usage',
            type: 'select',
            initial: 'adjustment',
            options: ['cancellation', 'return', 'adjustment', 'damage', 'discrepancy'].map((u) => ({
              value: u,
              label: u,
            })),
          },
          { name: 'code', label: 'Code', required: true, placeholder: 'THEFT' },
          { name: 'name', label: 'Name', required: true, placeholder: 'Suspected theft', span: 2 },
        ]}
      />
      <Table>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th className="text-right">Usage</Th>
            <Th className="text-right">Status</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(reasons.data ?? []).map((reason) => (
            <tr key={reason.id}>
              <Td className="font-medium">{reason.code}</Td>
              <Td>{reason.name}</Td>
              <Td className="text-right">
                <Badge>{reason.usage}</Badge>
              </Td>
              <StatusCell active={reason.active} />
              <EditCell
                onClick={() =>
                  setEditing({
                    id: reason.id,
                    title: `Edit ${reason.code}`,
                    fields: [
                      {
                        name: 'usage',
                        label: 'Usage',
                        type: 'select',
                        initial: reason.usage,
                        options: ['cancellation', 'return', 'adjustment', 'damage', 'discrepancy'].map((u) => ({
                          value: u,
                          label: u,
                        })),
                      },
                      { name: 'code', label: 'Code', initial: reason.code, required: true },
                      { name: 'name', label: 'Name', initial: reason.name, required: true, span: 2 },
                      activeField(reason.active),
                    ],
                  })
                }
              />
            </tr>
          ))}
        </tbody>
      </Table>
      <EditDialog
        target={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await update.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              usage: v.usage as 'cancellation' | 'return' | 'adjustment' | 'damage' | 'discrepancy',
              code: v.code,
              name: v.name,
              active: v.active === 'true',
            },
          });
        }}
      />
    </Card>
  );
}

function CustomersCard() {
  const actor = useActor();
  const customers = useCustomers(true);
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const onSubmit = async (v: FormValues) => {
    if (!actor) return;
      await create.mutateAsync({
        name: v.name ?? '',
        phone: v.phone || undefined,
        email: v.email || undefined,
        gstin: v.gstin || undefined,
        creditLimit: Number(v.creditLimit) || 0,
        createdBy: actor.id,
      });
  };

  return (
    <Card>
      <CardHeader title="Customers" />
      <RecordForm
        submitLabel="Add customer"
        pending={create.isPending}
        onSubmit={onSubmit}
        fields={[
          { name: 'name', label: 'Name', required: true, span: 2 },
          { name: 'phone', label: 'Phone' },
          { name: 'email', label: 'Email' },
          { name: 'gstin', label: 'GSTIN', span: 2 },
          { name: 'creditLimit', label: 'Credit limit', initial: '0' },
        ]}
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>GSTIN</Th>
            <Th className="text-right">Credit limit</Th>
            <Th className="text-right">Status</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(customers.data ?? []).map((customer) => (
            <tr key={customer.id}>
              <Td className="font-medium">{customer.name}</Td>
              <Td className="text-muted-foreground">{customer.phone ?? '—'}</Td>
              <Td className="text-xs text-muted-foreground">{customer.gstin ?? '—'}</Td>
              <Td className="tabular text-right">{money(customer.creditLimit)}</Td>
              <StatusCell active={customer.active} />
              <EditCell
                onClick={() =>
                  setEditing({
                    id: customer.id,
                    title: `Edit ${customer.name}`,
                    fields: [
                      { name: 'name', label: 'Name', initial: customer.name, required: true, span: 2 },
                      { name: 'phone', label: 'Phone', initial: customer.phone ?? '' },
                      { name: 'email', label: 'Email', initial: customer.email ?? '' },
                      { name: 'gstin', label: 'GSTIN', initial: customer.gstin ?? '', span: 2 },
                      { name: 'creditLimit', label: 'Credit limit', initial: String(customer.creditLimit) },
                      activeField(customer.active),
                    ],
                  })
                }
              />
            </tr>
          ))}
        </tbody>
      </Table>
      <EditDialog
        target={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await update.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              name: v.name,
              phone: v.phone || undefined,
              email: v.email || undefined,
              gstin: v.gstin || undefined,
              creditLimit: Number(v.creditLimit) || 0,
              active: v.active === 'true',
            },
          });
        }}
      />
    </Card>
  );
}

function SuppliersCard() {
  const actor = useActor();
  const suppliers = useSuppliers(true);
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const onSubmit = async (v: FormValues) => {
    if (!actor) return;
      await create.mutateAsync({
        name: v.name ?? '',
        phone: v.phone || undefined,
        email: v.email || undefined,
        gstin: v.gstin || undefined,
        paymentTermsDays: Number(v.paymentTermsDays) || 0,
        createdBy: actor.id,
      });
  };

  return (
    <Card>
      <CardHeader title="Suppliers" />
      <RecordForm
        submitLabel="Add supplier"
        pending={create.isPending}
        onSubmit={onSubmit}
        fields={[
          { name: 'name', label: 'Name', required: true, span: 2 },
          { name: 'phone', label: 'Phone' },
          { name: 'email', label: 'Email' },
          { name: 'gstin', label: 'GSTIN', span: 2 },
          { name: 'paymentTermsDays', label: 'Terms (days)', initial: '0' },
        ]}
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th>GSTIN</Th>
            <Th className="text-right">Terms</Th>
            <Th className="text-right">Status</Th>
            <Th className="w-24 text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(suppliers.data ?? []).map((supplier) => (
            <tr key={supplier.id}>
              <Td className="font-medium">{supplier.name}</Td>
              <Td className="text-muted-foreground">{supplier.phone ?? '—'}</Td>
              <Td className="text-xs text-muted-foreground">{supplier.gstin ?? '—'}</Td>
              <Td className="tabular text-right">{supplier.paymentTermsDays} days</Td>
              <StatusCell active={supplier.active} />
              <EditCell
                onClick={() =>
                  setEditing({
                    id: supplier.id,
                    title: `Edit ${supplier.name}`,
                    fields: [
                      { name: 'name', label: 'Name', initial: supplier.name, required: true, span: 2 },
                      { name: 'phone', label: 'Phone', initial: supplier.phone ?? '' },
                      { name: 'email', label: 'Email', initial: supplier.email ?? '' },
                      { name: 'gstin', label: 'GSTIN', initial: supplier.gstin ?? '', span: 2 },
                      {
                        name: 'paymentTermsDays',
                        label: 'Terms (days)',
                        initial: String(supplier.paymentTermsDays),
                      },
                      activeField(supplier.active),
                    ],
                  })
                }
              />
            </tr>
          ))}
        </tbody>
      </Table>
      <EditDialog
        target={editing}
        pending={update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await update.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              name: v.name,
              phone: v.phone || undefined,
              email: v.email || undefined,
              gstin: v.gstin || undefined,
              paymentTermsDays: Number(v.paymentTermsDays) || 0,
              active: v.active === 'true',
            },
          });
        }}
      />
    </Card>
  );
}
