import type { Sku } from '@shop/core';
import {
  useCreateTransfer,
  useSessionStore,
  useSkuSearch,
  useStockOverview,
  useLocations,
} from '@shop/state';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { qty as fmtQty } from '@/lib/utils';

interface DraftLine {
  sku: Sku;
  qty: number;
}

export function NewTransferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSessionStore((s) => s.user);
  const store = useSessionStore((s) => s.store);
  const locations = useLocations();
  const create = useCreateTransfer();

  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState('');
  const [autoReceive, setAutoReceive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Declared after the state it reads — referencing it earlier is a TDZ throw.
  const source = (locations.data ?? []).find((l) => l.id === (fromLocationId || store?.id));
  const stock = useStockOverview(source?.id);

  const search = useSkuSearch(term);
  const availableFor = useMemo(
    () => new Map(stock.rows.map((row) => [row.sku.id, row.level.available])),
    [stock.rows],
  );

  const destinations = (locations.data ?? []).filter((l) => l.id !== source?.id);
  const destination = destinations.find((l) => l.id === (toLocationId || destinations[0]?.id));

  const close = () => {
    setFromLocationId('');
    setToLocationId('');
    setTerm('');
    setLines([]);
    setNote('');
    setAutoReceive(false);
    setError(null);
    onClose();
  };

  const addSku = (sku: Sku) => {
    setLines((prev) =>
      prev.some((l) => l.sku.id === sku.id)
        ? prev.map((l) => (l.sku.id === sku.id ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { sku, qty: 1 }],
    );
    setTerm('');
    setError(null);
  };

  const onSubmit = async () => {
    if (!user || !source || !destination) return;
    setError(null);

    if (lines.length === 0) {
      setError('Add at least one SKU.');
      return;
    }
    const overdrawn = lines.find((l) => l.qty > (availableFor.get(l.sku.id) ?? 0));
    if (overdrawn) {
      setError(
        `${overdrawn.sku.code}: only ${fmtQty(availableFor.get(overdrawn.sku.id) ?? 0)} available at ${source.name}.`,
      );
      return;
    }

    try {
      await create.mutateAsync({
        fromLocationId: source.id,
        toLocationId: destination.id,
        lines: lines.map((l) => ({ skuId: l.sku.id, qty: l.qty })),
        note: note || undefined,
        autoReceive,
        createdBy: user.id,
      });
      close();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      title="New transfer"
      description="Stock leaves the source now and lands at the destination on receipt."
      onClose={close}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            {create.isPending
              ? 'Dispatching…'
              : autoReceive
                ? 'Move now'
                : 'Dispatch'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="src">Source location</Label>
            <Select
              id="src"
              value={fromLocationId || store?.id || ''}
              onChange={(e) => {
                setFromLocationId(e.target.value);
                setToLocationId('');
                setLines([]);
              }}
            >
              {(locations.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code}) · {l.kind}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dest">Destination location</Label>
          <Select
            id="dest"
            value={toLocationId || destinations[0]?.id || ''}
            onChange={(e) => {
              setToLocationId(e.target.value);
              setAutoReceive(false);
            }}
          >
            {destinations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code}) · {l.kind}
              </option>
            ))}
          </Select>
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {destination?.kind === 'store'
            ? 'Replenishing a store shelf — this is what makes stock sellable.'
            : 'Moving into bulk storage.'}
        </p>

        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoReceive}
              onChange={(e) => setAutoReceive(e.target.checked)}
            />
            <span>
              <span className="font-medium">Receive immediately</span>
              <span className="block text-xs text-muted-foreground">
                Writes both movements at once — you are asserting the goods arrived.
                Leave off to keep the two-step trail that catches short deliveries.
              </span>
            </span>
        </label>

        <div>
          <Label htmlFor="sku-search">Add SKU</Label>
          <Input
            id="sku-search"
            placeholder="Scan barcode or search…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {term.trim() && (search.data ?? []).length > 0 ? (
            <div className="mt-2 max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {search.data!.map((sku) => (
                <button
                  key={sku.id}
                  type="button"
                  onClick={() => addSku(sku)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0 truncate">
                    {sku.name}
                    <span className="block text-xs text-muted-foreground">{sku.code}</span>
                  </span>
                  <Badge tone={(availableFor.get(sku.id) ?? 0) > 0 ? 'success' : 'danger'}>
                    {fmtQty(availableFor.get(sku.id) ?? 0)} here
                  </Badge>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-border">
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th className="w-32 text-right">Available</Th>
                <Th className="w-28 text-right">Send</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <EmptyRow colSpan={4}>Nothing added yet.</EmptyRow>
              ) : (
                lines.map((line) => {
                  const available = availableFor.get(line.sku.id) ?? 0;
                  return (
                    <tr key={line.sku.id}>
                      <Td>
                        <p className="font-medium">{line.sku.name}</p>
                        <p className="text-xs text-muted-foreground">{line.sku.code}</p>
                      </Td>
                      <Td className="tabular text-right text-muted-foreground">{fmtQty(available)}</Td>
                      <Td className="text-right">
                        <Input
                          className={`tabular h-8 w-20 text-right ${line.qty > available ? 'border-destructive' : ''}`}
                          value={line.qty}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.sku.id === line.sku.id ? { ...l, qty: Number(e.target.value) || 0 } : l,
                              ),
                            )
                          }
                        />
                      </Td>
                      <Td>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setLines((prev) => prev.filter((l) => l.sku.id !== line.sku.id))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>

        <div>
          <Label htmlFor="note">Note</Label>
          <Input
            id="note"
            value={note}
            placeholder="Optional"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
