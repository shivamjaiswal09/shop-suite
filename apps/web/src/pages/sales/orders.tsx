import {
  useConvertOrderToInvoice,
  useOrders,
  useSessionStore,
  useSkus,
} from '@shop/state';
import { FileCheck2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { money, qty as fmtQty, shortDateTime } from '@/lib/utils';
import { NewOrderDialog } from './new-order-dialog';

const statusTone = {
  draft: 'neutral',
  confirmed: 'warning',
  invoiced: 'success',
  cancelled: 'neutral',
} as const;

/**
 * Orders hold stock without selling it: confirming reserves, which drops
 * `available` while leaving `on hand` untouched. Invoicing consumes the
 * reservation and writes the sale movements.
 */
export function OrdersPage() {
  const store = useSessionStore((s) => s.store);
  const user = useSessionStore((s) => s.user);
  const counterId = useSessionStore((s) => s.counterId);
  const orders = useOrders({ storeId: store?.id });
  const skus = useSkus(true);
  const convert = useConvertOrderToInvoice();
  const [error, setError] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);

  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);
  const rows = orders.data ?? [];
  const confirmed = rows.filter((o) => o.status === 'confirmed');
  const reservedUnits = confirmed.reduce(
    (sum, o) => sum + o.lines.reduce((s, l) => s + l.qty, 0),
    0,
  );

  const onConvert = async (orderId: string) => {
    if (!user) return;
    setError(null);
    try {
      await convert.mutateAsync({ orderId, counterId, createdBy: user.id });
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="Reserved stock awaiting collection. Reserving holds it back from the counter without selling it."
        actions={
          <Button onClick={() => setRaising(true)}>
            <Plus className="h-4 w-4" /> New order
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Awaiting invoice" value={String(confirmed.length)} tone={confirmed.length ? 'warning' : 'default'} />
        <Stat label="Units reserved" value={fmtQty(reservedUnits)} hint="Held out of available stock" />
        <Stat label="Invoiced" value={String(rows.filter((o) => o.status === 'invoiced').length)} />
        <Stat
          label="Reserved value"
          value={money(confirmed.reduce((sum, o) => sum + o.totals.grandTotal, 0))}
        />
      </div>

      <Card>
        <CardHeader title="Orders" description={`${rows.length} recorded`} />
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>When</Th>
              <Th>Items</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
              <Th className="w-40 text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {orders.isLoading ? (
              <EmptyRow colSpan={6}>Loading…</EmptyRow>
            ) : rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                No orders yet — park a cart as an order from Quick Billing.
              </EmptyRow>
            ) : (
              rows.map((order) => (
                <tr key={order.id}>
                  <Td className="font-medium">{order.number}</Td>
                  <Td className="text-muted-foreground">{shortDateTime(order.createdAt)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {order.lines.map((line) => (
                        <Badge key={line.id}>
                          {skuById.get(line.skuId)?.code ?? line.skuCode} × {fmtQty(line.qty)}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="tabular text-right font-medium">{money(order.totals.grandTotal)}</Td>
                  <Td>
                    <Badge tone={statusTone[order.status]}>{order.status}</Badge>
                  </Td>
                  <Td className="text-right">
                    {order.status === 'confirmed' ? (
                      <Button
                        size="sm"
                        disabled={convert.isPending}
                        onClick={() => void onConvert(order.id)}
                      >
                        <FileCheck2 className="h-3.5 w-3.5" /> Convert to invoice
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}

      <NewOrderDialog open={raising} onClose={() => setRaising(false)} />
    </>
  );
}
