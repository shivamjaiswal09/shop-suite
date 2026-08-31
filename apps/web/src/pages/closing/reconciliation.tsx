import type { ReconFinding } from '@shop/core';
import { useReconciliation, useSessionStore } from '@shop/state';
import { CheckCircle2, Coins, Boxes, Receipt } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { todayIso } from '@/lib/utils';

/**
 * Three reconciliations, all derived from the same ledger the app writes to.
 * With an append-only ledger most of these should be permanently empty — which
 * is the point: they are the alarm that says the invariant stopped holding.
 */
export function ReconciliationPage() {
  const store = useSessionStore((s) => s.store);
  const [businessDate, setBusinessDate] = useState(todayIso());
  const { sales, payments, inventory, isLoading } = useReconciliation(store?.id, businessDate);

  const total = sales.length + payments.length + inventory.length;
  const errors = [...sales, ...payments, ...inventory].filter((f) => f.severity === 'error').length;

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description={`${store?.name ?? ''} — sales, payments and stock checked against the movement ledger.`}
        actions={
          <div>
            <Label htmlFor="recon-date">Business date</Label>
            <Input
              id="recon-date"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
            />
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Findings" value={String(total)} tone={total ? 'warning' : 'success'} />
        <Stat label="Must fix" value={String(errors)} tone={errors ? 'danger' : 'default'} />
        <Stat label="Sales checks" value={sales.length === 0 ? 'clean' : String(sales.length)} icon={Receipt} />
        <Stat
          label="Stock checks"
          value={inventory.length === 0 ? 'clean' : String(inventory.length)}
          icon={Boxes}
        />
      </div>

      <div className="space-y-5">
        <FindingsCard
          title="Sales reconciliation"
          description="Every invoice line must have produced a matching `sale` movement."
          clean="Every invoice on this date is backed by ledger movements."
          findings={sales}
          isLoading={isLoading}
        />
        <FindingsCard
          title="Payment reconciliation"
          description="Invoice totals against what was actually captured, refunds included."
          clean="Every invoice on this date is fully settled."
          findings={payments}
          isLoading={isLoading}
        />
        <FindingsCard
          title="Inventory reconciliation"
          description="Negative balances, and stock stranded in transit."
          clean="No negative balances and nothing stuck in transit."
          findings={inventory}
          isLoading={isLoading}
        />
      </div>
    </>
  );
}

function FindingsCard({
  title,
  description,
  clean,
  findings,
  isLoading,
}: {
  title: string;
  description: string;
  clean: string;
  findings: ReconFinding[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          findings.length === 0 && !isLoading ? (
            <Badge tone="success">clean</Badge>
          ) : (
            <Badge tone={findings.some((f) => f.severity === 'error') ? 'danger' : 'warning'}>
              {findings.length}
            </Badge>
          )
        }
      />
      {findings.length === 0 && !isLoading ? (
        <CardBody className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {clean}
        </CardBody>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>What</Th>
              <Th>Detail</Th>
              <Th className="text-right">Expected</Th>
              <Th className="text-right">Actual</Th>
              <Th className="text-right">Variance</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyRow colSpan={5}>Checking…</EmptyRow>
            ) : (
              findings.map((finding) => (
                <tr key={finding.id}>
                  <Td>
                    <p className="font-medium">{finding.label}</p>
                    <Badge tone={finding.severity === 'error' ? 'danger' : 'warning'}>
                      {finding.severity}
                    </Badge>
                  </Td>
                  <Td className="text-xs">{finding.detail}</Td>
                  <Td className="tabular text-right">{finding.expected ?? '—'}</Td>
                  <Td className="tabular text-right">{finding.actual ?? '—'}</Td>
                  <Td className="tabular text-right font-medium text-destructive">
                    {finding.variance ?? '—'}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

export { Coins };
