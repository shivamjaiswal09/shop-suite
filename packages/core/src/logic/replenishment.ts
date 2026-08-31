import { roundQty } from '../entities/common.ts';
import type { InventoryLevel } from '../entities/stock.ts';

export interface ReplenishmentInput {
  skuId: string;
  skuCode: string;
  skuName: string;
  storeId: string;
  storeName: string;
  /** The store's own shelf position. */
  storeLevel: InventoryLevel;
  minStock: number;
  reorderLevel: number;
  /** Linked warehouses, in preference order (primary first). */
  sources: { locationId: string; locationName: string; available: number; isPrimary: boolean }[];
  /** Already dispatched towards this store and not yet received. */
  inbound: number;
}

export interface ReplenishmentSuggestion {
  skuId: string;
  skuCode: string;
  skuName: string;
  storeId: string;
  storeName: string;
  available: number;
  inbound: number;
  target: number;
  /** How short the shelf is once in-transit stock is counted. */
  shortfall: number;
  /** What can actually be sent, capped by warehouse stock. */
  suggestedQty: number;
  sourceLocationId?: string;
  sourceLocationName?: string;
  /** True when the linked warehouses cannot cover the shortfall. */
  sourceShort: boolean;
}

/**
 * Turns "this shelf is low" into "send this much, from here".
 *
 * Because a store bills only from its own shelf, a low shelf beside a full
 * warehouse is a silent stockout waiting to happen — this is the view that
 * catches it. Pure derivation: it reads levels and links, and writes nothing.
 */
export function suggestReplenishment(inputs: readonly ReplenishmentInput[]): ReplenishmentSuggestion[] {
  const suggestions: ReplenishmentSuggestion[] = [];

  for (const input of inputs) {
    // Aim at the reorder level, falling back to the minimum when unset.
    const target = Math.max(input.reorderLevel, input.minStock);
    if (target <= 0) continue;

    const covered = roundQty(input.storeLevel.available + input.inbound);
    if (covered >= target) continue;

    const shortfall = roundQty(target - covered);
    const sources = [...input.sources].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.available - a.available,
    );
    const best = sources.find((s) => s.available > 0);
    const suggestedQty = best ? roundQty(Math.min(shortfall, best.available)) : 0;

    suggestions.push({
      skuId: input.skuId,
      skuCode: input.skuCode,
      skuName: input.skuName,
      storeId: input.storeId,
      storeName: input.storeName,
      available: input.storeLevel.available,
      inbound: input.inbound,
      target,
      shortfall,
      suggestedQty,
      sourceLocationId: best?.locationId,
      sourceLocationName: best?.locationName,
      sourceShort: suggestedQty < shortfall,
    });
  }

  return suggestions.sort((a, b) => b.shortfall - a.shortfall);
}
