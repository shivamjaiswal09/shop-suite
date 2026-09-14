import { useAccessibleStores, useCartStore, useSessionStore } from '@shop/state';
import { Store as StoreIcon } from 'lucide-react';
import { Select } from './ui/input';
import { useState } from 'react';
import { Button } from './ui/button';
import { Modal } from './ui/modal';

/**
 * The top bar carries one context only: the store being sold from. Billing,
 * invoices and day-end key to it.
 *
 * Inventory screens deliberately do NOT read this — each picks its own
 * location, so there is never a second stock scope to disagree with.
 */
export function StoreSwitcher() {
  const store = useSessionStore((s) => s.store);
  const setStore = useSessionStore((s) => s.setStore);
  const stores = useAccessibleStores();
  const cart = useCartStore();
  // Switching with a live cart is staged rather than immediate: the lines were
  // priced against this store's shelf and cannot follow you to another.
  const [pending, setPending] = useState<string | null>(null);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <StoreIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        // Fixed width on a phone pushed the header's own controls onto a second
        // row. It may shrink here and take its full width once there is room.
        className="h-8 w-full min-w-0 text-[13px] sm:w-56"
        value={store?.id ?? ''}
        disabled={stores.data.length <= 1}
        onChange={(e) => {
          const next = stores.data.find((s) => s.id === e.target.value);
          if (!next) return;
          if (cart.lines.length > 0) {
            setPending(next.id);
            return;
          }
          setStore(next);
        }}
      >
        {stores.data.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {/* Labels the select for a desk user. On a phone it is the only select in
          the header, so the words cost more room than they explain. */}
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
        selling store
      </span>

      <Modal
        open={pending !== null}
        title="Switch store and discard the cart?"
        description="The cart holds lines priced and stock-checked against the current store."
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setPending(null)}>
              Keep billing here
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const next = stores.data.find((s) => s.id === pending);
                if (next) {
                  cart.clear();
                  setStore(next);
                }
                setPending(null);
              }}
            >
              Discard {cart.lines.length} line{cart.lines.length === 1 ? '' : 's'} and switch
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Prices, tax and availability all come from the selling store, so these lines cannot follow
          you. Bill or park them as an order first if you need to keep them.
        </p>
      </Modal>
    </div>
  );
}
