import {
  reconcileInventory,
  reconcilePayments,
  reconcileSales,
  suggestReplenishment,
  type ReconFinding,
  type ReplenishmentSuggestion,
} from '@shop/core';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';
import { useInvoices } from './use-billing';
import { useLocations, useStoreWarehouseLinks } from './use-org';
import { useSkus } from './use-products';
import { useTransfers } from './use-transfers';

/**
 * Everything reconciliation needs, derived from the same ledger the rest of the
 * app reads. No separate reconciliation store exists — that is the point.
 */
export function useReconciliation(storeId: string | undefined, businessDate: string) {
  const repos = useRepositories();
  const invoices = useInvoices({ storeId, businessDate });
  const locations = useLocations(undefined, true);
  const skus = useSkus(true);
  const transfers = useTransfers();

  const [movementsQuery, paymentsQuery] = useQueries({
    queries: [
      { queryKey: qk.movements({}), queryFn: () => repos.stock.movements({}) },
      {
        queryKey: ['payments', 'day', storeId ?? 'none', businessDate],
        queryFn: () => repos.payments.listByDay(storeId!, businessDate),
        enabled: Boolean(storeId),
      },
    ],
  });

  const nameOf = useMemo(() => {
    const locationNames = new Map((locations.data ?? []).map((l) => [l.id, l.name]));
    const skuNames = new Map((skus.data ?? []).map((s) => [s.id, s.name]));
    return {
      location: (id: string) => locationNames.get(id) ?? id,
      sku: (id: string) => skuNames.get(id) ?? id,
    };
  }, [locations.data, skus.data]);

  const sales = useMemo<ReconFinding[]>(
    () => reconcileSales(invoices.data ?? [], movementsQuery?.data ?? []),
    [invoices.data, movementsQuery?.data],
  );

  const payments = useMemo<ReconFinding[]>(
    () => reconcilePayments(invoices.data ?? [], (paymentsQuery?.data as never) ?? []),
    [invoices.data, paymentsQuery?.data],
  );

  const inventory = useMemo<ReconFinding[]>(
    () =>
      reconcileInventory({
        movements: movementsQuery?.data ?? [],
        transfers: transfers.data ?? [],
        locationName: nameOf.location,
        skuName: nameOf.sku,
        today: businessDate,
      }),
    [movementsQuery?.data, transfers.data, nameOf, businessDate],
  );

  return {
    sales,
    payments,
    inventory,
    isLoading:
      invoices.isLoading || (movementsQuery?.isLoading ?? false) || (paymentsQuery?.isLoading ?? false),
  };
}

/**
 * Replenishment: which store shelves are short, and which linked warehouse can
 * cover them. Reads levels across every store and its linked warehouses.
 */
export function useReplenishmentSuggestions(): {
  suggestions: ReplenishmentSuggestion[];
  isLoading: boolean;
} {
  const repos = useRepositories();
  const locations = useLocations();
  const links = useStoreWarehouseLinks();
  const skus = useSkus();
  const transfers = useTransfers({ status: 'in_transit' });

  const relevant = useMemo(() => locations.data ?? [], [locations.data]);

  const levelQueries = useQueries({
    queries: relevant.map((location) => ({
      queryKey: qk.stockLevels(location.id),
      queryFn: () => repos.stock.levels(location.id),
    })),
  });

  const suggestions = useMemo(() => {
    const byLocation = new Map(
      relevant.map((location, index) => [
        location.id,
        new Map((levelQueries[index]?.data ?? []).map((l) => [l.skuId, l])),
      ]),
    );
    const stores = relevant.filter((l) => l.kind === 'store');
    const warehouses = new Map(relevant.filter((l) => l.kind === 'warehouse').map((l) => [l.id, l]));

    const inbound = new Map<string, number>();
    for (const transfer of transfers.data ?? []) {
      for (const line of transfer.lines) {
        const key = `${transfer.toLocationId}::${line.skuId}`;
        inbound.set(key, (inbound.get(key) ?? 0) + line.qty);
      }
    }

    return suggestReplenishment(
      stores.flatMap((store) =>
        (skus.data ?? []).flatMap((sku) => {
          const storeLevel = byLocation.get(store.id)?.get(sku.id);
          if (!storeLevel) return [];
          return [
            {
              skuId: sku.id,
              skuCode: sku.code,
              skuName: sku.name,
              storeId: store.id,
              storeName: store.name,
              storeLevel,
              minStock: sku.minStock,
              reorderLevel: sku.reorderLevel,
              inbound: inbound.get(`${store.id}::${sku.id}`) ?? 0,
              sources: (links.data ?? [])
                .filter((link) => link.storeId === store.id)
                .flatMap((link) => {
                  const warehouse = warehouses.get(link.warehouseId);
                  const level = byLocation.get(link.warehouseId)?.get(sku.id);
                  if (!warehouse || !level) return [];
                  return [
                    {
                      locationId: warehouse.id,
                      locationName: warehouse.name,
                      available: level.available,
                      isPrimary: link.isPrimary,
                    },
                  ];
                }),
            },
          ];
        }),
      ),
    );
  }, [relevant, levelQueries, links.data, skus.data, transfers.data]);

  return { suggestions, isLoading: locations.isLoading || levelQueries.some((q) => q.isLoading) };
}
