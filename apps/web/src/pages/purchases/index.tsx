import type { PurchaseOrder } from '@shop/core';
import {
  useCancelPurchaseOrder,
  useGoodsReceipts,
  useLocations,
  usePurchaseOrders,
  usePurchaseReturns,
  useSessionStore,
  useSkus,
  useSuppliers,
} from '@shop/state';
import { PackageCheck, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { NewPurchaseOrderDialog } from './new-po-dialog';
import { PurchaseReturnDialog } from './purchase-return-dialog';
import { ReceiveGoodsDialog } from './receive-dialog';
import { money, qty as fmtQty, shortDateTime } from '@/lib/utils';

const statusTone = {
  draft: 'neutral',
  sent: 'info',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'neutral',
} as const;

export function PurchasesPage() {
  const user = useSessionStore((s) => s.user);
  const orders = usePurchaseOrders();
  const receipts = useGoodsReceipts();
  const returns = usePurchaseReturns();
  const suppliers = useSuppliers(true);
  const locations = useLocations(undefined, true);
  const skus = useSkus(true);
  const cancel = useCancelPurchaseOrder();

  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [returningReceiptId, setReturningReceiptId] = useState<string | null>(null);

  const supplierById = useMemo(() => new Map((suppliers.data ?? []).map((s) => [s.id, s])), [suppliers.data]);
  const locationById = useMemo(() => new Map((locations.data ?? []).map((l) => [l.id, l])), [locations.data]);
  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);

  const rows = orders.data ?? [];
  const open = rows.filter((o) => o.status === 'sent' || o.status === 'partially_received');
  const onOrder = open.reduce(
    (sum, o) => sum + o.lines.reduce((s, l) => s + Math.max(l.qty - l.receivedQty, 0) * l.unitCost, 0),
    0,
  );
  const receivingReceipt = (receipts.data ?? []).find((r) => r.id === returningReceiptId) ?? null;

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Raise orders, receive goods into a location, and send rejects back to the supplier."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New purchase order
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open orders" value={String(open.length)} tone={open.length ? 'warning' : 'default'} />
        <Stat label="Value on order" value={money(onOrder)} hint="Outstanding lines" />
        <Stat label="Receipts" value={String(receipts.data?.length ?? 0)} />
        <Stat label="Returns to supplier" value={String(returns.data?.length ?? 0)} />
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Purchase orders" description="Receiving writes `receipt` movements at the destination." />
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Supplier</Th>
                <Th>Deliver to</Th>
                <Th className="text-right">Ordered</Th>
                <Th className="text-right">Received</Th>
                <Th className="text-right">Value</Th>
                <Th>Status</Th>
                <Th className="w-48 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {orders.isLoading ? (
                <EmptyRow colSpan={8}>Loading…</EmptyRow>
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={8}>No purchase orders yet.</EmptyRow>
              ) : (
                rows.map((order) => {
                  const ordered = order.lines.reduce((s, l) => s + l.qty, 0);
                  const received = order.lines.reduce((s, l) => s + l.receivedQty, 0);
                  return (
                    <tr key={order.id}>
                      <Td>
                        <p className="font-medium">{order.number}</p>
                        <p className="text-xs text-muted-foreground">{shortDateTime(order.createdAt)}</p>
                      </Td>
                      <Td>{supplierById.get(order.supplierId)?.name ?? '—'}</Td>
                      <Td>{locationById.get(order.locationId)?.name ?? '—'}</Td>
                      <Td className="tabular text-right">{fmtQty(ordered)}</Td>
                      <Td className="tabular text-right">{fmtQty(received)}</Td>
                      <Td className="tabular text-right">
                        {money(order.lines.reduce((s, l) => s + l.qty * l.unitCost, 0))}
                      </Td>
                      <Td>
                        <Badge tone={statusTone[order.status]}>{order.status.replace('_', ' ')}</Badge>
                      </Td>
                      <Td className="text-right">
                        {order.status === 'sent' || order.status === 'partially_received' ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" onClick={() => setReceiving(order)}>
                              <PackageCheck className="h-3.5 w-3.5" /> Receive
                            </Button>
                            {received === 0 ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={cancel.isPending}
                                onClick={() => user && cancel.mutate({ id: order.id, actorId: user.id })}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Goods receipts" description="Return rejects to the supplier from here." />
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Supplier invoice</Th>
                <Th>Into</Th>
                <Th>Items</Th>
                <Th className="text-right">Value</Th>
                <Th className="w-32 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(receipts.data ?? []).length === 0 ? (
                <EmptyRow colSpan={6}>Nothing received yet.</EmptyRow>
              ) : (
                receipts.data!.map((receipt) => (
                  <tr key={receipt.id}>
                    <Td>
                      <p className="font-medium">{receipt.number}</p>
                      <p className="text-xs text-muted-foreground">{shortDateTime(receipt.createdAt)}</p>
                    </Td>
                    <Td className="text-muted-foreground">{receipt.supplierInvoiceNo ?? '—'}</Td>
                    <Td>{locationById.get(receipt.locationId)?.name ?? '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {receipt.lines.map((line) => (
                          <Badge key={line.skuId}>
                            {skuById.get(line.skuId)?.code ?? line.skuId} × {fmtQty(line.qty)}
                            {line.damagedQty > 0 ? ` (${fmtQty(line.damagedQty)} dmg)` : ''}
                          </Badge>
                        ))}
                      </div>
                    </Td>
                    <Td className="tabular text-right">
                      {money(receipt.lines.reduce((s, l) => s + l.qty * l.unitCost, 0))}
                    </Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setReturningReceiptId(receipt.id)}>
                        Return
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Purchase returns"
            description="Recorded as a signed adjustment tagged `purchase_return` — there is no dedicated movement type."
          />
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Against</Th>
                <Th>From</Th>
                <Th className="text-right">Units</Th>
                <Th className="text-right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {(returns.data ?? []).length === 0 ? (
                <EmptyRow colSpan={5}>Nothing returned to a supplier.</EmptyRow>
              ) : (
                returns.data!.map((ret) => (
                  <tr key={ret.id}>
                    <Td className="font-medium">{ret.number}</Td>
                    <Td className="text-muted-foreground">
                      {(receipts.data ?? []).find((r) => r.id === ret.goodsReceiptId)?.number ?? '—'}
                    </Td>
                    <Td>{locationById.get(ret.locationId)?.name ?? '—'}</Td>
                    <Td className="tabular text-right">
                      {fmtQty(ret.lines.reduce((s, l) => s + l.qty, 0))}
                    </Td>
                    <Td className="tabular text-right">
                      {money(ret.lines.reduce((s, l) => s + l.qty * l.unitCost, 0))}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <NewPurchaseOrderDialog open={creating} onClose={() => setCreating(false)} />
      <ReceiveGoodsDialog order={receiving} onClose={() => setReceiving(null)} />
      <PurchaseReturnDialog receipt={receivingReceipt} onClose={() => setReturningReceiptId(null)} />
    </>
  );
}
