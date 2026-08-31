import { returnableLines, calcRefund, type Invoice } from '@shop/core';
import {
  useCreateSalesReturn,
  useInvoices,
  usePaymentMethods,
  useReasonCodes,
  useSalesReturns,
  useSessionStore,
} from '@shop/state';
import { Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { money, qty as fmtQty, shortDateTime, todayIso } from '@/lib/utils';

/**
 * Returns put goods back on the shelf they were sold from and, when a tender is
 * chosen, write a negative payment — so the drawer and day-end net out on their
 * own rather than needing a separate adjustment.
 */
export function ReturnsPage() {
  const store = useSessionStore((s) => s.store);
  const [date, setDate] = useState(todayIso());
  const [target, setTarget] = useState<Invoice | null>(null);

  const invoices = useInvoices({ storeId: store?.id, businessDate: date });
  const returns = useSalesReturns({ storeId: store?.id });

  const refundedByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    for (const ret of returns.data ?? []) {
      map.set(ret.invoiceId, (map.get(ret.invoiceId) ?? 0) + ret.refundTotal);
    }
    return map;
  }, [returns.data]);

  return (
    <>
      <PageHeader
        title="Returns"
        description="Take goods back against an invoice, restore stock and refund the customer."
        actions={
          <div>
            <Label htmlFor="ret-date">Invoice date</Label>
            <Input id="ret-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Invoices" description="Pick one to return against." />
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Refunded</Th>
                <Th className="w-24 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(invoices.data ?? []).length === 0 ? (
                <EmptyRow colSpan={5}>No invoices on {date}.</EmptyRow>
              ) : (
                invoices.data!.map((invoice) => (
                  <tr key={invoice.id}>
                    <Td className="font-medium">{invoice.number}</Td>
                    <Td>{invoice.customerName ?? 'Walk-in Customer'}</Td>
                    <Td className="tabular text-right">{money(invoice.totals.grandTotal)}</Td>
                    <Td className="tabular text-right text-muted-foreground">
                      {money(refundedByInvoice.get(invoice.id) ?? 0)}
                    </Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setTarget(invoice)}>
                        <Undo2 className="h-3.5 w-3.5" /> Return
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Recent returns" description={`${returns.data?.length ?? 0} recorded`} />
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>When</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Refund</Th>
              </tr>
            </thead>
            <tbody>
              {(returns.data ?? []).length === 0 ? (
                <EmptyRow colSpan={4}>Nothing returned yet.</EmptyRow>
              ) : (
                returns.data!.map((ret) => (
                  <tr key={ret.id}>
                    <Td className="font-medium">{ret.number}</Td>
                    <Td className="text-muted-foreground">{shortDateTime(ret.createdAt)}</Td>
                    <Td className="tabular text-right">{ret.lines.length}</Td>
                    <Td className="tabular text-right font-medium">{money(ret.refundTotal)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <ReturnDialog invoice={target} onClose={() => setTarget(null)} />
    </>
  );
}

function ReturnDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const user = useSessionStore((s) => s.user);
  const reasons = useReasonCodes('return');
  const methods = usePaymentMethods();
  const priorReturns = useSalesReturns({ invoiceId: invoice?.id });
  const create = useCreateSalesReturn();

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasonCodeId, setReasonCodeId] = useState('');
  const [refundMethodId, setRefundMethodId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(
    () => (invoice ? returnableLines(invoice, priorReturns.data ?? []) : []),
    [invoice, priorReturns.data],
  );

  const requested = lines
    .map((line) => ({ skuId: line.skuId, qty: Number(quantities[line.skuId]) || 0 }))
    .filter((line) => line.qty > 0);

  const refund = calcRefund(lines, requested);

  if (!invoice) return null;

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    if (requested.length === 0) {
      setError('Enter a quantity on at least one line.');
      return;
    }
    try {
      await create.mutateAsync({
        invoiceId: invoice.id,
        reasonCodeId: reasonCodeId || (reasons.data ?? [])[0]?.id || '',
        lines: requested,
        refundMethodId: refundMethodId || undefined,
        createdBy: user.id,
      });
      setQuantities({});
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <Modal
      open
      title={`Return against ${invoice.number}`}
      description="Only what was billed, and not already returned, may come back."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            {create.isPending ? 'Recording…' : `Return ${money(refund)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Billed</Th>
                <Th className="text-right">Already back</Th>
                <Th className="text-right">Eligible</Th>
                <Th className="w-28 text-right">Return</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.skuId}>
                  <Td>
                    <p className="font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.skuCode} · {money(line.unitRefund)} each
                    </p>
                  </Td>
                  <Td className="tabular text-right">{fmtQty(line.billedQty)}</Td>
                  <Td className="tabular text-right text-muted-foreground">
                    {fmtQty(line.returnedQty)}
                  </Td>
                  <Td className="tabular text-right font-medium">{fmtQty(line.remainingQty)}</Td>
                  <Td className="text-right">
                    <Input
                      className="tabular h-8 w-20 text-right"
                      disabled={line.remainingQty <= 0}
                      value={quantities[line.skuId] ?? ''}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [line.skuId]: e.target.value }))
                      }
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Select id="reason" value={reasonCodeId} onChange={(e) => setReasonCodeId(e.target.value)}>
              {(reasons.data ?? []).map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="refund">Refund on</Label>
            <Select
              id="refund"
              value={refundMethodId}
              onChange={(e) => setRefundMethodId(e.target.value)}
            >
              <option value="">No refund (record only)</option>
              {(methods.data ?? []).map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span>Refund total</span>
          <span className="tabular font-semibold">{money(refund)}</span>
        </div>
        {refundMethodId ? (
          <p className="text-xs text-muted-foreground">
            Recorded as a negative payment, so day-end cash and sales-by-method net out on their own.
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Badge tone="neutral">Stock returns to {invoice.customerName ? 'the shelf' : 'the shelf'}</Badge>
      </div>
    </Modal>
  );
}
