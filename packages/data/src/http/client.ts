import type { Repositories } from '../repositories.ts';
import { createCatalogueRepositories } from './catalogue.ts';
import { createFetcher, type HttpConfig } from './fetcher.ts';
import { createIdentityRepositories } from './identity.ts';
import { createInventoryRepositories } from './inventory.ts';
import { createSalesRepositories } from './sales.ts';

export type { HttpConfig } from './fetcher.ts';
export { ApiError } from './fetcher.ts';

/**
 * The real implementation of `Repositories`, composed from three slices that
 * were built independently against the same interface.
 *
 * This is the payoff of the repository abstraction: swapping
 * `createMockRepositories()` for this in an app's one binding moves the whole
 * product from browser memory to Postgres without a single screen edit.
 *
 * Note what is NOT here: no company id, no user id, no token. Identity travels
 * as an httpOnly session cookie the browser attaches itself, and the server
 * derives tenancy from it. A client that could name its own company would be a
 * client that could read another tenant's data.
 */
export function createHttpRepositories(config: HttpConfig): Repositories {
  const fetcher = createFetcher(config);

  const identity = createIdentityRepositories(fetcher);
  const catalogue = createCatalogueRepositories(fetcher);
  const inventory = createInventoryRepositories(fetcher);
  const sales = createSalesRepositories(fetcher);

  return {
    auth: identity.auth,
    platform: identity.platform,
    org: identity.org,
    users: identity.users,

    masters: catalogue.masters,
    products: catalogue.products,

    stock: inventory.stock,
    transfers: inventory.transfers,

    orders: sales.orders,
    invoices: sales.invoices,
    payments: sales.payments,
    salesReturns: sales.salesReturns,
    purchases: sales.purchases,
    closing: sales.closing,
    discrepancies: sales.discrepancies,
    audit: sales.audit,
  };
}
