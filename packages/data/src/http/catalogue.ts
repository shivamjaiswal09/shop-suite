import type {
  BillFieldConfig,
  Brand,
  Category,
  Customer,
  PaymentMethod,
  Product,
  ReasonCode,
  Sku,
  Supplier,
  Tax,
  UnitOfMeasure,
} from '@shop/core';
import type { MasterRepository, ProductRepository } from '../repositories';
import { ApiError, num, type Fetcher } from './fetcher';

/**
 * The catalogue and masters slice, over HTTP.
 *
 * Two things are true here that were not true of the in-memory mock. Money and
 * quantity arrive as strings, because Postgres Decimal columns are serialised
 * that way to keep paise intact — so every one of them is read back through
 * `num()`. And the caller's identity is the session cookie, not a field: the
 * `createdBy` / `actorId` arguments the interface takes are deliberately not
 * sent, because a client-supplied author is not evidence of anything.
 */

/* ------------------------------------------------------------- wire shapes */

type Decimalish = string | number;

type TaxRow = Omit<Tax, 'rate'> & { rate: Decimalish };
type CustomerRow = Omit<Customer, 'creditLimit'> & { creditLimit: Decimalish };
type SkuRow = Omit<
  Sku,
  'purchasePrice' | 'sellingPrice' | 'mrp' | 'minStock' | 'reorderLevel'
> & {
  purchasePrice: Decimalish;
  sellingPrice: Decimalish;
  mrp?: Decimalish | null;
  minStock: Decimalish;
  reorderLevel: Decimalish;
};

const toTax = (row: TaxRow): Tax => ({ ...row, rate: num(row.rate) });

const toCustomer = (row: CustomerRow): Customer => ({
  ...row,
  creditLimit: num(row.creditLimit),
});

const toSku = (row: SkuRow): Sku => ({
  ...row,
  purchasePrice: num(row.purchasePrice),
  sellingPrice: num(row.sellingPrice),
  // `num(undefined)` is 0, and a SKU with no MRP is not a SKU priced at zero.
  mrp: row.mrp === undefined || row.mrp === null ? undefined : num(row.mrp),
  minStock: num(row.minStock),
  reorderLevel: num(row.reorderLevel),
});

/* ----------------------------------------------------------------- helpers */

/**
 * `includeInactive` is coerced server-side, where the string "false" is truthy.
 * Sending the flag only when it is set keeps the default — active rows only.
 */
const flag = (value?: boolean) => (value ? true : undefined);

/** Strips the actor before the input crosses the wire; see the header note. */
const body = <T extends { createdBy: string }>(input: T): Omit<T, 'createdBy'> => {
  const { createdBy, ...rest } = input;
  void createdBy;
  return rest;
};

/**
 * A miss is an answer, not a failure: scanning an unknown barcode means "no
 * such SKU", which the interface expresses as undefined rather than a throw.
 */
const orUndefined = async <T>(request: Promise<T>): Promise<T | undefined> => {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
};

export function createCatalogueRepositories(fetcher: Fetcher): {
  masters: MasterRepository;
  products: ProductRepository;
} {
  const masters: MasterRepository = {
    categories: (includeInactive) =>
      fetcher.get<Category[]>('/categories', { includeInactive: flag(includeInactive) }),
    unitsOfMeasure: (includeInactive) =>
      fetcher.get<UnitOfMeasure[]>('/units-of-measure', {
        includeInactive: flag(includeInactive),
      }),
    taxes: async (includeInactive) =>
      (
        await fetcher.get<TaxRow[]>('/taxes', { includeInactive: flag(includeInactive) })
      ).map(toTax),
    customers: async (includeInactive) =>
      (
        await fetcher.get<CustomerRow[]>('/customers', { includeInactive: flag(includeInactive) })
      ).map(toCustomer),
    suppliers: (includeInactive) =>
      fetcher.get<Supplier[]>('/suppliers', { includeInactive: flag(includeInactive) }),
    paymentMethods: (includeInactive) =>
      fetcher.get<PaymentMethod[]>('/payment-methods', { includeInactive: flag(includeInactive) }),
    reasonCodes: (usage, includeInactive) =>
      fetcher.get<ReasonCode[]>('/reason-codes', {
        usage,
        includeInactive: flag(includeInactive),
      }),

    createCategory: (input) => fetcher.post<Category>('/categories', body(input)),
    createUnitOfMeasure: (input) =>
      fetcher.post<UnitOfMeasure>('/units-of-measure', body(input)),
    createTax: async (input) => toTax(await fetcher.post<TaxRow>('/taxes', body(input))),
    createCustomer: async (input) =>
      toCustomer(await fetcher.post<CustomerRow>('/customers', body(input))),
    createSupplier: (input) => fetcher.post<Supplier>('/suppliers', body(input)),
    createPaymentMethod: (input) =>
      fetcher.post<PaymentMethod>('/payment-methods', body(input)),
    createReasonCode: (input) => fetcher.post<ReasonCode>('/reason-codes', body(input)),

    brands: (includeInactive) => fetcher.get<Brand[]>('/brands', { includeInactive }),

    createBrand: (input) => fetcher.post<Brand>('/brands', input),

    updateBrand: (id, patch) => fetcher.patch<Brand>(`/brands/${id}`, patch),

    deleteBrand: async (id) => {
      await fetcher.del<{ deleted: true }>(`/brands/${id}`);
    },

    billFields: (includeInactive) =>
      fetcher.get<BillFieldConfig[]>('/bill-fields', { includeInactive }),

    customerByPhone: (phone) => {
      // An empty needle would request `/customers/by-phone/`, a different route
      // entirely; refuse it here rather than relying on that returning a 404.
      const needle = phone.trim();
      if (!needle) return Promise.resolve(undefined);
      return orUndefined(fetcher.get<Customer>(`/customers/by-phone/${encodeURIComponent(needle)}`));
    },

    createBillField: (input) => fetcher.post<BillFieldConfig>('/bill-fields', input),

    updateBillField: (id, patch) => fetcher.patch<BillFieldConfig>(`/bill-fields/${id}`, patch),

    updateCategory: (id, patch) => fetcher.patch<Category>(`/categories/${id}`, patch),
    updateUnitOfMeasure: (id, patch) =>
      fetcher.patch<UnitOfMeasure>(`/units-of-measure/${id}`, patch),
    updateTax: async (id, patch) => toTax(await fetcher.patch<TaxRow>(`/taxes/${id}`, patch)),
    updateCustomer: async (id, patch) =>
      toCustomer(await fetcher.patch<CustomerRow>(`/customers/${id}`, patch)),
    updateSupplier: (id, patch) => fetcher.patch<Supplier>(`/suppliers/${id}`, patch),
    updatePaymentMethod: (id, patch) =>
      fetcher.patch<PaymentMethod>(`/payment-methods/${id}`, patch),
    updateReasonCode: (id, patch) => fetcher.patch<ReasonCode>(`/reason-codes/${id}`, patch),
  };

  const products: ProductRepository = {
    listProducts: (includeInactive) =>
      fetcher.get<Product[]>('/products', { includeInactive: flag(includeInactive) }),
    listSkus: async (includeInactive) =>
      (await fetcher.get<SkuRow[]>('/skus', { includeInactive: flag(includeInactive) })).map(toSku),

    skuById: async (id) => {
      const row = await orUndefined(fetcher.get<SkuRow>(`/skus/${id}`));
      return row && toSku(row);
    },
    skuByBarcode: async (barcode) => {
      const row = await orUndefined(
        fetcher.get<SkuRow>(`/skus/barcode/${encodeURIComponent(barcode.trim())}`),
      );
      return row && toSku(row);
    },
    searchSkus: async (term, limit) =>
      (await fetcher.get<SkuRow[]>('/skus/search', { term, limit })).map(toSku),

    createProduct: (input) => fetcher.post<Product>('/products', body(input)),
    createSku: async (input) => toSku(await fetcher.post<SkuRow>('/skus', body(input))),
    updateProduct: (id, patch) => fetcher.patch<Product>(`/products/${id}`, patch),
    updateSku: async (id, patch) => toSku(await fetcher.patch<SkuRow>(`/skus/${id}`, patch)),
  };

  return { masters, products };
}
