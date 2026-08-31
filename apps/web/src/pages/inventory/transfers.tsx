import type { StockTransfer } from '@shop/core';
import {
  useCancelTransfer,
  useSessionStore,
  useSkus,
  useTransfers,
  useLocations,
} from '@shop/state';
import { ArrowRight, Plus, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { NewTransferDialog } from './new-transfer-dialog';
import { ReceiveTransferDialog } from './receive-transfer-dialog';
import { qty as fmtQty, shortDateTime } from '@/lib/utils';

const statusTone = {
  draft: 'neutral',
  in_transit: 'warning',
  received: 'success',
  cancelled: 'neutral',
} as const;

/**
 * Stock moves between locations in two steps: dispatch deducts at the source,
 * receipt adds at the destination. In between it is in transit — owned by
 * neither location, and visible here.
 */
export function TransfersPage() {
  const user = useSessionStore((s) => s.user);
  const store = useSessionStore((s) => s.store);
  const transfers = useTransfers();
  const locations = useLocations();
  const skus = useSkus();
  const cancel = useCancelTransfer();

  const [creating, setCreating] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const locationById = useMemo(
    () => new Map((locations.data ?? []).map((w) => [w.id, w])),
    [locations.data],
  );
  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);

  const rows = transfers.data ?? [];
  const inTransit = rows.filter((t) => t.status === 'in_transit');
  const inbound = inTransit.filter((t) => t.toLocationId === store?.id);
  const receiving = rows.find((t) => t.id === receivingId) ?? null;

  const unitsIn = (transfer: StockTransfer) =>
    transfer.lines.reduce((sum, line) => sum + line.qty, 0);

  return (
    <>
      <PageHeader
        title="Stock Transfers"
        description="Move stock between locations — within a store or across stores."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New transfer
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="In transit" value={String(inTransit.length)} icon={Truck} tone={inTransit.length ? 'warning' : 'default'} />
        <Stat
          label="Awaiting this store"
          value={String(inbound.length)}
          hint={store?.name}
          tone={inbound.length ? 'warning' : 'default'}
        />
        <Stat
          label="Units in transit"
          value={fmtQty(inTransit.reduce((sum, t) => sum + unitsIn(t), 0))}
        />
        <Stat label="Completed" value={String(rows.filter((t) => t.status === 'received').length)} />
      </div>

      <Card>
        <CardHeader title="All transfers" description={`${rows.length} recorded`} />
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Route</Th>
              <Th>Items</Th>
              <Th className="text-right">Dispatched</Th>
              <Th className="text-right">Received</Th>
              <Th>Status</Th>
              <Th className="w-56 text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {transfers.isLoading ? (
              <EmptyRow colSpan={7}>Loading…</EmptyRow>
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={7}>No transfers yet.</EmptyRow>
            ) : (
              rows.map((transfer) => {
                const from = locationById.get(transfer.fromLocationId);
                const to = locationById.get(transfer.toLocationId);
                const route = from && to ? `${from.kind} → ${to.kind}` : '—';
                return (
                  <tr key={transfer.id}>
                    <Td>
                      <p className="font-medium">{transfer.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {shortDateTime(transfer.dispatchedAt)}
                      </p>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span>{from?.code ?? '—'}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{to?.code ?? '—'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {route}
                      </p>
                    </Td>
                    <Td className="max-w-64">
                      <div className="flex flex-wrap gap-1">
                        {transfer.lines.map((line) => (
                          <Badge key={line.skuId}>
                            {skuById.get(line.skuId)?.code ?? line.skuId} × {fmtQty(line.qty)}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                    <Td className="tabular text-right">{fmtQty(unitsIn(transfer))}</Td>
                    <Td className="tabular text-right">
                      {transfer.status === 'in_transit' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        fmtQty(transfer.lines.reduce((sum, l) => sum + l.receivedQty, 0))
                      )}
                    </Td>
                    <Td>
                      <Badge tone={statusTone[transfer.status]}>
                        {transfer.status.replace('_', ' ')}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      {transfer.status === 'in_transit' ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => setReceivingId(transfer.id)}>
                            Receive
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={cancel.isPending}
                            onClick={() =>
                              user && cancel.mutate({ transferId: transfer.id, cancelledBy: user.id })
                            }
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {transfer.status === 'received' ? `by ${transfer.receivedBy ?? '—'}` : '—'}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>

      {cancel.error ? (
        <p className="mt-3 text-xs text-destructive">{(cancel.error as Error).message}</p>
      ) : null}

      <NewTransferDialog open={creating} onClose={() => setCreating(false)} />
      <ReceiveTransferDialog transfer={receiving} onClose={() => setReceivingId(null)} />
    </>
  );
}
