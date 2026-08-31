import { useInvoices, useSessionStore } from '@shop/state';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { InvoiceDetail } from './invoice-detail';
import { money, shortTime, todayIso } from '@/lib/utils';

const statusTone = {
  paid: 'success',
  partially_paid: 'warning',
  unpaid: 'danger',
  cancelled: 'neutral',
  returned: 'neutral',
} as const;

type StatusFilter = 'all' | 'unpaid' | 'partially_paid' | 'paid';

export function InvoicesPage() {
  const store = useSessionStore((s) => s.store);
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const invoices = useInvoices({
    storeId: store?.id,
    businessDate: date,
    status: status === 'all' ? undefined : status,
  });

  const rows = invoices.data ?? [];
  const total = rows.reduce((sum, i) => sum + i.totals.grandTotal, 0);
  const outstanding = rows.reduce((sum, i) => sum + i.amountDue, 0);
  const selected = rows.find((i) => i.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Invoices"
        description={`${rows.length} invoices · ${money(total)} billed · ${money(outstanding)} outstanding`}
        actions={
          <>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                className="w-40"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
              >
                <option value="all">All</option>
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially paid</option>
                <option value="paid">Paid</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="date">Business date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </>
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Time</Th>
              <Th>Customer</Th>
              <Th className="text-right">Lines</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Due</Th>
              <Th className="text-right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.isLoading ? (
              <EmptyRow colSpan={8}>Loading…</EmptyRow>
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={8}>No invoices for {date}.</EmptyRow>
            ) : (
              rows.map((invoice) => (
                <tr
                  key={invoice.id}
                  onClick={() => setSelectedId(invoice.id)}
                  className="cursor-pointer transition-colors hover:bg-muted"
                >
                  <Td className="font-medium">{invoice.number}</Td>
                  <Td className="text-muted-foreground">{shortTime(invoice.createdAt)}</Td>
                  <Td>{invoice.customerName ?? 'Walk-in Customer'}</Td>
                  <Td className="tabular text-right">{invoice.lines.length}</Td>
                  <Td className="tabular text-right font-medium">{money(invoice.totals.grandTotal)}</Td>
                  <Td className="tabular text-right">{money(invoice.amountPaid)}</Td>
                  <Td
                    className={`tabular text-right ${invoice.amountDue > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                  >
                    {money(invoice.amountDue)}
                  </Td>
                  <Td className="text-right">
                    <Badge tone={statusTone[invoice.status]}>{invoice.status.replace('_', ' ')}</Badge>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <InvoiceDetail invoice={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
