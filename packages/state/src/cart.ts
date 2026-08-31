import type { PriceBasis, Sku } from '@shop/core';
import { create } from 'zustand';

export interface CartLine {
  lineId: string;
  sku: Sku;
  qty: number;
  discount: number;
  /**
   * Manual price typed at the counter. Undefined means "use the SKU's price",
   * which is deliberately distinct from a typed value that happens to match.
   */
  unitPriceOverride?: number;
  /** Whether the typed price was pre-tax or post-tax. */
  overrideBasis?: PriceBasis;
}

export interface CartState {
  lines: CartLine[];
  customerId?: string;
  customerName?: string;
  /**
   * The store these lines were priced and stock-checked against, stamped when
   * the first line lands. Without it, staleness is invisible to state and every
   * store-switch call site has to remember to guard — which is exactly how the
   * web switcher shipped without one.
   */
  storeId?: string;

  /** Adding a SKU already in the cart bumps its quantity instead of duplicating. */
  addSku: (sku: Sku, qty?: number, storeId?: string) => void;
  setQty: (lineId: string, qty: number) => void;
  setDiscount: (lineId: string, discount: number) => void;
  /** Sets a manual unit price, stating which side of tax it is quoted on. */
  setUnitPrice: (lineId: string, price: number, basis: PriceBasis) => void;
  /** Drops the override and falls back to the SKU's own price. */
  clearUnitPrice: (lineId: string) => void;
  remove: (lineId: string) => void;
  setCustomer: (customer: { id?: string; name?: string }) => void;
  clear: () => void;
}

let lineSeq = 0;

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  customerId: undefined,
  customerName: undefined,

  addSku: (sku, qty = 1, storeId) =>
    set((state) => {
      // An empty cart adopts the store it is first filled from.
      const stamped = state.lines.length === 0 ? (storeId ?? state.storeId) : state.storeId;
      const existing = state.lines.find((l) => l.sku.id === sku.id);
      if (existing) {
        return {
          storeId: stamped,
          lines: state.lines.map((l) => (l.lineId === existing.lineId ? { ...l, qty: l.qty + qty } : l)),
        };
      }
      return {
        storeId: stamped,
        lines: [...state.lines, { lineId: `cart_${++lineSeq}`, sku, qty, discount: 0 }],
      };
    }),

  setQty: (lineId, qty) =>
    set((state) => ({
      lines: state.lines.flatMap((l) =>
        l.lineId === lineId ? (qty <= 0 ? [] : [{ ...l, qty }]) : [l],
      ),
    })),

  setDiscount: (lineId, discount) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.lineId === lineId ? { ...l, discount: Math.max(0, discount) } : l)),
    })),

  setUnitPrice: (lineId, price, basis) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, unitPriceOverride: Math.max(0, price), overrideBasis: basis } : l,
      ),
    })),

  clearUnitPrice: (lineId) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, unitPriceOverride: undefined, overrideBasis: undefined } : l,
      ),
    })),

  remove: (lineId) => set((state) => ({ lines: state.lines.filter((l) => l.lineId !== lineId) })),

  setCustomer: ({ id, name }) => set({ customerId: id, customerName: name }),

  clear: () => set({ lines: [], customerId: undefined, customerName: undefined, storeId: undefined }),
}));

export const useCartCount = () => useCartStore((s) => s.lines.reduce((sum, l) => sum + l.qty, 0));

/**
 * True when the cart holds lines priced against a different store than the one
 * now selected. Billing in that state would take one store's money for another
 * store's shelf, so both apps must block on it rather than merely warn.
 */
export const useCartIsForeign = (activeStoreId: string | undefined) =>
  useCartStore((s) => s.lines.length > 0 && s.storeId !== undefined && s.storeId !== activeStoreId);
