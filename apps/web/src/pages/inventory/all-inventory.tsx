import { useLocations } from '@shop/state';
import { LocationStockView } from './location-stock-view';

/** Everything the company holds, stores and warehouses together. */
export function AllInventoryPage() {
  const locations = useLocations();

  return (
    <LocationStockView
      title="Total Inventory"
      description="Every store and warehouse combined — the company-wide position."
      locations={locations.data ?? []}
      allLabel="Everything (stores + warehouses)"
      isLoading={locations.isLoading}
      emptyHint="No locations configured."
    />
  );
}
