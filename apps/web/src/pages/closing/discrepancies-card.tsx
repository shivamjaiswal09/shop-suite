import type { Discrepancy } from '@shop/core';
import { useDiscrepancies, useReasonCodes, useResolveDiscrepancy, useSessionStore } from '@shop/state';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { money } from '@/lib/utils';

const statusTone = {
  open: 'danger',
  investigating: 'warning',
  resolved: 'success',
  written_off: 'neutral',
} as const;

/**
 * Discrepancies are raised automatically by reconciliation (today: a cash
 * variance beyond tolerance at day-end) and cleared through this workflow.
 */
export function DiscrepanciesCard({ storeId }: { storeId: string | undefined }) {
  const discrepancies = useDiscrepancies(storeId);
  const rows = discrepancies.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Discrepancies"
        description="Raised automatically when a reconciliation does not tally."
        action={
          rows.some((d) => d.status === 'open') ? (
            <Badge tone="danger">{rows.filter((d) => d.status === 'open').length} open</Badge>
          ) : null
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Kind</Th>
            <Th className="text-right">Expected</Th>
            <Th className="text-right">Actual</Th>
            <Th className="text-right">Variance</Th>
            <Th>Status</Th>
            <Th className="w-72">Resolution</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={7}>Nothing to reconcile — every close has tallied.</EmptyRow>
          ) : (
            rows.map((discrepancy) => <DiscrepancyRow key={discrepancy.id} discrepancy={discrepancy} />)
          )}
        </tbody>
      </Table>
    </Card>
  );
}

function DiscrepancyRow({ discrepancy }: { discrepancy: Discrepancy }) {
  const user = useSessionStore((s) => s.user);
  const reasons = useReasonCodes('discrepancy');
  const resolve = useResolveDiscrepancy();
  const [reasonCodeId, setReasonCodeId] = useState(discrepancy.reasonCodeId ?? '');

  const settled = discrepancy.status === 'resolved' || discrepancy.status === 'written_off';

  const apply = (status: Discrepancy['status']) => {
    if (!user) return;
    resolve.mutate({
      discrepancyId: discrepancy.id,
      status,
      reasonCodeId: reasonCodeId || undefined,
      resolvedBy: user.id,
    });
  };

  return (
    <tr>
      <Td className="whitespace-nowrap">{discrepancy.businessDate}</Td>
      <Td>
        <Badge tone="warning">{discrepancy.kind}</Badge>
      </Td>
      <Td className="tabular text-right">{money(discrepancy.expected)}</Td>
      <Td className="tabular text-right">{money(discrepancy.actual)}</Td>
      <Td className="tabular text-right font-medium text-destructive">{money(discrepancy.variance)}</Td>
      <Td>
        <Badge tone={statusTone[discrepancy.status]}>{discrepancy.status.replace('_', ' ')}</Badge>
      </Td>
      <Td>
        {settled ? (
          <span className="text-xs text-muted-foreground">
            Closed by {discrepancy.resolvedBy ?? '—'}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="h-8 w-40 text-xs"
              value={reasonCodeId}
              onChange={(e) => setReasonCodeId(e.target.value)}
            >
              <option value="">Reason…</option>
              {(reasons.data ?? []).map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.name}
                </option>
              ))}
            </Select>
            {discrepancy.status === 'open' ? (
              <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => apply('investigating')}>
                Investigate
              </Button>
            ) : null}
            <Button size="sm" variant="success" disabled={resolve.isPending} onClick={() => apply('resolved')}>
              Resolve
            </Button>
            <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => apply('written_off')}>
              Write off
            </Button>
          </div>
        )}
      </Td>
    </tr>
  );
}
