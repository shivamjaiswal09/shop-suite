import type { StockTransfer } from '@shop/core';
import { useReceiveTransfer, useSessionStore, useSkus, useLocations } from '@shop/state';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, Td, Th } from '@/components/ui/table';
import { qty as fmtQty, shortDateTime } from '@/lib/utils';

/**
 * Receiving confirms what actually arrived. Anything short of the dispatched
 * quantity raises a stock Discrepancy rather than being silently absorbed.
 */
export function ReceiveTransferDialog({
  transfer,
  onClose,
}: {
  transfer: StockTransfer | null;
  onClose: () => void;
}) {
  const user = useSessionStore((s) => s.user);
  const skus = useSkus();
  const locations = useLocations();
  const receive = useReceiveTransfer();

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Default every line to "all arrived" — the receiver edits only exceptions.
  useEffect(() => {
    if (!transfer) return;
    setCounts(Object.fromEntries(transfer.lines.map((l) => [l.skuId, String(l.qty)])));
    setNote('');
    setError(null);
  }, [transfer?.id]);

  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);
  const locationById = useMemo(
    () => new Map((locations.data ?? []).map((w) => [w.id, w])),
    [locations.data],
  );

  if (!transfer) return null;

  const shortfall = transfer.lines.reduce((sum, line) => {
    const received = Number(counts[line.skuId] ?? line.qty) || 0;
    return sum + Math.max(line.qty - received, 0);
  }, 0);

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    try {
      await receive.mutateAsync({
        transferId: transfer.id,
        lines: transfer.lines.map((line) => ({
          skuId: line.skuId,
          receivedQty: Number(counts[line.skuId] ?? line.qty) || 0,
        })),
        note: note || undefined,
        receivedBy: user.id,
      });
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <Modal
      open
      title={`Receive ${transfer.number}`}
      description={`${locationById.get(transfer.fromLocationId)?.name ?? '—'} → ${locationById.get(transfer.toLocationId)?.name ?? '—'} · dispatched ${shortDateTime(transfer.dispatchedAt)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={receive.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={receive.isPending}>
            {receive.isPending ? 'Receiving…' : 'Confirm receipt'}
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
                <Th className="w-28 text-right">Dispatched</Th>
                <Th className="w-32 text-right">Received</Th>
                <Th className="w-24 text-right">Short</Th>
              </tr>
            </thead>
            <tbody>
              {transfer.lines.map((line) => {
                const received = Number(counts[line.skuId] ?? line.qty) || 0;
                const short = Math.max(line.qty - received, 0);
                return (
                  <tr key={line.skuId}>
                    <Td>
                      <p className="font-medium">{skuById.get(line.skuId)?.name ?? line.skuId}</p>
                      <p className="text-xs text-muted-foreground">
                        {skuById.get(line.skuId)?.code ?? ''}
                      </p>
                    </Td>
                    <Td className="tabular text-right">{fmtQty(line.qty)}</Td>
                    <Td className="text-right">
                      <Input
                        className="tabular h-8 w-24 text-right"
                        value={counts[line.skuId] ?? String(line.qty)}
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [line.skuId]: e.target.value }))
                        }
                      />
                    </Td>
                    <Td className="text-right">
                      {short > 0 ? (
                        <Badge tone="danger">{fmtQty(short)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>

        <div>
          <Label htmlFor="receive-note">Note</Label>
          <Input
            id="receive-note"
            value={note}
            placeholder="Optional"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {shortfall > 0 ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {fmtQty(shortfall)} unit(s) short — confirming will raise a stock discrepancy for
            investigation.
          </p>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
