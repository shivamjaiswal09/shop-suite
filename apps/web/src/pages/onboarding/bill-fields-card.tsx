import { BUILTIN_FIELDS, type BillFieldConfig } from '@shop/core';
import { useBillFields, useCreateBillField, useSessionStore, useUpdateBillField } from '@shop/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { RecordForm } from './record-form';

/**
 * What the till asks a customer for.
 *
 * Built-ins are offered as one-click additions rather than typed out, because
 * they drive real columns on `Customer` — `phone` in particular is the indexed
 * lookup that finds a returning customer, and a custom field also called
 * "Phone" would quietly lose that.
 */
export function BillFieldsCard() {
  const user = useSessionStore((s) => s.user);
  const fields = useBillFields(true);
  const create = useCreateBillField();
  const update = useUpdateBillField();

  const configured = fields.data ?? [];
  const unusedBuiltins = BUILTIN_FIELDS.filter(
    (b) => !configured.some((f) => f.builtin === b.builtin),
  );

  const toggle = (field: BillFieldConfig, patch: { required?: boolean; active?: boolean }) => {
    if (!user) return;
    update.mutate({ id: field.id, patch, actorId: user.id });
  };

  return (
    <Card>
      <CardHeader
        title="Bill fields"
        description="What the counter asks a customer for. Nothing here means billing asks only for an optional name."
      />

      {unusedBuiltins.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <span className="text-xs text-muted-foreground">Add a standard field:</span>
          {unusedBuiltins.map((b) => (
            <Button
              key={b.builtin}
              size="sm"
              variant="outline"
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  builtin: b.builtin,
                  key: b.key,
                  label: b.label,
                  scope: b.scope,
                  type: b.type,
                  sortOrder: configured.length * 10,
                })
              }
            >
              + {b.label}
            </Button>
          ))}
        </div>
      ) : null}

      <RecordForm
        fields={[
          { name: 'label', label: 'Label', required: true, placeholder: 'Vehicle number' },
          { name: 'key', label: 'Key', required: true, placeholder: 'vehicle_number' },
          {
            name: 'scope',
            label: 'Belongs to',
            type: 'select',
            options: [
              { value: 'sale', label: 'This sale' },
              { value: 'customer', label: 'The customer' },
            ],
          },
          {
            name: 'type',
            label: 'Type',
            type: 'select',
            options: [
              { value: 'text', label: 'Text' },
              { value: 'number', label: 'Number' },
              { value: 'phone', label: 'Phone' },
            ],
          },
        ]}
        submitLabel="Add field"
        pending={create.isPending}
        onSubmit={async (values) => {
          await create.mutateAsync({
            key: values.key!,
            label: values.label!,
            scope: (values.scope as BillFieldConfig['scope']) || 'sale',
            type: (values.type as BillFieldConfig['type']) || 'text',
            sortOrder: configured.length * 10,
          });
        }}
      />

      <Table>
        <thead>
          <tr>
            <Th>Label</Th>
            <Th>Key</Th>
            <Th>Belongs to</Th>
            <Th>Required</Th>
            <Th className="text-right">Status</Th>
          </tr>
        </thead>
        <tbody>
          {configured.length === 0 ? (
            <EmptyRow colSpan={5}>
              No fields configured — the counter asks only for a name.
            </EmptyRow>
          ) : (
            configured.map((field) => (
              <tr key={field.id} className={field.active ? undefined : 'opacity-50'}>
                <Td className="font-medium">{field.label}</Td>
                <Td className="text-xs text-muted-foreground">{field.key}</Td>
                <Td>
                  <Badge tone={field.scope === 'customer' ? 'info' : 'neutral'}>
                    {field.scope === 'customer' ? 'the customer' : 'this sale'}
                  </Badge>
                </Td>
                <Td>
                  <Button
                    size="sm"
                    variant={field.required ? 'default' : 'outline'}
                    onClick={() => toggle(field, { required: !field.required })}
                  >
                    {field.required ? 'Required' : 'Optional'}
                  </Button>
                </Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle(field, { active: !field.active })}
                  >
                    {field.active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}
