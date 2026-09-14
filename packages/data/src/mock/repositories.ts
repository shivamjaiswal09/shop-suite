import {
  type BillFieldConfig,
  calcClosing,
  calcTotals,
  deriveInventoryLevel,
  byCategoryOrder,
  calcRefund,
  categorySchema,
  needsDiscrepancy,
  priceLine,
  customerSchema,
  paymentMethodSchema,
  productSchema,
  reasonCodeSchema,
  returnableLines,
  roundMoney,
  roundQty,
  signedQty,
  skuSchema,
  stockLocationSchema,
  storeWarehouseLinkSchema,
  summarizeSalesByMethod,
  supplierSchema,
  taxSchema,
  unitOfMeasureSchema,
  userSchema,
  type DayEndClosing,
  type InventoryLevel,
  type Invoice,
  type Order,
  type GoodsReceipt,
  type Payment,
  type PurchaseOrder,
  type PurchaseReturn,
  type SaleLine,
  type SalesReturn,
  type Sku,
  type StockMovement,
  type StockReservation,
  type StockTransfer,
} from '@shop/core';
import type {
  AuditRepository,
  AuthRepository,
  CapturePayment,
  ClosingPreview,
  ClosingRepository,
  ClosingRequest,
  DiscrepancyRepository,
  InvoiceFilter,
  InvoiceRepository,
  MasterRepository,
  MovementFilter,
  NewInvoice,
  NewMovement,
  NewOrder,
  OrderFilter,
  OrderRepository,
  OrgRepository,
  PlatformRepository,
  ProductRepository,
  PurchaseRepository,
  Repositories,
  SaleLineInput,
  SalesReturnRepository,
  StockRepository,
  SubmitClosing,
  TransferRepository,
  UserRepository,
} from '../repositories';
import { createSeededStore } from './seed';
import { InMemoryStore } from './store';

/** Small delay so the UI exercises real loading states. */
const LATENCY_MS = 30;
const tick = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

export class InsufficientStockError extends Error {
  constructor(
    readonly skuId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Insufficient stock: requested ${requested}, available ${available}`);
    this.name = 'InsufficientStockError';
  }
}

export class DuplicateBarcodeError extends Error {
  constructor(readonly barcode: string) {
    super(`Barcode ${barcode} is already assigned to another SKU`);
    this.name = 'DuplicateBarcodeError';
  }
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/** Default opening float when no prior closing carried cash forward. */
const DEFAULT_OPENING_CASH = 2000;

export class MockRepositories implements Repositories {
  constructor(readonly store: InMemoryStore = createSeededStore()) {}

  /* ------------------------------------------------------------------ org */
  org: OrgRepository = {
    company: () => tick(this.store.company),
    locations: (kind, includeInactive) =>
      tick(
        this.store.locations.filter(
          (l) => (includeInactive || l.active) && (!kind || l.kind === kind),
        ),
      ),
    stores: () => tick(this.store.stores().filter((l) => l.active)),
    warehouses: () => tick(this.store.warehouses().filter((l) => l.active)),
    linkedWarehouses: (storeId) => {
      const ids = this.store.storeWarehouseLinks
        .filter((link) => link.storeId === storeId)
        .map((link) => link.warehouseId);
      return tick(this.store.locations.filter((l) => l.active && ids.includes(l.id)));
    },
    linkedStores: (warehouseId) => {
      const ids = this.store.storeWarehouseLinks
        .filter((link) => link.warehouseId === warehouseId)
        .map((link) => link.storeId);
      return tick(this.store.locations.filter((l) => l.active && ids.includes(l.id)));
    },
    links: () => tick(this.store.storeWarehouseLinks),

    createLocation: async (input) => {
      const code = input.code.trim().toUpperCase();
      if (this.store.locations.some((l) => l.code.toUpperCase() === code)) {
        throw new Error(`Location code ${code} already exists`);
      }
      const location = stockLocationSchema.parse({
        id: this.store.nextId('loc'),
        companyId: this.store.company.id,
        kind: input.kind,
        code,
        name: input.name.trim(),
        addressLine: input.addressLine,
        city: input.city,
        state: input.state,
        phone: input.phone,
        gstin: input.gstin,
        active: true,
      });
      this.store.locations.push(location);
      this.store.bumpAudit({
        entity: 'stock_location',
        entityId: location.id,
        action: 'create',
        summary: `${input.kind === 'store' ? 'Store' : 'Warehouse'} ${location.name} created`,
        actorId: input.createdBy,
        locationId: location.id,
      });
      return tick(location);
    },

    linkWarehouse: async (input) => {
      const store = this.store.locationById(input.storeId);
      const warehouse = this.store.locationById(input.warehouseId);
      if (store?.kind !== 'store') throw new Error('Link source must be a store');
      if (warehouse?.kind !== 'warehouse') throw new Error('Link target must be a warehouse');
      if (
        this.store.storeWarehouseLinks.some(
          (l) => l.storeId === input.storeId && l.warehouseId === input.warehouseId,
        )
      ) {
        throw new Error(`${warehouse.name} already supplies ${store.name}`);
      }

      // At most one primary source per store.
      if (input.isPrimary) {
        for (const link of this.store.storeWarehouseLinks) {
          if (link.storeId === input.storeId) link.isPrimary = false;
        }
      }

      const link = storeWarehouseLinkSchema.parse({
        id: this.store.nextId('lnk'),
        storeId: input.storeId,
        warehouseId: input.warehouseId,
        isPrimary: Boolean(input.isPrimary),
      });
      this.store.storeWarehouseLinks.push(link);
      this.store.bumpAudit({
        entity: 'store_warehouse_link',
        entityId: link.id,
        action: 'create',
        summary: `${warehouse.name} now supplies ${store.name}`,
        actorId: input.createdBy,
        locationId: store.id,
      });
      return tick(link);
    },

    unlinkWarehouse: async (linkId, actorId) => {
      const index = this.store.storeWarehouseLinks.findIndex((l) => l.id === linkId);
      if (index < 0) throw new NotFoundError('StoreWarehouseLink', linkId);
      const [removed] = this.store.storeWarehouseLinks.splice(index, 1);
      this.store.bumpAudit({
        entity: 'store_warehouse_link',
        entityId: linkId,
        action: 'delete',
        summary: `Supply link removed`,
        actorId,
        locationId: removed?.storeId,
      });
      return tick(undefined);
    },

    updateLocation: async (id, patch, actorId) => {
      if (patch.code) {
        const code = patch.code.trim().toUpperCase();
        if (this.store.locations.some((l) => l.id !== id && l.code.toUpperCase() === code)) {
          throw new Error(`Location code ${code} already exists`);
        }
        patch = { ...patch, code };
      }
      return tick(
        this.patchRecord({
          rows: this.store.locations,
          id,
          patch,
          schema: stockLocationSchema,
          entity: 'stock_location',
          label: (l) => `${l.kind === 'store' ? 'Store' : 'Warehouse'} ${l.name} updated`,
          actorId,
        }),
      );
    },

    setPrimaryWarehouse: async (linkId, actorId) => {
      const link = this.store.storeWarehouseLinks.find((l) => l.id === linkId);
      if (!link) throw new NotFoundError('StoreWarehouseLink', linkId);
      for (const other of this.store.storeWarehouseLinks) {
        if (other.storeId === link.storeId) other.isPrimary = other.id === linkId;
      }
      this.store.bumpAudit({
        entity: 'store_warehouse_link',
        entityId: link.id,
        action: 'update',
        summary: 'Primary supply source changed',
        actorId,
        locationId: link.storeId,
      });
      return tick(link);
    },
  };

  /**
   * Offline/dev auth. There is no password store in memory and there should not
   * be one: a credential a browser can read is not a credential. Any password
   * is accepted so the mock stays usable for UI work — the real check lives in
   * the API, which is what production runs against.
   */
  auth: AuthRepository = {
    signIn: async (email) => {
      const user = this.store.users.find(
        (u) => u.active && u.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!user) throw new Error('Email or password is incorrect');
      this.signedInUserId = user.id;
      return tick({
        user,
        company: this.store.company,
        permissions: this.store.roles.find((r) => r.id === user.roleId)?.permissions ?? [],
        locationIds: user.locationIds,
      });
    },

    signOut: async () => {
      this.signedInUserId = undefined;
      return tick(undefined);
    },

    me: async () => {
      const user = this.store.users.find((u) => u.id === this.signedInUserId);
      if (!user) return tick(null);
      return tick({
        user,
        company: this.store.company,
        permissions: this.store.roles.find((r) => r.id === user.roleId)?.permissions ?? [],
        locationIds: user.locationIds,
      });
    },

    changePassword: async () => {
      throw new Error('Password changes require the API — the mock stores no credentials');
    },
  };

  /**
   * The mock is single-tenant by construction — there is one seeded company and
   * no super admin — so platform administration has nothing to operate on.
   */
  platform: PlatformRepository = {
    companies: async () => tick([this.store.company]),
    createCompany: async () => {
      throw new Error('Creating companies requires the API');
    },
    updateCompany: async () => {
      throw new Error('Creating companies requires the API');
    },
    deleteCompany: async () => {
      throw new Error('Deleting companies requires the API');
    },
    usersIn: async () => tick(this.store.users),
    rolesIn: async () => tick(this.store.roles),
    createUserIn: async () => {
      throw new Error('Creating users requires the API');
    },
    setPassword: async () => {
      throw new Error('Passwords require the API — the mock stores no credentials');
    },
    deleteUser: async () => {
      throw new Error('Deleting users requires the API');
    },
  };

  private signedInUserId?: string;

  users: UserRepository = {
    list: () => tick(this.store.users),
    byId: (id) => tick(this.store.users.find((u) => u.id === id)),
    roles: () => tick(this.store.roles),
    authenticate: (email) =>
      tick(this.store.users.find((u) => u.active && u.email.toLowerCase() === email.trim().toLowerCase())),

    create: async (input) => {
      const email = input.email.trim().toLowerCase();
      if (this.store.users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error(`A user with ${email} already exists`);
      }
      if (!this.store.roles.some((r) => r.id === input.roleId)) {
        throw new NotFoundError('Role', input.roleId);
      }
      const user = userSchema.parse({
        id: this.store.nextId('usr'),
        companyId: this.store.company.id,
        name: input.name.trim(),
        email,
        phone: input.phone,
        roleId: input.roleId,
        storeIds: input.storeIds,
        locationIds: [],
        active: true,
        createdAt: this.store.now(),
      });
      this.store.users.push(user);
      this.store.bumpAudit({
        entity: 'user',
        entityId: user.id,
        action: 'create',
        summary: `User ${user.name} created`,
        actorId: input.createdBy,
      });
      return tick(user);
    },

    update: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.users,
          id,
          patch,
          schema: userSchema,
          entity: 'user',
          label: (u) => `User ${u.name} updated`,
          actorId,
        }),
      ),
  };

  masters: MasterRepository = {
    categories: (all) =>
      tick(this.store.categories.filter((c) => all || c.active).slice().sort(byCategoryOrder)),

    createCategory: async (input) => {
      const code = input.code.trim().toUpperCase();
      this.assertUniqueCode(this.store.categories, code, 'Category');
      const category = categorySchema.parse({
        id: this.store.nextId('cat'),
        companyId: this.store.company.id,
        code,
        name: input.name.trim(),
        sortOrder: input.sortOrder ?? this.store.categories.length,
        defaultTaxId: input.defaultTaxId || undefined,
        description: input.description,
        active: true,
      });
      this.store.categories.push(category);
      this.logCreate('category', category.id, `Category ${category.name} created`, input.createdBy);
      return tick(category);
    },

    updateCategory: async (id, patch, actorId) => {
      if (patch.code) {
        const code = patch.code.trim().toUpperCase();
        if (this.store.categories.some((c) => c.id !== id && c.code.toUpperCase() === code)) {
          throw new Error(`Category code ${code} already exists`);
        }
        patch = { ...patch, code };
      }
      return tick(
        this.patchRecord({
          rows: this.store.categories,
          id,
          patch,
          schema: categorySchema,
          entity: 'category',
          label: (c) => `Category ${c.name} updated`,
          actorId,
        }),
      );
    },

    unitsOfMeasure: (all) => tick(this.store.unitsOfMeasure.filter((r) => all || r.active)),
    taxes: (all) => tick(this.store.taxes.filter((r) => all || r.active)),
    customers: (all) => tick(this.store.customers.filter((c) => all || c.active)),
    suppliers: (all) => tick(this.store.suppliers.filter((s) => all || s.active)),
    paymentMethods: (all) => tick(this.store.paymentMethods.filter((p) => all || p.active)),
    reasonCodes: (usage, all) =>
      tick(this.store.reasonCodes.filter((r) => (all || r.active) && (!usage || r.usage === usage))),

    createUnitOfMeasure: async (input) => {
      const uom = unitOfMeasureSchema.parse({
        id: this.store.nextId('uom'),
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        precision: input.precision ?? 0,
        active: true,
      });
      this.assertUniqueCode(this.store.unitsOfMeasure, uom.code, 'Unit of measure');
      this.store.unitsOfMeasure.push(uom);
      this.logCreate('unit_of_measure', uom.id, `UoM ${uom.code} created`, input.createdBy);
      return tick(uom);
    },

    createTax: async (input) => {
      const tax = taxSchema.parse({
        id: this.store.nextId('tax'),
        name: input.name.trim(),
        rate: input.rate,
        inclusive: input.inclusive,
        hsnCode: input.hsnCode,
        active: true,
      });
      this.store.taxes.push(tax);
      this.logCreate('tax', tax.id, `Tax ${tax.name} created`, input.createdBy);
      return tick(tax);
    },

    createCustomer: async (input) => {
      const customer = customerSchema.parse({
        id: this.store.nextId('cus'),
        companyId: this.store.company.id,
        name: input.name.trim(),
        phone: input.phone,
        email: input.email || undefined,
        gstin: input.gstin,
        creditLimit: input.creditLimit ?? 0,
        active: true,
      });
      this.store.customers.push(customer);
      this.logCreate('customer', customer.id, `Customer ${customer.name} created`, input.createdBy);
      return tick(customer);
    },

    createSupplier: async (input) => {
      const supplier = supplierSchema.parse({
        id: this.store.nextId('sup'),
        companyId: this.store.company.id,
        name: input.name.trim(),
        phone: input.phone,
        email: input.email || undefined,
        gstin: input.gstin,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        active: true,
      });
      this.store.suppliers.push(supplier);
      this.logCreate('supplier', supplier.id, `Supplier ${supplier.name} created`, input.createdBy);
      return tick(supplier);
    },

    createPaymentMethod: async (input) => {
      const method = paymentMethodSchema.parse({
        id: this.store.nextId('pmt'),
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        kind: input.kind,
        countedInDrawer: input.countedInDrawer,
        active: true,
      });
      this.assertUniqueCode(this.store.paymentMethods, method.code, 'Payment method');
      this.store.paymentMethods.push(method);
      this.logCreate('payment_method', method.id, `Payment method ${method.name} created`, input.createdBy);
      return tick(method);
    },

    billFields: (includeInactive) =>
      tick(
        this.store.billFields
          .filter((f) => includeInactive || f.active)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
      ),

    customerByPhone: (phone) => {
      // An empty needle must not match the customers who have no phone.
      const needle = phone.trim();
      return tick(
        needle ? this.store.customers.find((c) => c.active && c.phone === needle) : undefined,
      );
    },

    createBillField: async (input) => {
      const key = input.key.trim();
      if (this.store.billFields.some((f) => f.key.toLowerCase() === key.toLowerCase())) {
        throw new Error(`A bill field with the key ${key} already exists`);
      }
      const field: BillFieldConfig = {
        id: this.store.nextId('bfl'),
        companyId: this.store.company.id,
        builtin: input.builtin ?? null,
        key,
        label: input.label.trim(),
        scope: input.scope,
        type: input.type ?? 'text',
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? this.store.billFields.length * 10,
        active: true,
      };
      this.store.billFields.push(field);
      return tick(field);
    },

    updateBillField: async (id, patch, actorId) => {
      const field = this.store.billFields.find((f) => f.id === id);
      if (!field) throw new NotFoundError('BillFieldConfig', id);
      // `key` is absent from the patch type on purpose: invoices already store
      // answers against it.
      Object.assign(field, patch, patch.label ? { label: patch.label.trim() } : {});
      this.store.bumpAudit({
        entity: 'bill_field',
        entityId: id,
        action: 'update',
        summary: `Bill field ${field.label} updated`,
        actorId,
      });
      return tick(field);
    },

    createReasonCode: async (input) => {
      const reason = reasonCodeSchema.parse({
        id: this.store.nextId('rsn'),
        usage: input.usage,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        active: true,
      });
      this.store.reasonCodes.push(reason);
      this.logCreate('reason_code', reason.id, `Reason ${reason.code} created`, input.createdBy);
      return tick(reason);
    },

    updateUnitOfMeasure: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.unitsOfMeasure,
          id,
          patch,
          schema: unitOfMeasureSchema,
          entity: 'unit_of_measure',
          label: (r) => `UoM ${r.code} updated`,
          actorId,
        }),
      ),

    updateTax: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.taxes,
          id,
          patch,
          schema: taxSchema,
          entity: 'tax',
          label: (r) => `Tax ${r.name} updated`,
          actorId,
        }),
      ),

    updateCustomer: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.customers,
          id,
          patch,
          schema: customerSchema,
          entity: 'customer',
          label: (r) => `Customer ${r.name} updated`,
          actorId,
        }),
      ),

    updateSupplier: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.suppliers,
          id,
          patch,
          schema: supplierSchema,
          entity: 'supplier',
          label: (r) => `Supplier ${r.name} updated`,
          actorId,
        }),
      ),

    updatePaymentMethod: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.paymentMethods,
          id,
          patch,
          schema: paymentMethodSchema,
          entity: 'payment_method',
          label: (r) => `Payment method ${r.name} updated`,
          actorId,
        }),
      ),

    updateReasonCode: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.reasonCodes,
          id,
          patch,
          schema: reasonCodeSchema,
          entity: 'reason_code',
          label: (r) => `Reason ${r.code} updated`,
          actorId,
        }),
      ),
  };

  products: ProductRepository = {
    listProducts: (all) => tick(this.store.products.filter((p) => all || p.active)),
    listSkus: (all) => tick(this.store.skus.filter((s) => all || s.active)),
    skuById: (id) => tick(this.store.skus.find((s) => s.id === id)),
    skuByBarcode: (barcode) => {
      // An empty needle must not match the SKUs that have no barcode.
      const needle = barcode.trim();
      return tick(needle ? this.store.skus.find((s) => s.active && s.barcode === needle) : undefined);
    },
    searchSkus: (term, limit = 20) => {
      const needle = term.trim().toLowerCase();
      if (!needle) return tick<Sku[]>([]);
      const exact = this.store.skus.filter((s) => s.active && s.barcode === needle);
      const fuzzy = this.store.skus.filter(
        (s) =>
          s.active &&
          s.barcode !== needle &&
          (s.code.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)),
      );
      return tick([...exact, ...fuzzy].slice(0, limit));
    },

    createProduct: async (input) => {
      if (!this.store.categories.some((c) => c.id === input.categoryId)) {
        throw new NotFoundError('Category', input.categoryId);
      }
      const product = productSchema.parse({
        id: this.store.nextId('prd'),
        companyId: this.store.company.id,
        name: input.name,
        categoryId: input.categoryId,
        brand: input.brand,
        description: input.description,
        active: true,
        createdAt: this.store.now(),
      });
      this.store.products.push(product);
      this.store.bumpAudit({
        entity: 'product',
        entityId: product.id,
        action: 'create',
        summary: `Product ${product.name} created`,
        actorId: input.createdBy,
      });
      return tick(product);
    },

    createSku: async (input) => {
      const parent = this.store.products.find((p) => p.id === input.productId);
      if (!parent) {
        throw new NotFoundError('Product', input.productId);
      }
      // Only a real barcode can clash — any number of SKUs may have none.
      const barcode = input.barcode?.trim() || null;
      if (barcode && this.store.skus.some((s) => s.barcode === barcode)) {
        throw new DuplicateBarcodeError(barcode);
      }
      if (this.store.skus.some((s) => s.code.toLowerCase() === input.code.trim().toLowerCase())) {
        throw new Error(`SKU code ${input.code} already exists`);
      }

      const sku = skuSchema.parse({
        id: this.store.nextId('sku'),
        productId: input.productId,
        code: input.code.trim(),
        // A bill prints the SKU name, so an unnamed SKU borrows its product's.
        name: input.name?.trim() || parent.name,
        barcode,
        uomId: input.uomId,
        taxId: input.taxId,
        purchasePrice: input.purchasePrice ?? 0,
        sellingPrice: input.sellingPrice ?? 0,
        mrp: input.mrp,
        minStock: input.minStock ?? 0,
        reorderLevel: input.reorderLevel ?? 0,
        active: true,
      });
      this.store.skus.push(sku);

      if (input.openingStock && input.openingStock.qty > 0) {
        this.postMovements([
          {
            skuId: sku.id,
            locationId: input.openingStock.locationId,
            type: 'opening',
            qty: input.openingStock.qty,
            refType: 'opening',
            refId: sku.id,
            unitCost: sku.purchasePrice,
            note: 'Opening stock on SKU creation',
            createdBy: input.createdBy,
          },
        ]);
      }

      this.store.bumpAudit({
        entity: 'sku',
        entityId: sku.id,
        action: 'create',
        summary: `SKU ${sku.code} created${input.openingStock ? ` with opening stock ${input.openingStock.qty}` : ''}`,
        actorId: input.createdBy,
      });
      return tick(sku);
    },

    updateProduct: async (id, patch, actorId) =>
      tick(
        this.patchRecord({
          rows: this.store.products,
          id,
          patch,
          schema: productSchema,
          entity: 'product',
          label: (p) => `Product ${p.name} updated`,
          actorId,
        }),
      ),

    updateSku: async (id, patch, actorId) => {
      if (patch.barcode !== undefined) {
        // '' and null both mean "no barcode"; only a real one can clash.
        const barcode = patch.barcode?.trim() || null;
        if (barcode && this.store.skus.some((s) => s.id !== id && s.barcode === barcode)) {
          throw new DuplicateBarcodeError(barcode);
        }
        patch = { ...patch, barcode };
      }
      if (patch.code) {
        const code = patch.code.trim();
        if (this.store.skus.some((s) => s.id !== id && s.code.toLowerCase() === code.toLowerCase())) {
          throw new Error(`SKU code ${code} already exists`);
        }
        patch = { ...patch, code };
      }
      return tick(
        this.patchRecord({
          rows: this.store.skus,
          id,
          patch,
          schema: skuSchema,
          entity: 'sku',
          label: (s) => `SKU ${s.code} updated`,
          actorId,
        }),
      );
    },
  };

  /* ---------------------------------------------------------------- stock */
  stock: StockRepository = {
    levelFor: (skuId, locationId) => tick(this.levelFor(skuId, locationId)),
    levels: (locationId) =>
      tick(
        this.store.skus
          .filter((s) => s.active)
          .map((s) => this.levelFor(s.id, locationId))
          .sort((a, b) => a.skuId.localeCompare(b.skuId)),
      ),
    movements: (filter: MovementFilter = {}) => {
      const rows = this.store.movements
        .filter(
          (m) =>
            (!filter.skuId || m.skuId === filter.skuId) &&
            (!filter.locationId || m.locationId === filter.locationId) &&
            (!filter.type || m.type === filter.type),
        )
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return tick(filter.limit ? rows.slice(0, filter.limit) : rows);
    },
    post: (movements) => tick(this.postMovements(movements)),
  };

  /* ------------------------------------------------------------ transfers */
  transfers: TransferRepository = {
    create: async (input) => {
      const from = this.store.locationById(input.fromLocationId);
      const to = this.store.locationById(input.toLocationId);
      if (!from) throw new NotFoundError('StockLocation', input.fromLocationId);
      if (!to) throw new NotFoundError('StockLocation', input.toLocationId);
      if (from.id === to.id) throw new Error('Source and destination must differ');
      if (input.lines.length === 0) throw new Error('A transfer needs at least one line');

      // Availability is checked against the source before anything is written.
      for (const line of input.lines) {
        if (line.qty <= 0) throw new Error('Transfer quantities must be positive');
        const level = this.levelFor(line.skuId, from.id);
        if (level.available < line.qty) {
          throw new InsufficientStockError(line.skuId, line.qty, level.available);
        }
      }

      const at = this.store.now();
      const autoReceived = Boolean(input.autoReceive);
      const transfer: StockTransfer = {
        id: this.store.nextId('trf'),
        number: this.store.nextNumber('TRF', this.locationCode(from.id)),
        fromLocationId: from.id,
        toLocationId: to.id,
        lines: input.lines.map((line) => ({
          skuId: line.skuId,
          qty: line.qty,
          receivedQty: autoReceived ? line.qty : 0,
        })),
        status: autoReceived ? 'received' : 'in_transit',
        note: input.note,
        dispatchedBy: input.createdBy,
        dispatchedAt: at,
        receivedBy: autoReceived ? input.createdBy : undefined,
        receivedAt: autoReceived ? at : undefined,
      };

      for (const line of transfer.lines) {
        this.store.appendMovement({
          id: this.store.nextId('mov'),
          skuId: line.skuId,
          locationId: from.id,
          type: 'transfer_out',
          qty: signedQty('transfer_out', line.qty),
          refType: 'transfer',
          refId: transfer.id,
          note: input.note,
          createdBy: input.createdBy,
          createdAt: at,
        });

        if (autoReceived) {
          this.store.appendMovement({
            id: this.store.nextId('mov'),
            skuId: line.skuId,
            locationId: to.id,
            type: 'transfer_in',
            qty: signedQty('transfer_in', line.qty),
            refType: 'transfer',
            refId: transfer.id,
            createdBy: input.createdBy,
            createdAt: at,
          });
        }
      }

      this.store.transfers.push(transfer);
      this.store.bumpAudit({
        entity: 'stock_transfer',
        entityId: transfer.id,
        action: 'create',
        summary: autoReceived
          ? `Transfer ${transfer.number} moved ${transfer.lines.length} SKU(s) ${from.code} → ${to.code}`
          : `Transfer ${transfer.number} dispatched ${from.code} → ${to.code}`,
        actorId: input.createdBy,
        locationId: from.id,
      });
      return tick(transfer);
    },

    list: (filter = {}) =>
      tick(
        this.store.transfers
          .filter(
            (t) =>
              (!filter.status || t.status === filter.status) &&
              (!filter.locationId ||
                t.fromLocationId === filter.locationId ||
                t.toLocationId === filter.locationId),
          )
          .slice()
          .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt)),
      ),

    byId: (id) => tick(this.store.transfers.find((t) => t.id === id)),

    receive: async (input) => {
      const transfer = this.store.transfers.find((t) => t.id === input.transferId);
      if (!transfer) throw new NotFoundError('StockTransfer', input.transferId);
      if (transfer.status !== 'in_transit') {
        throw new Error(`Transfer ${transfer.number} is ${transfer.status}`);
      }

      const counts = new Map((input.lines ?? []).map((l) => [l.skuId, l.receivedQty]));
      const at = this.store.now();
      const destination = this.store.locationById(transfer.toLocationId)!;

      for (const line of transfer.lines) {
        const received = counts.get(line.skuId) ?? line.qty;
        if (received < 0) throw new Error('Received quantity cannot be negative');
        if (received > line.qty) {
          throw new Error(`Cannot receive more than the ${line.qty} dispatched`);
        }
        line.receivedQty = received;

        if (received > 0) {
          this.store.appendMovement({
            id: this.store.nextId('mov'),
            skuId: line.skuId,
            locationId: transfer.toLocationId,
            type: 'transfer_in',
            qty: signedQty('transfer_in', received),
            refType: 'transfer',
            refId: transfer.id,
            note: input.note,
            createdBy: input.receivedBy,
            createdAt: at,
          });
        }

        // Anything dispatched but not received is lost in transit — that is a
        // stock discrepancy, not something to quietly absorb.
        const shortfall = roundMoney(line.qty - received);
        if (shortfall > 0) {
          this.store.discrepancies.push({
            id: this.store.nextId('dsc'),
            kind: 'stock',
            locationId: destination.id,
            businessDate: this.store.businessDate(at),
            refType: 'stock_transfer',
            refId: transfer.id,
            expected: line.qty,
            actual: received,
            variance: roundMoney(received - line.qty),
            note: `Short receipt on ${transfer.number}`,
            status: 'open',
            raisedBy: input.receivedBy,
            raisedAt: at,
          });
        }
      }

      transfer.status = 'received';
      transfer.receivedBy = input.receivedBy;
      transfer.receivedAt = at;

      this.store.bumpAudit({
        entity: 'stock_transfer',
        entityId: transfer.id,
        action: 'update',
        summary: `Transfer ${transfer.number} received`,
        actorId: input.receivedBy,
        locationId: destination.id,
      });
      return tick(transfer);
    },

    cancel: async (transferId, cancelledBy) => {
      const transfer = this.store.transfers.find((t) => t.id === transferId);
      if (!transfer) throw new NotFoundError('StockTransfer', transferId);
      if (transfer.status !== 'in_transit') {
        throw new Error(`Only an in-transit transfer can be cancelled`);
      }

      const at = this.store.now();
      // Return the goods to the source rather than deleting the dispatch — the
      // ledger is append-only, so a reversal is the only honest way back.
      for (const line of transfer.lines) {
        this.store.appendMovement({
          id: this.store.nextId('mov'),
          skuId: line.skuId,
          locationId: transfer.fromLocationId,
          type: 'transfer_in',
          qty: signedQty('transfer_in', line.qty),
          refType: 'transfer',
          refId: transfer.id,
          note: `Cancelled ${transfer.number} — returned to source`,
          createdBy: cancelledBy,
          createdAt: at,
        });
      }

      transfer.status = 'cancelled';
      transfer.cancelledBy = cancelledBy;
      transfer.cancelledAt = at;

      this.store.bumpAudit({
        entity: 'stock_transfer',
        entityId: transfer.id,
        action: 'cancel',
        summary: `Transfer ${transfer.number} cancelled, stock returned to source`,
        actorId: cancelledBy,
      });
      return tick(transfer);
    },
  };

  /* --------------------------------------------------------------- orders */
  orders: OrderRepository = {
    create: async (input: NewOrder) => {
      const lines = this.priceLines(input.lines);
      const order: Order = {
        id: this.store.nextId('ord'),
        number: this.store.nextNumber('SO', this.locationCode(input.storeId)),
        storeId: input.storeId,
        customerId: input.customerId,
        status: 'confirmed',
        lines,
        totals: calcTotals(lines),
        createdBy: input.createdBy,
        createdAt: this.store.now(),
      };
      this.assertAvailable(lines, input.storeId);
      this.store.orders.push(order);

      for (const line of lines) {
        const reservation: StockReservation = {
          id: this.store.nextId('res'),
          skuId: line.skuId,
          locationId: input.storeId,
          qty: line.qty,
          refType: 'order',
          refId: order.id,
          status: 'active',
          createdAt: order.createdAt,
        };
        this.store.reservations.push(reservation);
      }

      this.store.bumpAudit({
        entity: 'order',
        entityId: order.id,
        action: 'create',
        summary: `Order ${order.number} confirmed for ₹${order.totals.grandTotal}`,
        actorId: input.createdBy,
        locationId: input.storeId,
      });
      return tick(order);
    },

    list: (filter: OrderFilter = {}) =>
      tick(
        this.store.orders
          .filter((o) => (!filter.storeId || o.storeId === filter.storeId) && (!filter.status || o.status === filter.status))
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),

    byId: (id) => tick(this.store.orders.find((o) => o.id === id)),

    convertToInvoice: async (orderId, counterId, createdBy) => {
      const order = this.store.orders.find((o) => o.id === orderId);
      if (!order) throw new NotFoundError('Order', orderId);
      if (order.status !== 'confirmed') throw new Error(`Order ${order.number} is ${order.status}`);

      for (const reservation of this.store.reservations) {
        if (reservation.refId === order.id && reservation.status === 'active') {
          reservation.status = 'consumed';
        }
      }

      const invoice = this.writeInvoice({
        storeId: order.storeId,
        counterId,
        customerId: order.customerId,
        lines: order.lines,
        totals: order.totals,
        createdBy,
        orderId: order.id,
      });
      order.status = 'invoiced';
      return tick(invoice);
    },
  };

  /* ------------------------------------------------------------- invoices */
  invoices: InvoiceRepository = {
    create: async (input: NewInvoice) => {
      if (input.lines.length === 0) throw new Error('Cannot bill an empty cart');
      const lines = this.priceLines(input.lines);
      this.assertAvailable(lines, input.storeId);
      const invoice = this.writeInvoice({
        storeId: input.storeId,
        counterId: input.counterId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerDetails: input.customerDetails,
        lines,
        totals: calcTotals(lines),
        createdBy: input.createdBy,
        orderId: input.orderId,
      });
      return tick(invoice);
    },

    list: (filter: InvoiceFilter = {}) => {
      const rows = this.store.invoices
        .filter(
          (i) =>
            (!filter.storeId || i.storeId === filter.storeId) &&
            (!filter.businessDate || i.businessDate === filter.businessDate) &&
            (!filter.counterId || i.counterId === filter.counterId) &&
            (!filter.status || i.status === filter.status),
        )
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return tick(filter.limit ? rows.slice(0, filter.limit) : rows);
    },

    byId: (id) => tick(this.store.invoices.find((i) => i.id === id)),

    cancel: async (id, note) => {
      const invoice = this.invoiceForAdminAction(id);
      if (invoice.status === 'cancelled') {
        throw new Error(`Invoice ${invoice.number} is already cancelled`);
      }

      // Reversing entries, never edits — the ledger only ever grows.
      this.postMovements(
        invoice.lines.map((line) => ({
          skuId: line.skuId,
          locationId: invoice.storeId,
          type: 'sale_return' as const,
          qty: line.qty,
          refType: 'invoice' as const,
          refId: invoice.id,
          createdBy: invoice.createdBy,
        })),
      );

      for (const payment of this.store.payments.filter(
        (p) => p.invoiceId === invoice.id && p.status === 'success',
      )) {
        this.store.payments.push({
          ...payment,
          id: this.store.nextId('pay'),
          amount: roundMoney(-payment.amount),
          reference: `cancel:${invoice.number}`,
          idempotencyKey: `cancel:${payment.id}`,
        });
      }

      invoice.status = 'cancelled';
      invoice.amountPaid = 0;
      invoice.amountDue = 0;
      this.store.bumpAudit({
        entity: 'invoice',
        entityId: invoice.id,
        action: 'cancel',
        summary: `Invoice ${invoice.number} cancelled${note ? ` — ${note}` : ''}`,
        actorId: invoice.createdBy,
      });
      return tick(invoice);
    },

    remove: async (id, confirmNumber) => {
      const invoice = this.invoiceForAdminAction(id);
      if (confirmNumber.trim() !== invoice.number) {
        throw new Error(`Type ${invoice.number} exactly to confirm`);
      }
      // Written before the rows go, since it becomes the only trace.
      this.store.bumpAudit({
        entity: 'invoice',
        entityId: invoice.id,
        action: 'delete',
        summary: `Invoice ${invoice.number} deleted`,
        actorId: invoice.createdBy,
      });

      // Movements reference the invoice by id rather than by a relation, so
      // nothing removes them on our behalf; left behind they would hold stock
      // down for goods the books no longer say were sold.
      this.store.movements = this.store.movements.filter(
        (m) => !(m.refType === 'invoice' && m.refId === invoice.id),
      );
      this.store.payments = this.store.payments.filter((p) => p.invoiceId !== invoice.id);
      this.store.invoices = this.store.invoices.filter((i) => i.id !== invoice.id);
      return tick(undefined);
    },
  };

  /**
   * Shared guard: a returned invoice cannot be cancelled or deleted, because
   * the return has already put some goods back and refunded some money.
   * Reversing the whole invoice on top would do both a second time.
   */
  private invoiceForAdminAction(id: string) {
    const invoice = this.store.invoices.find((i) => i.id === id);
    if (!invoice) throw new NotFoundError('Invoice', id);
    const returns = this.store.salesReturns.filter((r) => r.invoiceId === id);
    if (returns.length > 0) {
      throw new Error(
        `Invoice ${invoice.number} has a return against it (${returns
          .map((r) => r.number)
          .join(', ')}). Reverse the return first.`,
      );
    }
    return invoice;
  }

  /* ------------------------------------------------------------- payments */
  payments = {
    capture: async (input: CapturePayment) => {
      const existing = this.store.payments.find((p) => p.idempotencyKey === input.idempotencyKey);
      if (existing) return tick(existing);

      const invoice = this.store.invoices.find((i) => i.id === input.invoiceId);
      if (!invoice) throw new NotFoundError('Invoice', input.invoiceId);
      if (input.amount <= 0) throw new Error('Payment amount must be positive');

      const payment: Payment = {
        id: this.store.nextId('pay'),
        invoiceId: invoice.id,
        storeId: invoice.storeId,
        counterId: invoice.counterId,
        businessDate: invoice.businessDate,
        paymentMethodId: input.paymentMethodId,
        amount: roundMoney(input.amount),
        reference: input.reference,
        status: 'success',
        idempotencyKey: input.idempotencyKey,
        createdBy: input.createdBy,
        createdAt: this.store.now(),
      };
      this.store.payments.push(payment);

      invoice.amountPaid = roundMoney(invoice.amountPaid + payment.amount);
      invoice.amountDue = roundMoney(Math.max(invoice.totals.grandTotal - invoice.amountPaid, 0));
      invoice.status = invoice.amountDue <= 0 ? 'paid' : 'partially_paid';

      this.store.bumpAudit({
        entity: 'payment',
        entityId: payment.id,
        action: 'create',
        summary: `Captured ₹${payment.amount} against ${invoice.number}`,
        actorId: input.createdBy,
        locationId: invoice.storeId,
      });
      return tick(payment);
    },

    listByInvoice: (invoiceId: string) => tick(this.store.payments.filter((p) => p.invoiceId === invoiceId)),

    listByDay: (storeId: string, businessDate: string, counterId?: string) =>
      tick(
        this.store.payments.filter(
          (p) =>
            p.storeId === storeId &&
            p.businessDate === businessDate &&
            (!counterId || p.counterId === counterId),
        ),
      ),
  };

  /* -------------------------------------------------------------- closing */
  closing: ClosingRepository = {
    preview: (request: ClosingRequest) => tick(this.buildPreview(request)),

    submit: async (input: SubmitClosing) => {
      const preview = this.buildPreview(input);
      if (preview.existing && preview.existing.status === 'approved') {
        throw new Error(`Business day ${input.businessDate} is already locked`);
      }
      const calc = calcClosing({
        openingCash: input.openingCash,
        salesByMethod: preview.salesByMethod,
        physicalCash: input.physicalCash,
      });

      const closing: DayEndClosing = {
        id: preview.existing?.id ?? this.store.nextId('cls'),
        storeId: input.storeId,
        counterId: input.counterId,
        businessDate: input.businessDate,
        openingCash: input.openingCash,
        salesByMethod: preview.salesByMethod,
        expectedCash: calc.expectedCash,
        physicalCash: calc.physicalCash,
        variance: calc.variance,
        depositedAmount: input.depositedAmount,
        carriedForward: input.carriedForward,
        note: input.note,
        status: 'submitted',
        submittedBy: input.submittedBy,
        submittedAt: this.store.now(),
      };

      const index = this.store.closings.findIndex((c) => c.id === closing.id);
      if (index >= 0) this.store.closings[index] = closing;
      else this.store.closings.push(closing);

      if (needsDiscrepancy(calc.variance)) {
        this.store.discrepancies.push({
          id: this.store.nextId('dsc'),
          kind: 'cash',
          locationId: input.storeId,
          businessDate: input.businessDate,
          refType: 'day_end_closing',
          refId: closing.id,
          expected: calc.expectedCash,
          actual: calc.physicalCash,
          variance: calc.variance,
          note: input.note,
          status: 'open',
          raisedBy: input.submittedBy,
          raisedAt: this.store.now(),
        });
      }

      this.store.bumpAudit({
        entity: 'day_end_closing',
        entityId: closing.id,
        action: 'create',
        summary: `Day-end submitted for ${input.businessDate} (variance ₹${calc.variance})`,
        actorId: input.submittedBy,
        locationId: input.storeId,
      });
      return tick(closing);
    },

    approve: async (closingId, approvedBy) => {
      const closing = this.store.closings.find((c) => c.id === closingId);
      if (!closing) throw new NotFoundError('DayEndClosing', closingId);
      closing.status = 'approved';
      closing.approvedBy = approvedBy;
      closing.approvedAt = this.store.now();
      this.store.bumpAudit({
        entity: 'day_end_closing',
        entityId: closing.id,
        action: 'approve',
        summary: `Day ${closing.businessDate} locked`,
        actorId: approvedBy,
        locationId: closing.storeId,
      });
      return tick(closing);
    },

    list: (storeId) =>
      tick(
        this.store.closings
          .filter((c) => !storeId || c.storeId === storeId)
          .slice()
          .sort((a, b) => b.businessDate.localeCompare(a.businessDate)),
      ),
  };

  /* ------------------------------------------------------- sales returns */
  salesReturns: SalesReturnRepository = {
    create: async (input) => {
      const invoice = this.store.invoices.find((i) => i.id === input.invoiceId);
      if (!invoice) throw new NotFoundError('Invoice', input.invoiceId);
      if (input.lines.length === 0) throw new Error('A return needs at least one line');

      const prior = this.store.salesReturns.filter((r) => r.invoiceId === invoice.id);
      const returnable = returnableLines(invoice, prior);

      for (const line of input.lines) {
        const eligible = returnable.find((r) => r.skuId === line.skuId);
        if (!eligible) throw new Error('That SKU was not on this invoice');
        if (line.qty <= 0) throw new Error('Return quantities must be positive');
        if (line.qty > eligible.remainingQty) {
          throw new Error(
            `Only ${eligible.remainingQty} of ${eligible.skuCode} may still be returned`,
          );
        }
      }

      const refundTotal = calcRefund(returnable, input.lines);
      const at = this.store.now();
      const salesReturn: SalesReturn = {
        id: this.store.nextId('ret'),
        number: this.store.nextNumber('RET', this.locationCode(invoice.storeId)),
        invoiceId: invoice.id,
        storeId: invoice.storeId,
        reasonCodeId: input.reasonCodeId,
        lines: input.lines.map((line) => ({
          skuId: line.skuId,
          qty: line.qty,
          refundAmount: calcRefund(returnable, [line]),
        })),
        refundTotal,
        createdBy: input.createdBy,
        createdAt: at,
      };

      // Goods come back onto the shelf they were sold from.
      for (const line of input.lines) {
        this.store.appendMovement({
          id: this.store.nextId('mov'),
          skuId: line.skuId,
          locationId: invoice.storeId,
          type: 'sale_return',
          qty: signedQty('sale_return', line.qty),
          refType: 'sales_return',
          refId: salesReturn.id,
          reasonCodeId: input.reasonCodeId,
          note: input.note,
          createdBy: input.createdBy,
          createdAt: at,
        });
      }

      // A refund is a negative payment, so day-end cash nets on its own.
      if (input.refundMethodId && refundTotal > 0) {
        this.store.payments.push({
          id: this.store.nextId('pay'),
          invoiceId: invoice.id,
          storeId: invoice.storeId,
          counterId: invoice.counterId,
          businessDate: this.store.businessDate(at),
          paymentMethodId: input.refundMethodId,
          amount: roundMoney(-refundTotal),
          reference: salesReturn.number,
          status: 'success',
          idempotencyKey: `refund:${salesReturn.id}`,
          createdBy: input.createdBy,
          createdAt: at,
        });
        invoice.amountPaid = roundMoney(invoice.amountPaid - refundTotal);
      }

      const returnedQty = [...prior, salesReturn]
        .flatMap((r) => r.lines)
        .reduce((sum, l) => sum + l.qty, 0);
      const billedQty = invoice.lines.reduce((sum, l) => sum + l.qty, 0);
      invoice.status = returnedQty >= billedQty ? 'returned' : invoice.status;
      invoice.amountDue = roundMoney(Math.max(invoice.totals.grandTotal - invoice.amountPaid, 0));

      this.store.salesReturns.push(salesReturn);
      this.store.bumpAudit({
        entity: 'sales_return',
        entityId: salesReturn.id,
        action: 'create',
        summary: `Return ${salesReturn.number} against ${invoice.number} for ₹${refundTotal}`,
        actorId: input.createdBy,
        locationId: invoice.storeId,
      });
      return tick(salesReturn);
    },

    list: (filter = {}) =>
      tick(
        this.store.salesReturns
          .filter(
            (r) =>
              (!filter.storeId || r.storeId === filter.storeId) &&
              (!filter.invoiceId || r.invoiceId === filter.invoiceId),
          )
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
  };

  /* ----------------------------------------------------------- purchases */
  purchases: PurchaseRepository = {
    listOrders: () => tick(this.store.purchaseOrders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    listReceipts: () => tick(this.store.goodsReceipts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    listReturns: () => tick(this.store.purchaseReturns.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))),

    createOrder: async (input) => {
      if (input.lines.length === 0) throw new Error('A purchase order needs at least one line');
      if (!this.store.suppliers.some((s) => s.id === input.supplierId)) {
        throw new NotFoundError('Supplier', input.supplierId);
      }
      const destination = this.store.locationById(input.locationId);
      if (!destination) throw new NotFoundError('StockLocation', input.locationId);

      const order: PurchaseOrder = {
        id: this.store.nextId('po'),
        number: this.store.nextNumber('PO', destination.code),
        supplierId: input.supplierId,
        locationId: input.locationId,
        status: 'sent',
        lines: input.lines.map((line) => ({
          skuId: line.skuId,
          qty: line.qty,
          receivedQty: 0,
          unitCost: line.unitCost,
        })),
        expectedAt: input.expectedAt,
        createdBy: input.createdBy,
        createdAt: this.store.now(),
      };
      this.store.purchaseOrders.push(order);
      this.store.bumpAudit({
        entity: 'purchase_order',
        entityId: order.id,
        action: 'create',
        summary: `PO ${order.number} raised for ${order.lines.length} line(s)`,
        actorId: input.createdBy,
        locationId: input.locationId,
      });
      return tick(order);
    },

    receive: async (input) => {
      const order = this.store.purchaseOrders.find((p) => p.id === input.purchaseOrderId);
      if (!order) throw new NotFoundError('PurchaseOrder', input.purchaseOrderId);
      if (order.status === 'cancelled') throw new Error(`PO ${order.number} is cancelled`);

      for (const line of input.lines) {
        const ordered = order.lines.find((l) => l.skuId === line.skuId);
        if (!ordered) throw new Error('That SKU is not on this purchase order');
        const outstanding = ordered.qty - ordered.receivedQty;
        if (line.qty > outstanding) {
          throw new Error(`Only ${outstanding} of that SKU remain outstanding on ${order.number}`);
        }
      }

      const at = this.store.now();
      const receipt: GoodsReceipt = {
        id: this.store.nextId('grn'),
        number: this.store.nextNumber('GRN', this.locationCode(order.locationId)),
        purchaseOrderId: order.id,
        supplierId: order.supplierId,
        locationId: order.locationId,
        supplierInvoiceNo: input.supplierInvoiceNo,
        lines: input.lines.map((line) => ({
          skuId: line.skuId,
          qty: line.qty,
          unitCost: line.unitCost,
          damagedQty: line.damagedQty ?? 0,
        })),
        createdBy: input.createdBy,
        createdAt: at,
      };

      for (const line of receipt.lines) {
        // unitCost here is what feeds the weighted-average cost of the SKU.
        this.store.appendMovement({
          id: this.store.nextId('mov'),
          skuId: line.skuId,
          locationId: order.locationId,
          type: 'receipt',
          qty: signedQty('receipt', line.qty),
          refType: 'goods_receipt',
          refId: receipt.id,
          unitCost: line.unitCost,
          createdBy: input.createdBy,
          createdAt: at,
        });

        // Damaged goods arrive and are written off, so both are on the record.
        if (line.damagedQty > 0) {
          this.store.appendMovement({
            id: this.store.nextId('mov'),
            skuId: line.skuId,
            locationId: order.locationId,
            type: 'damage',
            qty: signedQty('damage', line.damagedQty),
            refType: 'goods_receipt',
            refId: receipt.id,
            note: `Damaged on arrival against ${receipt.number}`,
            createdBy: input.createdBy,
            createdAt: at,
          });
        }

        const ordered = order.lines.find((l) => l.skuId === line.skuId)!;
        ordered.receivedQty = roundQty(ordered.receivedQty + line.qty);
      }

      const fullyReceived = order.lines.every((l) => l.receivedQty >= l.qty);
      const anyReceived = order.lines.some((l) => l.receivedQty > 0);
      order.status = fullyReceived ? 'received' : anyReceived ? 'partially_received' : order.status;

      this.store.goodsReceipts.push(receipt);
      this.store.bumpAudit({
        entity: 'goods_receipt',
        entityId: receipt.id,
        action: 'create',
        summary: `GRN ${receipt.number} received against ${order.number}`,
        actorId: input.createdBy,
        locationId: order.locationId,
      });
      return tick(receipt);
    },

    createReturn: async (input) => {
      const receipt = this.store.goodsReceipts.find((g) => g.id === input.goodsReceiptId);
      if (!receipt) throw new NotFoundError('GoodsReceipt', input.goodsReceiptId);

      const alreadyReturned = new Map<string, number>();
      for (const ret of this.store.purchaseReturns.filter((r) => r.goodsReceiptId === receipt.id)) {
        for (const line of ret.lines) {
          alreadyReturned.set(line.skuId, (alreadyReturned.get(line.skuId) ?? 0) + line.qty);
        }
      }

      for (const line of input.lines) {
        const received = receipt.lines.find((l) => l.skuId === line.skuId);
        if (!received) throw new Error('That SKU was not on this receipt');
        const remaining = received.qty - (alreadyReturned.get(line.skuId) ?? 0);
        if (line.qty <= 0) throw new Error('Return quantities must be positive');
        if (line.qty > remaining) throw new Error(`Only ${remaining} of that SKU may still be returned`);

        const level = this.levelFor(line.skuId, receipt.locationId);
        if (level.available < line.qty) {
          throw new InsufficientStockError(line.skuId, line.qty, level.available);
        }
      }

      const at = this.store.now();
      const purchaseReturn: PurchaseReturn = {
        id: this.store.nextId('pret'),
        number: this.store.nextNumber('PRET', this.locationCode(receipt.locationId)),
        goodsReceiptId: receipt.id,
        supplierId: receipt.supplierId,
        locationId: receipt.locationId,
        reasonCodeId: input.reasonCodeId,
        lines: input.lines.map((line) => ({
          skuId: line.skuId,
          qty: line.qty,
          unitCost: receipt.lines.find((l) => l.skuId === line.skuId)?.unitCost ?? 0,
        })),
        createdBy: input.createdBy,
        createdAt: at,
      };

      // No dedicated movement type exists for goods going back to a supplier,
      // so this is a signed adjustment tagged `purchase_return` on refType.
      for (const line of purchaseReturn.lines) {
        this.store.appendMovement({
          id: this.store.nextId('mov'),
          skuId: line.skuId,
          locationId: receipt.locationId,
          type: 'adjustment',
          qty: signedQty('adjustment', -line.qty),
          refType: 'purchase_return',
          refId: purchaseReturn.id,
          reasonCodeId: input.reasonCodeId,
          unitCost: line.unitCost,
          note: `Returned to supplier on ${purchaseReturn.number}`,
          createdBy: input.createdBy,
          createdAt: at,
        });
      }

      this.store.purchaseReturns.push(purchaseReturn);
      this.store.bumpAudit({
        entity: 'purchase_return',
        entityId: purchaseReturn.id,
        action: 'create',
        summary: `Purchase return ${purchaseReturn.number} against ${receipt.number}`,
        actorId: input.createdBy,
        locationId: receipt.locationId,
      });
      return tick(purchaseReturn);
    },

    cancelOrder: async (purchaseOrderId, actorId) => {
      const order = this.store.purchaseOrders.find((p) => p.id === purchaseOrderId);
      if (!order) throw new NotFoundError('PurchaseOrder', purchaseOrderId);
      if (order.lines.some((l) => l.receivedQty > 0)) {
        throw new Error('Cannot cancel a PO that has already been partly received');
      }
      order.status = 'cancelled';
      this.store.bumpAudit({
        entity: 'purchase_order',
        entityId: order.id,
        action: 'cancel',
        summary: `PO ${order.number} cancelled`,
        actorId,
        locationId: order.locationId,
      });
      return tick(order);
    },
  };

  discrepancies: DiscrepancyRepository = {
    list: (locationId) => tick(this.store.discrepancies.filter((d) => !locationId || d.locationId === locationId)),

    resolve: async (input) => {
      const discrepancy = this.store.discrepancies.find((d) => d.id === input.discrepancyId);
      if (!discrepancy) throw new NotFoundError('Discrepancy', input.discrepancyId);

      discrepancy.status = input.status;
      discrepancy.reasonCodeId = input.reasonCodeId ?? discrepancy.reasonCodeId;
      discrepancy.note = input.note ?? discrepancy.note;
      if (input.status === 'resolved' || input.status === 'written_off') {
        discrepancy.resolvedBy = input.resolvedBy;
        discrepancy.resolvedAt = this.store.now();
      }

      this.store.bumpAudit({
        entity: 'discrepancy',
        entityId: discrepancy.id,
        action: 'update',
        summary: `Discrepancy marked ${input.status}`,
        actorId: input.resolvedBy,
        locationId: discrepancy.locationId,
      });
      return tick(discrepancy);
    },
  };

  audit: AuditRepository = {
    list: (limit = 50) =>
      tick(
        this.store.auditLogs
          .slice()
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, limit),
      ),
  };

  /* -------------------------------------------------------------- helpers */

  private levelFor(skuId: string, locationId: string): InventoryLevel {
    return deriveInventoryLevel({
      skuId,
      locationId,
      movements: this.store.movements,
      reservations: this.store.reservations,
    });
  }

  /**
   * Merges a patch into a stored record, re-validates it through its schema and
   * writes an audit row. Undefined keys in the patch are ignored, so a partial
   * edit never blanks a field it did not mention.
   */
  private patchRecord<T extends { id: string }>(args: {
    rows: T[];
    id: string;
    patch: Partial<T>;
    schema: { parse: (value: unknown) => T };
    entity: string;
    label: (row: T) => string;
    actorId: string;
  }): T {
    const index = args.rows.findIndex((r) => r.id === args.id);
    if (index < 0) throw new NotFoundError(args.entity, args.id);

    const defined = Object.fromEntries(
      Object.entries(args.patch).filter(([, value]) => value !== undefined),
    );
    const next = args.schema.parse({ ...args.rows[index], ...defined });
    args.rows[index] = next;

    this.store.bumpAudit({
      entity: args.entity,
      entityId: next.id,
      action: 'update',
      summary: args.label(next),
      actorId: args.actorId,
    });
    return next;
  }

  /** Shared audit shorthand for the flat master creates. */
  private logCreate(entity: string, entityId: string, summary: string, actorId: string): void {
    this.store.bumpAudit({ entity, entityId, action: 'create', summary, actorId });
  }

  private assertUniqueCode(rows: { code: string }[], code: string, label: string): void {
    if (rows.some((r) => r.code.toUpperCase() === code.toUpperCase())) {
      throw new Error(`${label} code ${code} already exists`);
    }
  }

  private locationCode(locationId: string): string {
    return this.store.locationById(locationId)?.code ?? 'LOC';
  }

  private priceLines(inputs: SaleLineInput[]): SaleLine[] {
    return inputs.map((input, index) => {
      const sku = this.store.skus.find((s) => s.id === input.skuId);
      if (!sku) throw new NotFoundError('Sku', input.skuId);
      const tax = this.store.taxes.find((t) => t.id === sku.taxId);
      if (!tax) throw new NotFoundError('Tax', sku.taxId);
      return priceLine({
        id: `line_${index + 1}`,
        sku,
        tax,
        qty: input.qty,
        discount: input.discount,
        unitPriceOverride: input.unitPriceOverride,
        overrideBasis: input.overrideBasis,
      });
    });
  }

  private assertAvailable(lines: SaleLine[], locationId: string): void {
    const wanted = new Map<string, number>();
    for (const line of lines) wanted.set(line.skuId, (wanted.get(line.skuId) ?? 0) + line.qty);
    for (const [skuId, qty] of wanted) {
      const level = this.levelFor(skuId, locationId);
      if (level.available < qty) throw new InsufficientStockError(skuId, qty, level.available);
    }
  }

  private postMovements(inputs: NewMovement[]): StockMovement[] {
    const at = this.store.now();
    return inputs.map((input) =>
      this.store.appendMovement({
        id: this.store.nextId('mov'),
        skuId: input.skuId,
        locationId: input.locationId,
        type: input.type,
        qty: signedQty(input.type, input.qty),
        refType: input.refType,
        refId: input.refId,
        reasonCodeId: input.reasonCodeId,
        unitCost: input.unitCost,
        note: input.note,
        createdBy: input.createdBy,
        createdAt: at,
      }),
    );
  }

  private writeInvoice(args: {
    storeId: string;
    counterId: string;
    customerId?: string;
    customerName?: string;
    customerDetails?: Record<string, string>;
    lines: SaleLine[];
    totals: Invoice['totals'];
    createdBy: string;
    orderId?: string;
  }): Invoice {
    const at = this.store.now();
    const invoice: Invoice = {
      id: this.store.nextId('inv'),
      number: this.store.nextNumber('INV', this.locationCode(args.storeId)),
      orderId: args.orderId,
      customerDetails: args.customerDetails,
      storeId: args.storeId,
      counterId: args.counterId,
      customerId: args.customerId,
      customerName: args.customerName ?? this.store.customers.find((c) => c.id === args.customerId)?.name,
      businessDate: this.store.businessDate(at),
      status: 'unpaid',
      lines: args.lines,
      totals: args.totals,
      amountPaid: 0,
      amountDue: args.totals.grandTotal,
      createdBy: args.createdBy,
      createdAt: at,
    };
    this.store.invoices.push(invoice);

    // The stock side of the sale: one ledger row per line, never a stored count.
    for (const line of args.lines) {
      this.store.appendMovement({
        id: this.store.nextId('mov'),
        skuId: line.skuId,
        locationId: args.storeId,
        type: 'sale',
        qty: signedQty('sale', line.qty),
        refType: 'invoice',
        refId: invoice.id,
        createdBy: args.createdBy,
        createdAt: at,
      });
    }

    this.store.bumpAudit({
      entity: 'invoice',
      entityId: invoice.id,
      action: 'create',
      summary: `Invoice ${invoice.number} billed for ₹${invoice.totals.grandTotal}`,
      actorId: args.createdBy,
      locationId: args.storeId,
    });

    return invoice;
  }

  private buildPreview(request: ClosingRequest): ClosingPreview {
    const payments = this.store.payments.filter(
      (p) =>
        p.storeId === request.storeId &&
        p.businessDate === request.businessDate &&
        p.counterId === request.counterId,
    );
    const salesByMethod = summarizeSalesByMethod(payments, this.store.paymentMethods);
    const existing = this.store.closings.find(
      (c) =>
        c.storeId === request.storeId &&
        c.counterId === request.counterId &&
        c.businessDate === request.businessDate,
    );

    const previousCarry = this.store.closings
      .filter(
        (c) =>
          c.storeId === request.storeId &&
          c.counterId === request.counterId &&
          c.businessDate < request.businessDate,
      )
      .sort((a, b) => b.businessDate.localeCompare(a.businessDate))[0]?.carriedForward;

    const openingCash = existing?.openingCash ?? previousCarry ?? DEFAULT_OPENING_CASH;
    const calc = calcClosing({ openingCash, salesByMethod, physicalCash: 0 });
    const invoiceCount = new Set(payments.map((p) => p.invoiceId)).size;

    return {
      storeId: request.storeId,
      counterId: request.counterId,
      businessDate: request.businessDate,
      openingCash,
      salesByMethod,
      expectedCash: calc.expectedCash,
      invoiceCount,
      totalSales: calc.totalSales,
      existing,
    };
  }
}

export const createMockRepositories = (store?: InMemoryStore): Repositories => new MockRepositories(store);
