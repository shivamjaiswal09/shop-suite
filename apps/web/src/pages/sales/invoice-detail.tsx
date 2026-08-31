import type { Invoice } from '@shop/core';
import {
  useCapturePayment,
  useInvoicePayments,
  usePaymentMethods,
  useSessionStore,
} from '@shop/state';
import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, Td, Th } from '@/components/ui/table';
import { money, qty as fmtQty, shortTime } from '@/lib/utils';

/**
 * Invoice detail with payment capture. A capture carries an idempotency key
 * derived from the invoice and the number of payments already on it, so a
 * double-click or a retry can never take the money twice.
 */
export function InvoiceDetail({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const user = useSessionStore((s) => s.user);
  const methods = usePaymentMethods();
  const payments = useInvoicePayments(invoice?.id);
  const capture = useCapturePayment();

  const [methodId, setMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const due = invoice?.amountDue ?? 0;

  useEffect(() => {
    setAmount(due > 0 ? String(due) : '');
    setError(null);
  }, [invoice?.id, due]);

  const close = () => {
    setReference('');
    setError(null);
    onClose();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!invoice || !user) return;
    setError(null);

    const value = Number(amount);
    const selected = methodId || methods.data?.[0]?.id;
    if (!selected) return;
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (value > due) {
      setError(`Only ${money(due)} is outstanding.`);
      return;
    }

    try {
      await capture.mutateAsync({
        invoiceId: invoice.id,
        paymentMethodId: selected,
        amount: value,
        reference: reference || undefined,
        // Keyed on what has already been paid, which comes from the invoice
        // itself — so a double-click dedupes, but a genuine second tender does
        // not. Deriving it from the payments list would be wrong while that
        // query is still loading.
        idempotencyKey: `${invoice.id}:settle:${invoice.amountPaid}`,
        createdBy: user.id,
      });
      setReference('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  if (!invoice) return null;

  const methodName = (id: string) => methods.data?.find((m) => m.id === id)?.name ?? id;

  return (
    <Modal
      open
      title={`Invoice ${invoice.number}`}
      description={`${invoice.businessDate} · ${shortTime(invoice.createdAt)} · ${invoice.customerName ?? 'Walk-in Customer'}`}
      onClose={close}
      footer={
        <Button variant="outline" onClick={close}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Tax</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <Td>
                    <p className="font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{line.skuCode}</p>
                  </Td>
                  <Td className="tabular text-right">{fmtQty(line.qty)}</Td>
                  <Td className="tabular text-right">{money(line.unitPrice)}</Td>
                  <Td className="tabular text-right text-muted-foreground">{money(line.taxAmount)}</Td>
                  <Td className="tabular text-right font-medium">{money(line.lineTotal)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 text-sm">
            <Row label="Taxable value" value={money(invoice.totals.taxableValue)} />
            <Row label="Tax" value={money(invoice.totals.taxTotal)} />
            <Row label="Round off" value={money(invoice.totals.roundOff)} />
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Grand total</span>
              <span className="tabular">{money(invoice.totals.grandTotal)}</span>
            </div>
            <Row label="Paid" value={money(invoice.amountPaid)} />
            <div className="flex justify-between font-medium">
              <span>Due</span>
              <span className={`tabular ${due > 0 ? 'text-destructive' : 'text-success'}`}>
                {money(due)}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Payments</p>
            {(payments.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing captured yet.</p>
            ) : (
              <div className="space-y-1.5">
                {payments.data!.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      {methodName(payment.paymentMethodId)}
                      <Badge tone={payment.status === 'success' ? 'success' : 'warning'}>
                        {payment.status}
                      </Badge>
                    </span>
                    <span className="tabular">{money(payment.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {due > 0 ? (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 rounded-md border border-border p-4">
            <p className="text-sm font-medium">Capture payment</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="method">Method</Label>
                <Select id="method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                  {(methods.data ?? []).map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  className="tabular"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ref">Reference</Label>
                <Input
                  id="ref"
                  value={reference}
                  placeholder="UPI txn id"
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <Button type="submit" disabled={capture.isPending}>
              {capture.isPending ? 'Capturing…' : `Capture ${money(Number(amount) || 0)}`}
            </Button>
          </form>
        ) : (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            Fully settled — nothing outstanding.
          </p>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
