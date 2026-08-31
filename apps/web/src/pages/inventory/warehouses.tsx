import { useWarehouses } from '@shop/state';
import { LocationStockView } from './location-stock-view';

/** Bulk stock in the warehouses — not sellable until transferred to a store. */
export function WarehouseStockPage() {
  const warehouses = useWarehouses();

  return (
    <LocationStockView
      title="Warehouse Stock"
      description="Bulk stock held in warehouses. Transfer it to a store before it can be sold."
      locations={warehouses.data ?? []}
      allLabel="All warehouses (combined)"
      isLoading={warehouses.isLoading}
      emptyHint="No warehouses configured."
    />
  );
}
