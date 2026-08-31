import type { PurchaseOrder } from '@shop/core';
import { useReceiveGoods, useSessionStore, useSkus } from '@shop/state';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, Td, Th } from '@/components/ui/table';
import { money, qty as fmtQty } from '@/lib/utils';

/**
 * Receiving is the only inbound path besides opening stock, and it is where
 * unit cost enters the system — which is what moves the weighted-average cost.
 */
export function ReceiveGoodsDialog({
  order,
  onClose,
}: {
  order: PurchaseOrder | null;
  onClose: () => void;
}) {
  const user = useSessionStore((s) => s.user);
  const skus = useSkus(true);
  const receive = useReceiveGoods();

  const [rows, setRows] = useState<Record<string, { qty: string; damaged: string; cost: string }>>({});
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setRows(
      Object.fromEntries(
        order.lines.map((line) => [
          line.skuId,
          {
            qty: String(Math.max(line.qty - line.receivedQty, 0)),
            damaged: '0',
            cost: String(line.unitCost),
          },
        ]),
      ),
    );
    setSupplierInvoiceNo('');
    setError(null);
  }, [order?.id]);

  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);

  if (!order) return null;

  const value = order.lines.reduce((sum, line) => {
    const row = rows[line.skuId];
    return sum + (Number(row?.qty) || 0) * (Number(row?.cost) || 0);
  }, 0);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    const lines = order.lines
      .map((line) => ({
        skuId: line.skuId,
        qty: Number(rows[line.skuId]?.qty) || 0,
        unitCost: Number(rows[line.skuId]?.cost) || 0,
        damagedQty: Number(rows[line.skuId]?.damaged) || 0,
      }))
      .filter((line) => line.qty > 0);

    if (lines.length === 0) {
      setError('Enter a received quantity on at least one line.');
      return;
    }
    try {
      await receive.mutateAsync({
        purchaseOrderId: order.id,
        supplierInvoiceNo: supplierInvoiceNo || undefined,
        lines,
        createdBy: user.id,
      });
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <Modal
      open
      title={`Receive against ${order.number}`}
      description="Quantities default to what is still outstanding. Damaged units arrive and are written off."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={receive.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={receive.isPending}>
            {receive.isPending ? 'Receiving…' : `Receive ${money(value)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th className="text-right">Ordered</Th>
                <Th className="text-right">Outstanding</Th>
                <Th className="w-24 text-right">Receive</Th>
                <Th className="w-24 text-right">Damaged</Th>
                <Th className="w-28 text-right">Unit cost</Th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => {
                const row = rows[line.skuId];
                return (
                  <tr key={line.skuId}>
                    <Td>
                      <p className="font-medium">{skuById.get(line.skuId)?.name ?? line.skuId}</p>
                      <p className="text-xs text-muted-foreground">
                        {skuById.get(line.skuId)?.code ?? ''}
                      </p>
                    </Td>
                    <Td className="tabular text-right">{fmtQty(line.qty)}</Td>
                    <Td className="tabular text-right text-muted-foreground">
                      {fmtQty(Math.max(line.qty - line.receivedQty, 0))}
                    </Td>
                    {(['qty', 'damaged', 'cost'] as const).map((field) => (
                      <Td key={field} className="text-right">
                        <Input
                          className="tabular h-8 w-20 text-right"
                          value={row?.[field] ?? ''}
                          onChange={(e) =>
                            setRows((prev) => ({
                              ...prev,
                              [line.skuId]: { ...prev[line.skuId]!, [field]: e.target.value },
                            }))
                          }
                        />
                      </Td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>

        <div>
          <Label htmlFor="sinv">Supplier invoice no.</Label>
          <Input
            id="sinv"
            value={supplierInvoiceNo}
            placeholder="Optional"
            onChange={(e) => setSupplierInvoiceNo(e.target.value)}
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
