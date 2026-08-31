import {
  aggregateInventoryLevels,
  emptyLevel,
  stockAlertFor,
  type InventoryLevel,
  type Sku,
  type StockLocation,
  type StockAlert,
} from '@shop/core';
import type { MovementFilter, NewMovement } from '@shop/data';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';
import { useSkus } from './use-products';

export function useStockLevels(locationId: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.stockLevels(locationId ?? 'none'),
    queryFn: () => repos.stock.levels(locationId!),
    enabled: Boolean(locationId),
  });
}

export function useStockLevel(skuId: string | undefined, locationId: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.stockLevel(skuId ?? 'none', locationId ?? 'none'),
    queryFn: () => repos.stock.levelFor(skuId!, locationId!),
    enabled: Boolean(skuId && locationId),
  });
}

export function useMovements(filter: MovementFilter) {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.movements(filter), queryFn: () => repos.stock.movements(filter) });
}

/**
 * The generic write path into the ledger — opening stock, adjustments, damage
 * write-offs and stock-count corrections all go through here.
 */
export function usePostMovements() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (movements: NewMovement[]) => repos.stock.post(movements),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export interface LocationSplit {
  locationId: string;
  locationName: string;
  kind: 'store' | 'warehouse';
  available: number;
  onHand: number;
}

export interface StockRow {
  sku: Sku;
  level: InventoryLevel;
  alert: StockAlert;
  /** Present only in network scope: which locations the total is made of. */
  split?: LocationSplit[];
}

export interface StockSummary {
  skuCount: number;
  stockValue: number;
  outOfStock: number;
  lowStock: number;
}

export interface StockView {
  rows: StockRow[];
  summary: StockSummary;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

const summarise = (rows: StockRow[]): StockSummary => ({
  skuCount: rows.length,
  stockValue: Math.round(rows.reduce((sum, r) => sum + r.level.value, 0) * 100) / 100,
  outOfStock: rows.filter((r) => r.alert === 'out_of_stock').length,
  lowStock: rows.filter((r) => r.alert === 'below_min' || r.alert === 'reorder').length,
});

/**
 * Stock Overview: SKUs joined with their derived levels. Shared verbatim by the
 * web panel and the mobile screen.
 */
export function useStockOverview(locationId: string | undefined) {
  const skusQuery = useSkus();
  const levelsQuery = useStockLevels(locationId);

  const rows = useMemo<StockRow[]>(() => {
    const levels = new Map((levelsQuery.data ?? []).map((l) => [l.skuId, l]));
    return (skusQuery.data ?? []).map((sku) => {
      const level = levels.get(sku.id) ?? {
        skuId: sku.id,
        locationId: locationId ?? '',
        onHand: 0,
        reserved: 0,
        available: 0,
        damaged: 0,
        avgCost: 0,
        value: 0,
      };
      return { sku, level, alert: stockAlertFor(level, sku.minStock, sku.reorderLevel) };
    });
  }, [skusQuery.data, levelsQuery.data, locationId]);

  const summary = useMemo(() => summarise(rows), [rows]);

  return {
    rows,
    summary,
    isLoading: skusQuery.isLoading || levelsQuery.isLoading,
    isFetching: skusQuery.isFetching || levelsQuery.isFetching,
    error: skusQuery.error ?? levelsQuery.error,
    refetch: () => {
      void skusQuery.refetch();
      void levelsQuery.refetch();
    },
  };
}

/**
 * Folds an arbitrary set of locations into one row per SKU, keeping the
 * per-location split alongside. One location gives a plain single-location
 * view; several give a rollup — all stores, all warehouses, or everything.
 *
 * This is a *visibility* rollup, never sellable stock: a store bills only
 * against its own shelf, so warehouse stock has to be transferred in first.
 */
export function useAggregateStockOverview(locations: StockLocation[]): StockView {
  const repos = useRepositories();
  const skusQuery = useSkus();

  const levelQueries = useQueries({
    queries: locations.map((location) => ({
      queryKey: qk.stockLevels(location.id),
      queryFn: () => repos.stock.levels(location.id),
    })),
  });

  const rows = useMemo<StockRow[]>(() => {
    if (locations.length === 0) return [];

    // levelQueries is index-aligned with `locations`.
    const perLocation = locations.map((location, index) => ({
      location,
      levels: new Map((levelQueries[index]?.data ?? []).map((l) => [l.skuId, l])),
    }));

    return (skusQuery.data ?? []).map((sku) => {
      const split: LocationSplit[] = [];
      const levels: InventoryLevel[] = [];

      for (const { location, levels: bySku } of perLocation) {
        const level = bySku.get(sku.id);
        if (!level) continue;
        levels.push(level);
        if (level.onHand !== 0 || level.reserved !== 0) {
          split.push({
            locationId: location.id,
            locationName: location.name,
            kind: location.kind,
            available: level.available,
            onHand: level.onHand,
          });
        }
      }

      const scopeId = locations.length === 1 ? locations[0]!.id : 'aggregate';
      const level = levels.length
        ? aggregateInventoryLevels(levels, scopeId)
        : { ...emptyLevel(sku.id, scopeId) };

      return { sku, level, alert: stockAlertFor(level, sku.minStock, sku.reorderLevel), split };
    });
  }, [locations, levelQueries, skusQuery.data]);

  const summary = useMemo(() => summarise(rows), [rows]);

  return {
    rows,
    summary,
    isLoading: skusQuery.isLoading || levelQueries.some((q) => q.isLoading),
    isFetching: skusQuery.isFetching || levelQueries.some((q) => q.isFetching),
    error: skusQuery.error ?? levelQueries.find((q) => q.error)?.error,
    refetch: () => {
      void skusQuery.refetch();
      for (const query of levelQueries) void query.refetch();
    },
  };
}
