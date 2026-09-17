import type { GoodsReceipt } from '@shop/core';
import { useCreatePurchaseReturn, useReasonCodes, useSessionStore, useSkus } from '@shop/state';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, Td, Th } from '@/components/ui/table';
import { qty as fmtQty } from '@/lib/utils';

export function PurchaseReturnDialog({
  receipt,
  onClose,
}: {
  receipt: GoodsReceipt | null;
  onClose: () => void;
}) {
  const user = useSessionStore((s) => s.user);
  const skus = useSkus(true);
  const reasons = useReasonCodes('return');
  const create = useCreatePurchaseReturn();

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasonCodeId, setReasonCodeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuantities({});
    setError(null);
  }, [receipt?.id]);

  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);

  if (!receipt) return null;

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    const lines = receipt.lines
      .map((line) => ({ skuId: line.skuId, qty: Number(quantities[line.skuId]) || 0 }))
      .filter((line) => line.qty > 0);
    if (lines.length === 0) {
      setError('Enter a quantity on at least one line.');
      return;
    }
    try {
      await create.mutateAsync({
        goodsReceiptId: receipt.id,
        reasonCodeId: reasonCodeId || (reasons.data ?? [])[0]?.id || '',
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
      title={`Return to supplier · ${receipt.number}`}
      description="Stock leaves the location it was received into."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            {create.isPending ? 'Recording…' : 'Return to supplier'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">Received</Th>
                <Th className="w-28 text-right">Return</Th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr key={line.skuId}>
                  <Td>
                    <p className="font-medium">{skuById.get(line.skuId)?.name ?? line.skuId}</p>
                    <p className="text-xs text-muted-foreground">{skuById.get(line.skuId)?.code ?? ''}</p>
                  </Td>
                  <Td className="tabular text-right">{fmtQty(line.qty)}</Td>
                  <Td className="text-right">
                    <Input
                      className="tabular h-8 w-20 text-right"
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

        <div>
          <Label htmlFor="pret-reason">Reason</Label>
          <Select id="pret-reason" value={reasonCodeId} onChange={(e) => setReasonCodeId(e.target.value)}>
            {(reasons.data ?? []).map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.name}
              </option>
            ))}
          </Select>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
