import type { Sku } from '@shop/core';
import { useCreatePurchaseOrder, useLocations, useSessionStore, useSkuSearch, useSuppliers } from '@shop/state';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { money } from '@/lib/utils';

interface DraftLine {
  sku: Sku;
  qty: number;
  unitCost: number;
}

export function NewPurchaseOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSessionStore((s) => s.user);
  const suppliers = useSuppliers();
  const locations = useLocations();
  const create = useCreatePurchaseOrder();

  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = useSkuSearch(term);
  const warehouses = (locations.data ?? []).filter((l) => l.kind === 'warehouse');
  const destinations = warehouses.length > 0 ? warehouses : (locations.data ?? []);
  const total = lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);

  const close = () => {
    setSupplierId('');
    setLocationId('');
    setTerm('');
    setLines([]);
    setError(null);
    onClose();
  };

  const onSubmit = async () => {
    if (!user) return;
    setError(null);
    if (lines.length === 0) {
      setError('Add at least one SKU.');
      return;
    }
    try {
      await create.mutateAsync({
        supplierId: supplierId || suppliers.data?.[0]?.id || '',
        locationId: locationId || destinations[0]?.id || '',
        lines: lines.map((l) => ({ skuId: l.sku.id, qty: l.qty, unitCost: l.unitCost })),
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
      title="New purchase order"
      description="Goods normally land in a warehouse, then transfer out to the stores that need them."
      onClose={close}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            {create.isPending ? 'Raising…' : `Raise PO ${money(total)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="supplier">Supplier</Label>
            <Select
              id="supplier"
              value={supplierId || suppliers.data?.[0]?.id || ''}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dest">Deliver to</Label>
            <Select
              id="dest"
              value={locationId || destinations[0]?.id || ''}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {destinations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="po-sku">Add SKU</Label>
          <Input
            id="po-sku"
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
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setLines((prev) =>
                      prev.some((l) => l.sku.id === sku.id)
                        ? prev
                        : [...prev, { sku, qty: 24, unitCost: sku.purchasePrice }],
                    );
                    setTerm('');
                  }}
                >
                  <span className="min-w-0 truncate">
                    {sku.name}
                    <span className="block text-xs text-muted-foreground">{sku.code}</span>
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    last cost {money(sku.purchasePrice)}
                  </span>
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
                <Th className="w-24 text-right">Qty</Th>
                <Th className="w-28 text-right">Unit cost</Th>
                <Th className="w-24 text-right">Value</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <EmptyRow colSpan={5}>Nothing added yet.</EmptyRow>
              ) : (
                lines.map((line) => (
                  <tr key={line.sku.id}>
                    <Td>
                      <p className="font-medium">{line.sku.name}</p>
                      <p className="text-xs text-muted-foreground">{line.sku.code}</p>
                    </Td>
                    <Td className="text-right">
                      <Input
                        className="tabular h-8 w-20 text-right"
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
                    <Td className="text-right">
                      <Input
                        className="tabular h-8 w-24 text-right"
                        value={line.unitCost}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.sku.id === line.sku.id
                                ? { ...l, unitCost: Number(e.target.value) || 0 }
                                : l,
                            ),
                          )
                        }
                      />
                    </Td>
                    <Td className="tabular text-right">{money(line.qty * line.unitCost)}</Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLines((prev) => prev.filter((l) => l.sku.id !== line.sku.id))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
