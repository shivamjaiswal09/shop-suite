import { roundMoney, type Invoice } from '@shop/core';
import {
  useCan,
  useCancelInvoice,
  useBillFields,
  useCapturePayment,
  useCorrectPayment,
  useDeleteInvoice,
  useInvoicePayments,
  usePaymentMethods,
  usePrintInvoice,
  useSessionStore,
} from '@shop/state';
import { X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { CapturedDetails } from './captured-details';
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
  // Labels are resolved at display time; see CapturedDetails.
  const billFields = useBillFields(true);
  const capture = useCapturePayment();

  /**
   * One row per tender. A customer paying half in cash and half by UPI is one
   * settlement, not two visits to the form — and entering it as two separate
   * captures means the second is typed against a due figure that moved.
   */
  const [tenders, setTenders] = useState<Draft[]>([EMPTY_TENDER]);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the permission the API enforces. Hiding these is courtesy, not
  // security — the endpoints check `admin.manage` themselves.
  const isAdmin = useCan('admin.manage');
  const cancelInvoice = useCancelInvoice();
  const deleteInvoice = useDeleteInvoice();
  const print = usePrintInvoice();

  // Correcting money already taken. Admin-only, and the API says so too.
  const correct = useCorrectPayment();
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [fix, setFix] = useState({ methodId: '', amount: '', reference: '' });
  const [fixError, setFixError] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState<'none' | 'cancel' | 'delete'>('none');
  const [note, setNote] = useState('');
  const [confirmNumber, setConfirmNumber] = useState('');

  const due = invoice?.amountDue ?? 0;

  const setTender = (index: number, patch: Partial<Draft>) =>
    setTenders((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  /** What the rows currently add up to, and what that leaves outstanding. */
  const entered = roundMoney(
    tenders.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
  );
  const remaining = roundMoney(due - entered);

  useEffect(() => {
    // One row, pre-filled with the whole balance: the common settlement is a
    // single tender for everything, and splitting is a click away.
    setTenders([{ ...EMPTY_TENDER, amount: due > 0 ? String(due) : '' }]);
    setError(null);
    // Reset per invoice, so a confirmation typed for one bill can never be
    // still sitting in the field when another is opened.
    setAdminMode('none');
    setNote('');
    setConfirmNumber('');
  }, [invoice?.id, due]);

  const close = () => {
    setError(null);
    setAdminMode('none');
    onClose();
  };

  const runAdminAction = async () => {
    if (!invoice) return;
    setError(null);
    try {
      if (adminMode === 'cancel') {
        await cancelInvoice.mutateAsync({ id: invoice.id, note: note.trim() || undefined });
      } else {
        await deleteInvoice.mutateAsync({ id: invoice.id, confirmNumber });
      }
      close();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const adminBusy = cancelInvoice.isPending || deleteInvoice.isPending;

  const onCorrect = async (event: FormEvent, paymentId: string) => {
    event.preventDefault();
    if (!invoice || !user) return;
    setFixError(null);

    const value = Number(fix.amount);
    if (!Number.isFinite(value) || value <= 0) {
      setFixError('Enter an amount greater than zero.');
      return;
    }
    if (!fix.methodId) return;

    try {
      await correct.mutateAsync({
        invoiceId: invoice.id,
        paymentId,
        paymentMethodId: fix.methodId,
        amount: value,
        reference: fix.reference || undefined,
        createdBy: user.id,
      });
      setCorrecting(null);
    } catch (cause) {
      setFixError((cause as Error).message);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!invoice || !user) return;
    setError(null);

    const fallbackMethod = methods.data?.[0]?.id;
    const rows = tenders
      .map((row) => ({
        paymentMethodId: row.methodId || fallbackMethod || '',
        amount: Number(row.amount),
        reference: row.reference.trim() || undefined,
      }))
      // A blank row is somebody who clicked Add and changed their mind, not an
      // error worth stopping the settlement for.
      .filter((row) => row.amount !== 0 || row.reference !== undefined);

    if (rows.length === 0) {
      setError('Enter an amount to capture.');
      return;
    }
    if (rows.some((row) => !row.paymentMethodId)) return;
    if (rows.some((row) => !Number.isFinite(row.amount) || row.amount <= 0)) {
      setError('Every tender needs an amount greater than zero.');
      return;
    }

    const total = roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
    if (total > due) {
      setError(`That comes to ${money(total)}, and only ${money(due)} is outstanding.`);
      return;
    }

    try {
      // Keys derived once, before anything is written: each is keyed on what
      // had been paid when the form was submitted plus the row's position, so
      // re-submitting the same split dedupes row for row, while a genuine
      // second settlement later keys differently.
      const paidBefore = invoice.amountPaid;
      for (const [index, row] of rows.entries()) {
        await capture.mutateAsync({
          invoiceId: invoice.id,
          ...row,
          idempotencyKey: `${invoice.id}:settle:${paidBefore}:${index}`,
          createdBy: user.id,
        });
      }
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
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={print.isPending}
              // No copy named: the sheet comes back with both, which is what
              // a counter hands over and files.
              onClick={() => print.mutate({ id: invoice.id })}
            >
              {print.isPending ? 'Preparing…' : 'Print bill'}
            </Button>
            {print.error ? (
              <span className="text-sm text-destructive">{(print.error as Error).message}</span>
            ) : null}
          </div>
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </div>
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

        {/* Above the totals: a reprint is usually pulled up to check who a bill
            was for, not what it added up to. */}
        <CapturedDetails
          invoice={invoice}
          fields={billFields.data ?? []}
          className="space-y-1.5 rounded-md border border-border p-3"
        />

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
                  <div key={payment.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {methodName(payment.paymentMethodId)}
                        <Badge tone={payment.status === 'success' ? 'success' : 'warning'}>
                          {paymentLabel(payment)}
                        </Badge>
                        {/* Only a live capture can be corrected. A negative row is
                            the reversal of one, and a refunded row already has its
                            reversal sitting beside it. */}
                        {isAdmin &&
                        payment.amount > 0 &&
                        payment.status === 'success' &&
                        invoice.status !== 'cancelled' ? (
                          <button
                            type="button"
                            className="text-xs text-primary underline-offset-2 hover:underline"
                            onClick={() => {
                              setCorrecting(payment.id);
                              setFix({
                                methodId: payment.paymentMethodId,
                                amount: String(payment.amount),
                                reference: payment.reference ?? '',
                              });
                              setFixError(null);
                            }}
                          >
                            Correct
                          </button>
                        ) : null}
                      </span>
                      <span className={`tabular ${payment.amount < 0 ? 'text-muted-foreground' : ''}`}>
                        {money(payment.amount)}
                      </span>
                    </div>

                    {correcting === payment.id ? (
                      <form
                        onSubmit={(e) => void onCorrect(e, payment.id)}
                        className="space-y-2 rounded-md border border-border p-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          The money stays taken. This reverses it off{' '}
                          {methodName(payment.paymentMethodId)} and books it again as entered below,
                          on the same business day.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div>
                            <Label htmlFor={`fix-method-${payment.id}`}>Method</Label>
                            <Select
                              id={`fix-method-${payment.id}`}
                              value={fix.methodId}
                              onChange={(e) => setFix((f) => ({ ...f, methodId: e.target.value }))}
                            >
                              {(methods.data ?? []).map((method) => (
                                <option key={method.id} value={method.id}>
                                  {method.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`fix-amount-${payment.id}`}>Amount</Label>
                            <Input
                              id={`fix-amount-${payment.id}`}
                              className="tabular"
                              value={fix.amount}
                              onChange={(e) => setFix((f) => ({ ...f, amount: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`fix-ref-${payment.id}`}>Reference</Label>
                            <Input
                              id={`fix-ref-${payment.id}`}
                              value={fix.reference}
                              placeholder="UPI txn id"
                              onChange={(e) => setFix((f) => ({ ...f, reference: e.target.value }))}
                            />
                          </div>
                        </div>
                        {fixError ? <p className="text-xs text-destructive">{fixError}</p> : null}
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={correct.isPending}>
                            {correct.isPending ? 'Correcting…' : 'Save correction'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setCorrecting(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {due > 0 ? (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 rounded-md border border-border p-4">
            <p className="text-sm font-medium">Capture payment</p>

            {tenders.map((tender, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  <Label htmlFor={`method-${index}`}>Method</Label>
                  <Select
                    id={`method-${index}`}
                    value={tender.methodId}
                    onChange={(e) => setTender(index, { methodId: e.target.value })}
                  >
                    {(methods.data ?? []).map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`amount-${index}`}>Amount</Label>
                  <Input
                    id={`amount-${index}`}
                    className="tabular"
                    value={tender.amount}
                    onChange={(e) => setTender(index, { amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`ref-${index}`}>Reference</Label>
                  <Input
                    id={`ref-${index}`}
                    value={tender.reference}
                    placeholder="UPI txn id"
                    onChange={(e) => setTender(index, { reference: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  {/* The last row is never removable — a form with no rows has
                      nothing to type into and no way back. */}
                  {tenders.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove tender ${index + 1}`}
                      onClick={() => setTenders((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() =>
                  setTenders((prev) => [
                    ...prev,
                    // Pre-filled with what is still short, which is what the
                    // second tender almost always is.
                    { ...EMPTY_TENDER, amount: remaining > 0 ? String(remaining) : '' },
                  ])
                }
              >
                + Split across another method
              </button>
              <span className={`tabular ${remaining < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {remaining === 0
                  ? 'Settles the bill in full'
                  : remaining > 0
                    ? `${money(remaining)} still short`
                    : `${money(-remaining)} over the balance`}
              </span>
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <Button type="submit" disabled={capture.isPending || entered <= 0}>
              {capture.isPending ? 'Capturing…' : `Capture ${money(entered)}`}
            </Button>
          </form>
        ) : (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            Fully settled — nothing outstanding.
          </p>
        )}

        {/* Administrative reversal. Cancelling is the ordinary correction and is
            offered first; deleting sits behind a second step because it cannot
            be undone and its consequences are not visible from here. */}
        {isAdmin && invoice.status !== 'cancelled' ? (
          <div className="rounded-md border border-border p-3">
            {adminMode === 'none' ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Reverse this bill — stock returns to the shelf and the payments come back out of
                  the day's takings.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAdminMode('cancel')}>
                    Cancel invoice
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAdminMode('delete')}>
                    Delete
                  </Button>
                </div>
              </div>
            ) : adminMode === 'cancel' ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Cancel {invoice.number}?</p>
                <p className="text-xs text-muted-foreground">
                  The {invoice.lines.length} line(s) go back into stock and {money(invoice.amountPaid)}{' '}
                  is reversed out of the day's payments. The invoice stays in the books marked
                  cancelled, keeping its number.
                </p>
                <div>
                  <Label htmlFor="cancel-note">Reason (optional)</Label>
                  <Input
                    id="cancel-note"
                    placeholder="Billed to the wrong customer"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="destructive" disabled={adminBusy} onClick={() => void runAdminAction()}>
                    {adminBusy ? 'Cancelling…' : 'Cancel this invoice'}
                  </Button>
                  <Button variant="outline" disabled={adminBusy} onClick={() => setAdminMode('none')}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-destructive">Delete {invoice.number}?</p>
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  This erases the invoice, its lines and its payments, and removes the stock
                  movements it wrote. It cannot be reprinted for the customer afterwards, and{' '}
                  <strong>{invoice.number} returns to the pool</strong> — the next sale will be
                  issued with it. Cancelling keeps the record and is almost always the better
                  choice.
                </p>
                <div>
                  <Label htmlFor="confirm-number">Type {invoice.number} to confirm</Label>
                  <Input
                    id="confirm-number"
                    value={confirmNumber}
                    onChange={(e) => setConfirmNumber(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={adminBusy || confirmNumber.trim() !== invoice.number}
                    onClick={() => void runAdminAction()}
                  >
                    {adminBusy ? 'Deleting…' : 'Delete permanently'}
                  </Button>
                  <Button variant="outline" disabled={adminBusy} onClick={() => setAdminMode('none')}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** One tender being entered. Strings, because they come from inputs. */
interface Draft {
  methodId: string;
  amount: string;
  reference: string;
}

const EMPTY_TENDER: Draft = { methodId: '', amount: '', reference: '' };

/**
 * What a payment row is, in a word.
 *
 * A correction leaves three rows behind, two of them `refunded`: the capture it
 * superseded and the negative row that backed it out. Printing the raw status on
 * both reads as "the customer was refunded twice", which is not what happened.
 */
function paymentLabel(payment: { amount: number; status: string }): string {
  if (payment.amount < 0) return 'reversal';
  if (payment.status === 'refunded') return 'corrected';
  return payment.status;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
