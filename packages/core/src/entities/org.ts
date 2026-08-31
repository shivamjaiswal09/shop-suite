import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';

export const companySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  legalName: z.string().min(1),
  gstin: z.string().optional(),
  currency: z.string().default('INR'),
  timezone: z.string().default('Asia/Kolkata'),
  active: z.boolean().default(true),
  createdAt: timestampSchema,
});
export type Company = z.infer<typeof companySchema>;

/**
 * Stores and warehouses are independent peers, not a hierarchy. Both hold
 * stock, so both are stock locations and share one id space — which is what
 * lets a transfer be `location → location` with no special-casing.
 *
 *   store     — sells to customers; holds its own shelf stock
 *   warehouse — holds bulk stock; never sells; replenishes stores
 */
export const locationKindSchema = z.enum(['store', 'warehouse']);
export type LocationKind = z.infer<typeof locationKindSchema>;

export const stockLocationSchema = z.object({
  id: idSchema,
  companyId: idSchema,
  kind: locationKindSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  /** Stores may be separately GST-registered; warehouses usually are not. */
  gstin: z.string().optional(),
  active: z.boolean().default(true),
});
export type StockLocation = z.infer<typeof stockLocationSchema>;

/** A location narrowed to one kind — for APIs that only accept one. */
export type Store = StockLocation & { kind: 'store' };
export type Warehouse = StockLocation & { kind: 'warehouse' };

export const isStore = (location: StockLocation): location is Store => location.kind === 'store';
export const isWarehouse = (location: StockLocation): location is Warehouse =>
  location.kind === 'warehouse';

/**
 * Many-to-many: a warehouse may supply several stores, and a store may be
 * supplied by several warehouses. The link governs replenishment routing and
 * which warehouses a store can see stock in — it does NOT let a store bill
 * against warehouse stock (a store sells only what is on its own shelves).
 */
export const storeWarehouseLinkSchema = z.object({
  id: idSchema,
  storeId: idSchema,
  warehouseId: idSchema,
  /** The default source when replenishing this store. At most one per store. */
  isPrimary: z.boolean().default(false),
});
export type StoreWarehouseLink = z.infer<typeof storeWarehouseLinkSchema>;

export const configScopeSchema = z.enum(['company', 'store', 'warehouse']);
export type ConfigScope = z.infer<typeof configScopeSchema>;

export const configSchema = z.object({
  id: idSchema,
  scope: configScopeSchema,
  scopeId: idSchema,
  key: z.string().min(1),
  value: z.string(),
});
export type Config = z.infer<typeof configSchema>;
