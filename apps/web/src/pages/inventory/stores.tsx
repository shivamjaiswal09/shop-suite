import { useAccessibleStores } from '@shop/state';
import { LocationStockView } from './location-stock-view';

/** Shelf stock at the stores — what is actually sellable. */
export function StoreStockPage() {
  const stores = useAccessibleStores();

  return (
    <LocationStockView
      title="Store Stock"
      description="Shelf stock across every store you have access to — this is what can be billed."
      locations={stores.data}
      allLabel="All stores (combined)"
      isLoading={stores.isLoading}
      emptyHint="You have no store access."
    />
  );
}
