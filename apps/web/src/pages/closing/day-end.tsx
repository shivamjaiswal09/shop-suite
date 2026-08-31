import { CASH_VARIANCE_TOLERANCE } from '@shop/core';
import {
  useApproveClosing,
  useClosingPreview,
  useClosings,
  useSessionStore,
  useSubmitClosing,
} from '@shop/state';
import { Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { DiscrepanciesCard } from './discrepancies-card';
import { money, todayIso } from '@/lib/utils';

const statusTone = {
  open: 'neutral',
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const;

export function DayEndClosingPage() {
  const store = useSessionStore((s) => s.store);
  const user = useSessionStore((s) => s.user);
  const counterId = useSessionStore((s) => s.counterId);

  const [businessDate, setBusinessDate] = useState(todayIso());
  const [physicalCash, setPhysicalCash] = useState('');
  const [deposited, setDeposited] = useState('');
  const [carriedForward, setCarriedForward] = useState('');
  const [note, setNote] = useState('');

  const request = store ? { storeId: store.id, counterId, businessDate } : undefined;
  const preview = useClosingPreview(request);
  const closings = useClosings(store?.id);
  const submit = useSubmitClosing();
  const approve = useApproveClosing();

  // Pre-fill the drawer count with what the ledger expects — the cashier edits it.
  useEffect(() => {
    if (preview.data && physicalCash === '') setPhysicalCash(String(preview.data.expectedCash));
  }, [preview.data, physicalCash]);

  const expectedCash = preview.data?.expectedCash ?? 0;
  const counted = Number(physicalCash) || 0;
  const variance = Math.round((counted - expectedCash) * 100) / 100;
  const existing = preview.data?.existing;
  const locked = existing?.status === 'approved';

  const onSubmit = () => {
    if (!store || !user || !preview.data) return;
    submit.mutate({
      storeId: store.id,
      counterId,
      businessDate,
      openingCash: preview.data.openingCash,
      physicalCash: counted,
      depositedAmount: Number(deposited) || 0,
      carriedForward: Number(carriedForward) || 0,
      note: note || undefined,
      submittedBy: user.id,
    });
  };

  return (
    <>
      <PageHeader
        title="Day-End Closing"
        description={`${store?.name ?? ''} · counter ${counterId}`}
        actions={
          <div>
            <Label htmlFor="bd">Business date</Label>
            <Input
              id="bd"
              type="date"
              value={businessDate}
              onChange={(e) => {
                setBusinessDate(e.target.value);
                setPhysicalCash('');
              }}
            />
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Invoices" value={String(preview.data?.invoiceCount ?? 0)} />
        <Stat label="Total sales" value={money(preview.data?.totalSales ?? 0)} />
        <Stat label="Opening cash" value={money(preview.data?.openingCash ?? 0)} />
        <Stat
          label="Cash variance"
          value={money(variance)}
          tone={Math.abs(variance) > CASH_VARIANCE_TOLERANCE ? 'danger' : 'success'}
          hint={Math.abs(variance) > CASH_VARIANCE_TOLERANCE ? 'Raises a discrepancy' : 'Within tolerance'}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Sales by payment method"
              description="Grouped from successful payments captured on this business day."
            />
            <Table>
              <thead>
                <tr>
                  <Th>Method</Th>
                  <Th>Drawer</Th>
                  <Th className="text-right">Txns</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {(preview.data?.salesByMethod ?? []).length === 0 ? (
                  <EmptyRow colSpan={4}>No payments captured for {businessDate}.</EmptyRow>
                ) : (
                  preview.data!.salesByMethod.map((row) => (
                    <tr key={row.paymentMethodId}>
                      <Td className="font-medium">{row.paymentMethodName}</Td>
                      <Td>
                        {row.countedInDrawer ? (
                          <Badge tone="info">Counted in drawer</Badge>
                        ) : (
                          <Badge>Bank / digital</Badge>
                        )}
                      </Td>
                      <Td className="tabular text-right">{row.txnCount}</Td>
                      <Td className="tabular text-right font-medium">{money(row.amount)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Closing history" />
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Counter</Th>
                  <Th className="text-right">Expected</Th>
                  <Th className="text-right">Counted</Th>
                  <Th className="text-right">Variance</Th>
                  <Th className="text-right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {(closings.data ?? []).length === 0 ? (
                  <EmptyRow colSpan={6}>No day has been closed yet.</EmptyRow>
                ) : (
                  closings.data!.map((closing) => (
                    <tr key={closing.id}>
                      <Td className="font-medium">{closing.businessDate}</Td>
                      <Td>{closing.counterId}</Td>
                      <Td className="tabular text-right">{money(closing.expectedCash)}</Td>
                      <Td className="tabular text-right">{money(closing.physicalCash)}</Td>
                      <Td
                        className={`tabular text-right font-medium ${
                          closing.variance === 0 ? '' : 'text-destructive'
                        }`}
                      >
                        {money(closing.variance)}
                      </Td>
                      <Td className="text-right">
                        <Badge tone={statusTone[closing.status]}>{closing.status}</Badge>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>

          <DiscrepanciesCard storeId={store?.id} />
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Cash reconciliation"
            description={locked ? 'This day is locked.' : 'Count the drawer and submit.'}
          />
          <CardBody className="space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening cash</span>
                <span className="tabular">{money(preview.data?.openingCash ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash sales</span>
                <span className="tabular">
                  {money(
                    (preview.data?.salesByMethod ?? [])
                      .filter((s) => s.countedInDrawer)
                      .reduce((sum, s) => sum + s.amount, 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Expected in drawer</span>
                <span className="tabular">{money(expectedCash)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="physical">Physical cash counted</Label>
              <Input
                id="physical"
                className="tabular"
                value={physicalCash}
                disabled={locked}
                onChange={(e) => setPhysicalCash(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="deposited">Deposited</Label>
                <Input
                  id="deposited"
                  className="tabular"
                  value={deposited}
                  disabled={locked}
                  onChange={(e) => setDeposited(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="carry">Carried forward</Label>
                <Input
                  id="carry"
                  className="tabular"
                  value={carriedForward}
                  disabled={locked}
                  onChange={(e) => setCarriedForward(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                value={note}
                disabled={locked}
                placeholder="Optional"
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span>Variance</span>
              <span
                className={`tabular font-semibold ${
                  Math.abs(variance) > CASH_VARIANCE_TOLERANCE ? 'text-destructive' : 'text-success'
                }`}
              >
                {money(variance)}
              </span>
            </div>

            {submit.error ? (
              <p className="text-xs text-destructive">{(submit.error as Error).message}</p>
            ) : null}

            <Button className="w-full" disabled={locked || submit.isPending} onClick={onSubmit}>
              <Lock className="h-4 w-4" />
              {submit.isPending ? 'Submitting…' : 'Submit day-end'}
            </Button>

            {existing && existing.status === 'submitted' ? (
              <Button
                variant="success"
                className="w-full"
                disabled={approve.isPending}
                onClick={() => user && approve.mutate({ closingId: existing.id, approvedBy: user.id })}
              >
                <ShieldCheck className="h-4 w-4" />
                Approve & lock day
              </Button>
            ) : null}

            {locked ? (
              <p className="text-xs text-success">
                Locked by supervisor — no further invoices can be dated into {businessDate}.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
