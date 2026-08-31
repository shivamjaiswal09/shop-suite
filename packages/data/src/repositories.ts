import type {
  AuditLog,
  Category,
  StockLocation,
  StoreWarehouseLink,
  LocationKind,
  Company,
  Customer,
  DayEndClosing,
  Discrepancy,
  GoodsReceipt,
  InventoryLevel,
  Invoice,
  Order,
  Payment,
  PaymentMethod,
  PaymentMethodKind,
  PriceBasis,
  Product,
  PurchaseOrder,
  PurchaseReturn,
  SalesReturn,
  ReasonCode,
  Role,
  SalesByMethod,
  Sku,
  StockMovement,
  StockMovementType,
  StockTransfer,
  Supplier,
  TransferStatus,
  Tax,
  UnitOfMeasure,
  User,
} from '@shop/core';

/* ------------------------------------------------------------------ inputs */

export interface SaleLineInput {
  skuId: string;
  qty: number;
  discount?: number;
  /** Manual price typed at the counter. */
  unitPriceOverride?: number;
  /** Whether that price was quoted before or after tax. */
  overrideBasis?: PriceBasis;
}

export interface NewOrder {
  /** The store sells from its own stock, so this is also the stock location. */
  storeId: string;
  customerId?: string;
  lines: SaleLineInput[];
  createdBy: string;
}

export interface NewInvoice {
  /** The store sells from its own stock, so this is also the stock location. */
  storeId: string;
  counterId: string;
  customerId?: string;
  customerName?: string;
  lines: SaleLineInput[];
  createdBy: string;
  /** Set when the invoice is produced from a confirmed order. */
  orderId?: string;
}

export interface NewMovement {
  skuId: string;
  locationId: string;
  type: StockMovementType;
  /** Positive magnitude, except adjustments where the sign is meaningful. */
  qty: number;
  refType: StockMovement['refType'];
  refId: string;
  reasonCodeId?: string;
  unitCost?: number;
  note?: string;
  createdBy: string;
}

export interface CapturePayment {
  invoiceId: string;
  paymentMethodId: string;
  amount: number;
  reference?: string;
  /** Required. A repeat capture with the same key returns the original row. */
  idempotencyKey: string;
  createdBy: string;
}

export interface NewProduct {
  name: string;
  categoryId: string;
  brand?: string;
  description?: string;
  createdBy: string;
}

export interface NewSku {
  productId: string;
  code: string;
  name: string;
  barcode: string;
  uomId: string;
  taxId: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp?: number;
  minStock?: number;
  reorderLevel?: number;
  /** Seeds the ledger with an `opening` movement instead of a stored count. */
  openingStock?: { locationId: string; qty: number };
  createdBy: string;
}

export interface NewTransfer {
  fromLocationId: string;
  toLocationId: string;
  lines: { skuId: string; qty: number }[];
  note?: string;
  /**
   * Collapses dispatch and receipt into one action — the dispatcher asserts
   * the goods arrived. Off by default, and allowed on any route.
   */
  autoReceive?: boolean;
  createdBy: string;
}

export interface ReceiveTransfer {
  transferId: string;
  /** Per-line counts at the destination. Omitted lines receive in full. */
  lines?: { skuId: string; receivedQty: number }[];
  note?: string;
  receivedBy: string;
}

export interface TransferFilter {
  locationId?: string;
  status?: TransferStatus;
}

export interface NewLocation {
  kind: LocationKind;
  code: string;
  name: string;
  addressLine?: string;
  city?: string;
  state?: string;
  phone?: string;
  gstin?: string;
  createdBy: string;
}

export interface NewStoreWarehouseLink {
  storeId: string;
  warehouseId: string;
  isPrimary?: boolean;
  createdBy: string;
}

export interface NewUser {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  /** Empty = access to every store. */
  storeIds: string[];
  createdBy: string;
}

export interface NewCategory {
  code: string;
  name: string;
  sortOrder?: number;
  defaultTaxId?: string;
  description?: string;
  createdBy: string;
}

export interface CategoryPatch {
  code?: string;
  name?: string;
  sortOrder?: number;
  defaultTaxId?: string;
  description?: string;
  active?: boolean;
}

export interface NewUnitOfMeasure {
  code: string;
  name: string;
  precision?: number;
  createdBy: string;
}

export interface NewTax {
  name: string;
  rate: number;
  inclusive: boolean;
  hsnCode?: string;
  createdBy: string;
}

export interface NewCustomer {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  creditLimit?: number;
  createdBy: string;
}

export interface NewSupplier {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  paymentTermsDays?: number;
  createdBy: string;
}

export interface NewPaymentMethod {
  code: string;
  name: string;
  kind: PaymentMethodKind;
  countedInDrawer: boolean;
  createdBy: string;
}

export interface NewReasonCode {
  usage: ReasonCode['usage'];
  code: string;
  name: string;
  createdBy: string;
}

/* ------------------------------------------------------------------ patches */
/**
 * Onboarding edits are patches: only supplied keys change. Nothing is ever
 * deleted — set `active: false` instead, so history keeps resolving.
 */
export interface LocationPatch {
  code?: string;
  name?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  phone?: string;
  gstin?: string;
  active?: boolean;
}

export interface UserPatch {
  name?: string;
  phone?: string;
  roleId?: string;
  storeIds?: string[];
  active?: boolean;
}

export interface UnitOfMeasurePatch {
  code?: string;
  name?: string;
  precision?: number;
  active?: boolean;
}

export interface TaxPatch {
  name?: string;
  rate?: number;
  inclusive?: boolean;
  hsnCode?: string;
  active?: boolean;
}

export interface CustomerPatch {
  name?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  creditLimit?: number;
  active?: boolean;
}

export interface SupplierPatch {
  name?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  paymentTermsDays?: number;
  active?: boolean;
}

export interface PaymentMethodPatch {
  code?: string;
  name?: string;
  kind?: PaymentMethodKind;
  countedInDrawer?: boolean;
  active?: boolean;
}

export interface ReasonCodePatch {
  usage?: ReasonCode['usage'];
  code?: string;
  name?: string;
  active?: boolean;
}

export interface ProductPatch {
  name?: string;
  categoryId?: string;
  brand?: string;
  description?: string;
  active?: boolean;
}

export interface SkuPatch {
  code?: string;
  name?: string;
  barcode?: string;
  uomId?: string;
  taxId?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  mrp?: number;
  minStock?: number;
  reorderLevel?: number;
  active?: boolean;
}

export interface NewSalesReturn {
  invoiceId: string;
  reasonCodeId: string;
  lines: { skuId: string; qty: number }[];
  note?: string;
  /** Tender to refund on. Omit to record the return without paying out. */
  refundMethodId?: string;
  createdBy: string;
}

export interface NewPurchaseOrder {
  supplierId: string;
  /** Where the goods will land — usually a warehouse. */
  locationId: string;
  lines: { skuId: string; qty: number; unitCost: number }[];
  expectedAt?: string;
  createdBy: string;
}

export interface NewGoodsReceipt {
  purchaseOrderId: string;
  supplierInvoiceNo?: string;
  /** Omitted lines are treated as nothing received. */
  lines: { skuId: string; qty: number; unitCost: number; damagedQty?: number }[];
  createdBy: string;
}

export interface NewPurchaseReturn {
  goodsReceiptId: string;
  reasonCodeId: string;
  lines: { skuId: string; qty: number }[];
  createdBy: string;
}

export interface ResolveDiscrepancy {
  discrepancyId: string;
  status: Discrepancy['status'];
  reasonCodeId?: string;
  note?: string;
  resolvedBy: string;
}

export interface OrderFilter {
  storeId?: string;
  status?: Order['status'];
}

export interface InvoiceFilter {
  storeId?: string;
  businessDate?: string;
  counterId?: string;
  status?: Invoice['status'];
  limit?: number;
}

export interface MovementFilter {
  skuId?: string;
  locationId?: string;
  type?: StockMovementType;
  limit?: number;
}

export interface ClosingRequest {
  storeId: string;
  counterId: string;
  businessDate: string;
}

export interface SubmitClosing extends ClosingRequest {
  openingCash: number;
  physicalCash: number;
  depositedAmount: number;
  carriedForward: number;
  note?: string;
  submittedBy: string;
}

export interface ClosingPreview {
  storeId: string;
  counterId: string;
  businessDate: string;
  openingCash: number;
  salesByMethod: SalesByMethod[];
  expectedCash: number;
  invoiceCount: number;
  totalSales: number;
  existing?: DayEndClosing;
}

/* ------------------------------------------------------------ repositories */

export interface OrgRepository {
  company(): Promise<Company>;
  /** Every stock location, optionally narrowed to one kind. */
  locations(kind?: LocationKind, includeInactive?: boolean): Promise<StockLocation[]>;
  stores(): Promise<StockLocation[]>;
  warehouses(): Promise<StockLocation[]>;
  /** Warehouses allowed to replenish this store. */
  linkedWarehouses(storeId: string): Promise<StockLocation[]>;
  /** Stores this warehouse supplies. */
  linkedStores(warehouseId: string): Promise<StockLocation[]>;
  links(): Promise<StoreWarehouseLink[]>;
  createLocation(input: NewLocation): Promise<StockLocation>;
  /** Maps a warehouse to a store. Setting primary clears any other primary. */
  linkWarehouse(input: NewStoreWarehouseLink): Promise<StoreWarehouseLink>;
  unlinkWarehouse(linkId: string, actorId: string): Promise<void>;
  updateLocation(id: string, patch: LocationPatch, actorId: string): Promise<StockLocation>;
  /** Makes this link the store's primary source, clearing any other. */
  setPrimaryWarehouse(linkId: string, actorId: string): Promise<StoreWarehouseLink>;
}

/**
 * Sign-in as a real capability, separate from user administration.
 *
 * `UserRepository.authenticate(email)` exists only because the prototype logged
 * in on an email with no password. Against a server that is not authentication,
 * so credentials live here instead.
 */
export interface AuthRepository {
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  /** The current session, or null. Used to restore a login across reloads. */
  me(): Promise<AuthSession | null>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

export interface AuthSession {
  user: User;
  company: Company | null;
  permissions: string[];
  locationIds: string[];
}

/**
 * Platform administration — creating and listing companies. Only a super admin
 * may call any of it, which is why it is a separate surface from everything
 * else: nothing a tenant does should be reachable through the same object.
 */
export interface PlatformRepository {
  companies(): Promise<PlatformCompany[]>;
  createCompany(input: NewCompany): Promise<{ company: Company; admin: User }>;
  updateCompany(id: string, patch: CompanyPatch): Promise<Company>;
  /** Irreversible. `confirmName` must equal the company's name exactly. */
  deleteCompany(id: string, confirmName: string): Promise<DeletedCompanyCounts>;
  /** Users in any company — a super admin is not scoped to one. */
  usersIn(companyId: string): Promise<User[]>;
  rolesIn(companyId: string): Promise<Role[]>;
  createUserIn(companyId: string, input: Omit<NewUser, 'createdBy'> & { password: string }): Promise<User>;
  setPassword(userId: string, password: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export interface DeletedCompanyCounts {
  users: number;
  movements: number;
  invoices: number;
}

export interface PlatformCompany extends Company {
  _count?: { users: number; locations: number };
}

export interface NewCompany {
  name: string;
  legalName: string;
  gstin?: string;
  admin: { name: string; email: string; phone?: string; password: string };
}

export interface CompanyPatch {
  name?: string;
  legalName?: string;
  gstin?: string;
  active?: boolean;
}

export interface UserRepository {
  list(): Promise<User[]>;
  byId(id: string): Promise<User | undefined>;
  roles(): Promise<Role[]>;
  /** Mock login: matches on email only, no password in Phase 1. */
  authenticate(email: string): Promise<User | undefined>;
  create(input: NewUser): Promise<User>;
  update(id: string, patch: UserPatch, actorId: string): Promise<User>;
}

export interface MasterRepository {
  /** Ordered for merchandising: sortOrder first, then name. */
  categories(includeInactive?: boolean): Promise<Category[]>;
  unitsOfMeasure(includeInactive?: boolean): Promise<UnitOfMeasure[]>;
  taxes(includeInactive?: boolean): Promise<Tax[]>;
  customers(includeInactive?: boolean): Promise<Customer[]>;
  suppliers(includeInactive?: boolean): Promise<Supplier[]>;
  paymentMethods(includeInactive?: boolean): Promise<PaymentMethod[]>;
  reasonCodes(usage?: ReasonCode['usage'], includeInactive?: boolean): Promise<ReasonCode[]>;
  createCategory(input: NewCategory): Promise<Category>;
  createUnitOfMeasure(input: NewUnitOfMeasure): Promise<UnitOfMeasure>;
  createTax(input: NewTax): Promise<Tax>;
  createCustomer(input: NewCustomer): Promise<Customer>;
  createSupplier(input: NewSupplier): Promise<Supplier>;
  createPaymentMethod(input: NewPaymentMethod): Promise<PaymentMethod>;
  createReasonCode(input: NewReasonCode): Promise<ReasonCode>;
  updateCategory(id: string, patch: CategoryPatch, actorId: string): Promise<Category>;
  updateUnitOfMeasure(id: string, patch: UnitOfMeasurePatch, actorId: string): Promise<UnitOfMeasure>;
  updateTax(id: string, patch: TaxPatch, actorId: string): Promise<Tax>;
  updateCustomer(id: string, patch: CustomerPatch, actorId: string): Promise<Customer>;
  updateSupplier(id: string, patch: SupplierPatch, actorId: string): Promise<Supplier>;
  updatePaymentMethod(id: string, patch: PaymentMethodPatch, actorId: string): Promise<PaymentMethod>;
  updateReasonCode(id: string, patch: ReasonCodePatch, actorId: string): Promise<ReasonCode>;
}

export interface ProductRepository {
  listProducts(includeInactive?: boolean): Promise<Product[]>;
  listSkus(includeInactive?: boolean): Promise<Sku[]>;
  skuById(id: string): Promise<Sku | undefined>;
  skuByBarcode(barcode: string): Promise<Sku | undefined>;
  /** Matches barcode exactly, then code/name by substring. */
  searchSkus(term: string, limit?: number): Promise<Sku[]>;
  createProduct(input: NewProduct): Promise<Product>;
  /** Optionally seeds opening stock, which writes an `opening` movement. */
  createSku(input: NewSku): Promise<Sku>;
  updateProduct(id: string, patch: ProductPatch, actorId: string): Promise<Product>;
  updateSku(id: string, patch: SkuPatch, actorId: string): Promise<Sku>;
}

export interface StockRepository {
  levelFor(skuId: string, locationId: string): Promise<InventoryLevel>;
  levels(locationId: string): Promise<InventoryLevel[]>;
  movements(filter?: MovementFilter): Promise<StockMovement[]>;
  post(movements: NewMovement[]): Promise<StockMovement[]>;
}

export interface TransferRepository {
  /** Dispatches: validates availability and writes `transfer_out` at source. */
  create(input: NewTransfer): Promise<StockTransfer>;
  list(filter?: TransferFilter): Promise<StockTransfer[]>;
  byId(id: string): Promise<StockTransfer | undefined>;
  /** Writes `transfer_in` at the destination; a short count raises a discrepancy. */
  receive(input: ReceiveTransfer): Promise<StockTransfer>;
  /** Returns in-transit stock to the source warehouse. */
  cancel(transferId: string, cancelledBy: string): Promise<StockTransfer>;
}

export interface OrderRepository {
  create(input: NewOrder): Promise<Order>;
  list(filter?: OrderFilter): Promise<Order[]>;
  byId(id: string): Promise<Order | undefined>;
  /** Consumes the order's reservations and writes the sale movements. */
  convertToInvoice(orderId: string, counterId: string, createdBy: string): Promise<Invoice>;
}

export interface InvoiceRepository {
  /** Prices the lines, writes the invoice, appends `sale` movements. */
  create(input: NewInvoice): Promise<Invoice>;
  list(filter?: InvoiceFilter): Promise<Invoice[]>;
  byId(id: string): Promise<Invoice | undefined>;
}

export interface PaymentRepository {
  capture(input: CapturePayment): Promise<Payment>;
  listByInvoice(invoiceId: string): Promise<Payment[]>;
  listByDay(storeId: string, businessDate: string, counterId?: string): Promise<Payment[]>;
}

export interface ClosingRepository {
  preview(request: ClosingRequest): Promise<ClosingPreview>;
  submit(input: SubmitClosing): Promise<DayEndClosing>;
  approve(closingId: string, approvedBy: string): Promise<DayEndClosing>;
  list(storeId?: string): Promise<DayEndClosing[]>;
}

export interface PurchaseRepository {
  listOrders(): Promise<PurchaseOrder[]>;
  listReceipts(): Promise<GoodsReceipt[]>;
  listReturns(): Promise<PurchaseReturn[]>;
  createOrder(input: NewPurchaseOrder): Promise<PurchaseOrder>;
  /** Receives against a PO: writes `receipt` movements and any `damage`. */
  receive(input: NewGoodsReceipt): Promise<GoodsReceipt>;
  /** Sends stock back to the supplier, reversing part of a receipt. */
  createReturn(input: NewPurchaseReturn): Promise<PurchaseReturn>;
  cancelOrder(purchaseOrderId: string, actorId: string): Promise<PurchaseOrder>;
}

export interface SalesReturnRepository {
  /** Writes `sale_return` movements and, if a tender is given, a refund. */
  create(input: NewSalesReturn): Promise<SalesReturn>;
  list(filter?: { storeId?: string; invoiceId?: string }): Promise<SalesReturn[]>;
}

export interface DiscrepancyRepository {
  /** Filter by the location the discrepancy arose at. */
  list(locationId?: string): Promise<Discrepancy[]>;
  resolve(input: ResolveDiscrepancy): Promise<Discrepancy>;
}

export interface AuditRepository {
  list(limit?: number): Promise<AuditLog[]>;
}

/** The single injection point. Screens only ever see this shape. */
export interface Repositories {
  auth: AuthRepository;
  platform: PlatformRepository;
  org: OrgRepository;
  users: UserRepository;
  masters: MasterRepository;
  products: ProductRepository;
  stock: StockRepository;
  transfers: TransferRepository;
  salesReturns: SalesReturnRepository;
  orders: OrderRepository;
  invoices: InvoiceRepository;
  payments: PaymentRepository;
  closing: ClosingRepository;
  purchases: PurchaseRepository;
  discrepancies: DiscrepancyRepository;
  audit: AuditRepository;
}
