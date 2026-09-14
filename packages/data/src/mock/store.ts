import type {
  BillFieldConfig,
  AuditLog,
  Category,
  Company,
  Customer,
  DayEndClosing,
  Discrepancy,
  GoodsReceipt,
  Invoice,
  Order,
  Payment,
  PaymentMethod,
  Product,
  PurchaseOrder,
  PurchaseReturn,
  SalesReturn,
  ReasonCode,
  Role,
  Sku,
  StockMovement,
  StockReservation,
  StockTransfer,
  Supplier,
  Tax,
  UnitOfMeasure,
  User,
  StockLocation,
  StoreWarehouseLink,
} from '@shop/core';

/**
 * The mock persistence layer. Holds the append-only movement ledger plus every
 * other collection. A real backend replaces this wholesale — nothing outside
 * `mock/` may import it.
 */
export class InMemoryStore {
  company!: Company;
  /** Stores and warehouses share one array — and therefore one id space. */
  locations: StockLocation[] = [];
  storeWarehouseLinks: StoreWarehouseLink[] = [];
  roles: Role[] = [];
  users: User[] = [];

  unitsOfMeasure: UnitOfMeasure[] = [];
  taxes: Tax[] = [];
  customers: Customer[] = [];
  suppliers: Supplier[] = [];
  paymentMethods: PaymentMethod[] = [];
  reasonCodes: ReasonCode[] = [];

  categories: Category[] = [];
  products: Product[] = [];
  skus: Sku[] = [];

  /** Append-only. Never mutate a row in place. */
  movements: StockMovement[] = [];
  reservations: StockReservation[] = [];

  transfers: StockTransfer[] = [];
  orders: Order[] = [];
  invoices: Invoice[] = [];
  payments: Payment[] = [];
  closings: DayEndClosing[] = [];
  discrepancies: Discrepancy[] = [];

  purchaseOrders: PurchaseOrder[] = [];
  purchaseReturns: PurchaseReturn[] = [];
  salesReturns: SalesReturn[] = [];
  goodsReceipts: GoodsReceipt[] = [];

  billFields: BillFieldConfig[] = [];

  auditLogs: AuditLog[] = [];

  stores(): StockLocation[] {
    return this.locations.filter((l) => l.kind === 'store');
  }

  warehouses(): StockLocation[] {
    return this.locations.filter((l) => l.kind === 'warehouse');
  }

  locationById(id: string): StockLocation | undefined {
    return this.locations.find((l) => l.id === id);
  }

  private counters = new Map<string, number>();

  nextId(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${String(next).padStart(4, '0')}`;
  }

  /** Document numbers, e.g. INV-BR1-000003. */
  nextNumber(series: string, scope: string): string {
    const key = `num:${series}:${scope}`;
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return `${series}-${scope}-${String(next).padStart(6, '0')}`;
  }

  now(): string {
    return new Date().toISOString();
  }

  businessDate(at: string = this.now()): string {
    return at.slice(0, 10);
  }

  appendMovement(movement: StockMovement): StockMovement {
    this.movements.push(movement);
    return movement;
  }

  bumpAudit(entry: Omit<AuditLog, 'id' | 'at'>): AuditLog {
    const log: AuditLog = { ...entry, id: this.nextId('aud'), at: this.now() };
    this.auditLogs.push(log);
    return log;
  }
}
