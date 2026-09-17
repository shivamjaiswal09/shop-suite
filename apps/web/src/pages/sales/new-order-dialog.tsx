import type { Sku } from '@shop/core';
import { useCreateOrder, useCustomers, useSessionStore, useSkus } from '@shop/state';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { money } from '@/lib/utils';
import { ProductPicker } from './product-picker';

const WALK_IN = '__walkin__';

interface Line {
  skuId: string;
  name: string;
  price: number;
  qty: number;
}

/**
 * Raising an order.
 *
 * An order is a promise to sell, not a sale: confirming it reserves stock, so
 * `available` drops while `on hand` does not, and nothing leaves the shelf
 * until it is invoiced. That is the whole reason the screen exists separately
 * from Quick Billing — the goods are still on the shelf and still countable.
 *
 * It reuses the billing product picker rather than growing its own. The
 * question being answered is identical ("which SKU, how many"), and a second
 * search box with its own quirks is how two screens drift apart.
 */
export function NewOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useSessionStore((s) => s.store);
  const user = useSessionStore((s) => s.user);
  const skus = useSkus();
  const customers = useCustomers();
  const createOrder = useCreateOrder();

  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState(WALK_IN);
  const [error, setError] = useState<string>();

  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);
  const inCart = useMemo(() => new Set(lines.map((l) => l.skuId)), [lines]);

  // Indicative only. The server prices the order from the catalogue when it is
  // raised, exactly as it does for an invoice — a total computed here would be
  // a second pricing implementation waiting to disagree with the first.
  const estimate = lines.reduce((sum, line) => sum + line.price * line.qty, 0);

  const add = (sku: Sku) =>
    setLines((current) => {
      const existing = current.find((l) => l.skuId === sku.id);
      if (existing) {
        return current.map((l) => (l.skuId === sku.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...current,
        { skuId: sku.id, name: sku.name, price: sku.sellingPrice ?? 0, qty: 1 },
      ];
    });

  const setQty = (skuId: string, qty: number) =>
    setLines((current) =>
      qty <= 0
        ? current.filter((l) => l.skuId !== skuId)
        : current.map((l) => (l.skuId === skuId ? { ...l, qty } : l)),
    );

  const reset = () => {
    setLines([]);
    setCustomerId(WALK_IN);
    setError(undefined);
  };

  const submit = async () => {
    if (!store || !user) return;
    setError(undefined);
    try {
      await createOrder.mutateAsync({
        storeId: store.id,
        customerId: customerId === WALK_IN ? undefined : customerId,
        lines: lines.map((line) => ({ skuId: line.skuId, qty: line.qty })),
        createdBy: user.id,
      });
      reset();
      onClose();
    } catch (cause) {
      // Most often "not enough stock to reserve", which names the SKU — worth
      // showing verbatim rather than flattening to a generic failure.
      setError(cause instanceof Error ? cause.message : 'Could not raise the order');
    }
  };

  if (!open) return null;

  return (
    <Modal
      open
      title="New order"
      description="Reserves stock for collection. Nothing leaves the shelf until it is invoiced."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="order-customer">
            Customer
          </label>
          <Select
            id="order-customer"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value={WALK_IN}>Walk-in customer</option>
            {(customers.data ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ''}
              </option>
            ))}
          </Select>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          <ProductPicker
            storeId={store?.id}
            storeName={store?.name ?? '—'}
            inCart={inCart}
            onAdd={add}
          />
        </div>

        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium">To reserve</p>
            <p className="text-xs text-muted-foreground">
              {lines.length} line{lines.length === 1 ? '' : 's'}
            </p>
          </div>

          {lines.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Nothing added yet. Pick items above.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lines.map((line) => (
                <li key={line.skuId} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {skuById.get(line.skuId)?.code} · {money(line.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Fewer ${line.name}`}
                      onClick={() => setQty(line.skuId, line.qty - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      className="w-14 text-center"
                      inputMode="numeric"
                      aria-label={`Quantity of ${line.name}`}
                      value={String(line.qty)}
                      onChange={(event) =>
                        setQty(line.skuId, Math.max(0, Number(event.target.value) || 0))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`More ${line.name}`}
                      onClick={() => setQty(line.skuId, line.qty + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => setQty(line.skuId, 0)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 ? (
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">Estimated value</span>
            <span className="text-sm font-semibold">{money(estimate)}</span>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={lines.length === 0 || !store || createOrder.isPending}
            onClick={() => void submit()}
          >
            {createOrder.isPending ? 'Reserving…' : 'Raise order'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
