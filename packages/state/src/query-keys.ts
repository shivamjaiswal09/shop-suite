import type { ClosingRequest, InvoiceFilter, MovementFilter, TransferFilter } from '@shop/data';

/** Every cache key in one place so invalidation stays predictable. */
export const qk = {
  company: ['company'] as const,
  stores: ['stores'] as const,
  locations: (kind?: string) => ['locations', kind ?? 'all'] as const,
  warehouses: ['locations', 'warehouse'] as const,
  linkedWarehouses: (storeId: string) => ['locations', 'linked-warehouses', storeId] as const,

  taxes: ['masters', 'taxes'] as const,
  uoms: ['masters', 'uoms'] as const,
  customers: ['masters', 'customers'] as const,
  suppliers: ['masters', 'suppliers'] as const,
  paymentMethods: ['masters', 'payment-methods'] as const,
  reasonCodes: (usage?: string) => ['masters', 'reason-codes', usage ?? 'all'] as const,

  products: ['products'] as const,
  skus: ['skus'] as const,
  skuSearch: (term: string) => ['skus', 'search', term] as const,

  stock: ['stock'] as const,
  stockLevels: (locationId: string) => ['stock', 'levels', locationId] as const,
  stockLevel: (skuId: string, locationId: string) => ['stock', 'level', skuId, locationId] as const,
  movements: (filter: MovementFilter) => ['stock', 'movements', filter] as const,

  transfers: (filter: TransferFilter) => ['transfers', filter] as const,

  orders: ['orders'] as const,
  invoices: (filter: InvoiceFilter) => ['invoices', filter] as const,
  invoice: (id: string) => ['invoices', 'one', id] as const,
  invoicePayments: (invoiceId: string) => ['payments', 'invoice', invoiceId] as const,

  closing: ['closing'] as const,
  closingPreview: (request: ClosingRequest) => ['closing', 'preview', request] as const,
  closings: (storeId?: string) => ['closing', 'list', storeId ?? 'all'] as const,

  purchaseOrders: ['purchases', 'orders'] as const,
  discrepancies: (storeId?: string) => ['discrepancies', storeId ?? 'all'] as const,
  audit: ['audit'] as const,
};
