import type {
  AuditLog,
  DayEndClosing,
  Discrepancy,
  GoodsReceipt,
  Invoice,
  InvoiceStatus,
  Order,
  OrderStatus,
  Payment,
  PaymentStatus,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseReturn,
  SaleLine,
  SalesByMethod,
  SalesReturn,
  SaleTotals,
} from '@shop/core';
import type {
  AuditRepository,
  ClosingPreview,
  ClosingRepository,
  DiscrepancyRepository,
  InvoiceRepository,
  OrderRepository,
  PaymentRepository,
  PurchaseRepository,
  SalesReturnRepository,
} from '../repositories';
import { ApiError, num, type Fetcher } from './fetcher';

/**
 * The selling, purchasing and day-end half of `Repositories`, over HTTP.
 *
 * Nothing here decides anything. The API owns pricing, availability, refund
 * arithmetic and cash variance — this file is a translator, and its one real
 * job is that every Decimal arrives as a number. Postgres serialises
 * Decimal(12,2) as a JSON *string* to avoid the precision loss a float would
 * introduce, so a total that skipped `num()` would silently concatenate instead
 * of adding. On an accounting surface that is not a formatting bug.
 */

/** A Decimal column on the wire: a string from Postgres, a number from pure logic. */
type Wire = string | number;

const opt = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

/* ------------------------------------------------------------ wire shapes */

interface WireLine {
  id: string;
  skuId: string;
  skuCode: string;
  name: string;
  qty: Wire;
  unitPrice: Wire;
  discount: Wire;
  taxId: string;
  taxRate: Wire;
  taxInclusive: boolean;
  taxableValue: Wire;
  taxAmount: Wire;
  lineTotal: Wire;
}

interface WireTotals {
  subTotal: Wire;
  discountTotal: Wire;
  taxableValue: Wire;
  taxTotal: Wire;
  roundOff: Wire;
  grandTotal: Wire;
}

interface WireOrder {
  id: string;
  number: string;
  storeId: string;
  customerId: string | null;
  status: OrderStatus;
  lines: WireLine[];
  totals: WireTotals;
  createdBy: string;
  createdAt: string;
}

interface WireInvoice {
  id: string;
  number: string;
  orderId: string | null;
  storeId: string;
  counterId: string;
  customerId: string | null;
  customerName: string | null;
  businessDate: string;
  status: InvoiceStatus;
  lines: WireLine[];
  totals: WireTotals;
  amountPaid: Wire;
  amountDue: Wire;
  createdBy: string;
  createdAt: string;
}

interface WirePayment {
  id: string;
  invoiceId: string;
  storeId: string;
  counterId: string;
  businessDate: string;
  paymentMethodId: string;
  amount: Wire;
  reference: string | null;
  status: PaymentStatus;
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
}

interface WireSalesReturn {
  id: string;
  number: string;
  invoiceId: string;
  storeId: string;
  reasonCodeId: string;
  lines: { skuId: string; qty: Wire; refundAmount: Wire }[];
  refundTotal: Wire;
  createdBy: string;
  createdAt: string;
}

interface WirePurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  locationId: string;
  status: PurchaseOrderStatus;
  lines: { skuId: string; qty: Wire; receivedQty: Wire; unitCost: Wire }[];
  expectedAt: string | null;
  createdBy: string;
  createdAt: string;
}

interface WireGoodsReceipt {
  id: string;
  number: string;
  purchaseOrderId: string;
  supplierId: string;
  locationId: string;
  supplierInvoiceNo: string | null;
  lines: { skuId: string; qty: Wire; unitCost: Wire; damagedQty: Wire }[];
  createdBy: string;
  createdAt: string;
}

interface WirePurchaseReturn {
  id: string;
  number: string;
  goodsReceiptId: string;
  supplierId: string;
  locationId: string;
  reasonCodeId: string;
  lines: { skuId: string; qty: Wire; unitCost: Wire }[];
  createdBy: string;
  createdAt: string;
}

interface WireSalesByMethod {
  paymentMethodId: string;
  paymentMethodName: string;
  kind: string;
  countedInDrawer: boolean;
  txnCount: number;
  amount: Wire;
}

interface WireClosing {
  id: string;
  storeId: string;
  counterId: string;
  businessDate: string;
  openingCash: Wire;
  salesByMethod: WireSalesByMethod[];
  expectedCash: Wire;
  physicalCash: Wire;
  variance: Wire;
  depositedAmount: Wire;
  carriedForward: Wire;
  note: string | null;
  status: DayEndClosing['status'];
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

interface WireClosingPreview {
  storeId: string;
  counterId: string;
  businessDate: string;
  openingCash: Wire;
  salesByMethod: WireSalesByMethod[];
  expectedCash: Wire;
  invoiceCount: number;
  totalSales: Wire;
  existing?: WireClosing | null;
}

interface WireDiscrepancy {
  id: string;
  kind: Discrepancy['kind'];
  locationId: string;
  businessDate: string;
  refType: string;
  refId: string;
  expected: Wire;
  actual: Wire;
  variance: Wire;
  reasonCodeId: string | null;
  note: string | null;
  status: Discrepancy['status'];
  raisedBy: string;
  raisedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

interface WireAudit {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  actorId: string | null;
  at: string;
}

/* ---------------------------------------------------------------- mapping */

const toLine = (line: WireLine): SaleLine => ({
  id: line.id,
  skuId: line.skuId,
  skuCode: line.skuCode,
  name: line.name,
  qty: num(line.qty),
  unitPrice: num(line.unitPrice),
  discount: num(line.discount),
  taxId: line.taxId,
  taxRate: num(line.taxRate),
  taxInclusive: line.taxInclusive,
  taxableValue: num(line.taxableValue),
  taxAmount: num(line.taxAmount),
  lineTotal: num(line.lineTotal),
});

const toTotals = (totals: WireTotals): SaleTotals => ({
  subTotal: num(totals.subTotal),
  discountTotal: num(totals.discountTotal),
  taxableValue: num(totals.taxableValue),
  taxTotal: num(totals.taxTotal),
  roundOff: num(totals.roundOff),
  grandTotal: num(totals.grandTotal),
});

const toOrder = (row: WireOrder): Order => ({
  id: row.id,
  number: row.number,
  storeId: row.storeId,
  customerId: opt(row.customerId),
  status: row.status,
  lines: row.lines.map(toLine),
  totals: toTotals(row.totals),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toInvoice = (row: WireInvoice): Invoice => ({
  id: row.id,
  number: row.number,
  orderId: opt(row.orderId),
  storeId: row.storeId,
  counterId: row.counterId,
  customerId: opt(row.customerId),
  customerName: opt(row.customerName),
  businessDate: row.businessDate,
  status: row.status,
  lines: row.lines.map(toLine),
  totals: toTotals(row.totals),
  amountPaid: num(row.amountPaid),
  amountDue: num(row.amountDue),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toPayment = (row: WirePayment): Payment => ({
  id: row.id,
  invoiceId: row.invoiceId,
  storeId: row.storeId,
  counterId: row.counterId,
  businessDate: row.businessDate,
  paymentMethodId: row.paymentMethodId,
  // Negative is legitimate here: that is how a refund is recorded.
  amount: num(row.amount),
  reference: opt(row.reference),
  status: row.status,
  idempotencyKey: row.idempotencyKey,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toSalesReturn = (row: WireSalesReturn): SalesReturn => ({
  id: row.id,
  number: row.number,
  invoiceId: row.invoiceId,
  storeId: row.storeId,
  reasonCodeId: row.reasonCodeId,
  lines: row.lines.map((line) => ({
    skuId: line.skuId,
    qty: num(line.qty),
    refundAmount: num(line.refundAmount),
  })),
  refundTotal: num(row.refundTotal),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toPurchaseOrder = (row: WirePurchaseOrder): PurchaseOrder => ({
  id: row.id,
  number: row.number,
  supplierId: row.supplierId,
  locationId: row.locationId,
  status: row.status,
  lines: row.lines.map((line) => ({
    skuId: line.skuId,
    qty: num(line.qty),
    receivedQty: num(line.receivedQty),
    unitCost: num(line.unitCost),
  })),
  expectedAt: opt(row.expectedAt),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toGoodsReceipt = (row: WireGoodsReceipt): GoodsReceipt => ({
  id: row.id,
  number: row.number,
  purchaseOrderId: row.purchaseOrderId,
  supplierId: row.supplierId,
  locationId: row.locationId,
  supplierInvoiceNo: opt(row.supplierInvoiceNo),
  lines: row.lines.map((line) => ({
    skuId: line.skuId,
    qty: num(line.qty),
    unitCost: num(line.unitCost),
    damagedQty: num(line.damagedQty),
  })),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toPurchaseReturn = (row: WirePurchaseReturn): PurchaseReturn => ({
  id: row.id,
  number: row.number,
  goodsReceiptId: row.goodsReceiptId,
  supplierId: row.supplierId,
  locationId: row.locationId,
  reasonCodeId: row.reasonCodeId,
  lines: row.lines.map((line) => ({
    skuId: line.skuId,
    qty: num(line.qty),
    unitCost: num(line.unitCost),
  })),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toSalesByMethod = (row: WireSalesByMethod): SalesByMethod => ({
  paymentMethodId: row.paymentMethodId,
  paymentMethodName: row.paymentMethodName,
  kind: row.kind,
  countedInDrawer: row.countedInDrawer,
  txnCount: row.txnCount,
  amount: num(row.amount),
});

const toClosing = (row: WireClosing): DayEndClosing => ({
  id: row.id,
  storeId: row.storeId,
  counterId: row.counterId,
  businessDate: row.businessDate,
  openingCash: num(row.openingCash),
  salesByMethod: row.salesByMethod.map(toSalesByMethod),
  expectedCash: num(row.expectedCash),
  physicalCash: num(row.physicalCash),
  variance: num(row.variance),
  depositedAmount: num(row.depositedAmount),
  carriedForward: num(row.carriedForward),
  note: opt(row.note),
  status: row.status,
  submittedBy: opt(row.submittedBy),
  submittedAt: opt(row.submittedAt),
  approvedBy: opt(row.approvedBy),
  approvedAt: opt(row.approvedAt),
});

const toPreview = (row: WireClosingPreview): ClosingPreview => ({
  storeId: row.storeId,
  counterId: row.counterId,
  businessDate: row.businessDate,
  openingCash: num(row.openingCash),
  salesByMethod: row.salesByMethod.map(toSalesByMethod),
  expectedCash: num(row.expectedCash),
  invoiceCount: row.invoiceCount,
  totalSales: num(row.totalSales),
  existing: row.existing ? toClosing(row.existing) : undefined,
});

const toDiscrepancy = (row: WireDiscrepancy): Discrepancy => ({
  id: row.id,
  kind: row.kind,
  locationId: row.locationId,
  businessDate: row.businessDate,
  refType: row.refType,
  refId: row.refId,
  expected: num(row.expected),
  actual: num(row.actual),
  variance: num(row.variance),
  reasonCodeId: opt(row.reasonCodeId),
  note: opt(row.note),
  status: row.status,
  raisedBy: row.raisedBy,
  raisedAt: row.raisedAt,
  resolvedBy: opt(row.resolvedBy),
  resolvedAt: opt(row.resolvedAt),
});

const toAuditLog = (row: WireAudit): AuditLog => ({
  id: row.id,
  entity: row.entity,
  entityId: row.entityId,
  action: row.action as AuditLog['action'],
  summary: row.summary,
  // A platform action has no company user behind it, but the log still needs an actor.
  actorId: row.actorId ?? 'system',
  at: row.at,
});

/**
 * `byId` is `Promise<T | undefined>` in the contract, but a missing row is a
 * 404 on the wire. Only that one status becomes `undefined` — a 403 must keep
 * surfacing as a failure rather than looking like an empty result.
 */
async function orUndefined<T>(load: Promise<T>): Promise<T | undefined> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

/* ----------------------------------------------------------- repositories */

export interface SalesRepositories {
  orders: OrderRepository;
  invoices: InvoiceRepository;
  payments: PaymentRepository;
  salesReturns: SalesReturnRepository;
  purchases: PurchaseRepository;
  closing: ClosingRepository;
  discrepancies: DiscrepancyRepository;
  audit: AuditRepository;
}

export function createSalesRepositories(fetcher: Fetcher): SalesRepositories {
  // `createdBy` / `submittedBy` are deliberately not forwarded. The API takes
  // the actor from the session cookie, and a client-supplied author on an
  // audited row is a claim, not a fact.
  return {
    orders: {
      create: async (input) =>
        toOrder(
          await fetcher.post<WireOrder>('/orders', {
            storeId: input.storeId,
            customerId: input.customerId,
            lines: input.lines,
          }),
        ),

      list: async (filter = {}) =>
        (
          await fetcher.get<WireOrder[]>('/orders', {
            storeId: filter.storeId,
            status: filter.status,
          })
        ).map(toOrder),

      byId: async (id) => {
        const row = await orUndefined(fetcher.get<WireOrder>(`/orders/${id}`));
        return row && toOrder(row);
      },

      convertToInvoice: async (orderId, counterId) =>
        toInvoice(await fetcher.post<WireInvoice>(`/orders/${orderId}/invoice`, { counterId })),
    },

    invoices: {
      create: async (input) =>
        toInvoice(
          await fetcher.post<WireInvoice>('/invoices', {
            storeId: input.storeId,
            counterId: input.counterId,
            customerId: input.customerId,
            customerName: input.customerName,
            orderId: input.orderId,
            lines: input.lines,
          }),
        ),

      list: async (filter = {}) =>
        (
          await fetcher.get<WireInvoice[]>('/invoices', {
            storeId: filter.storeId,
            businessDate: filter.businessDate,
            counterId: filter.counterId,
            status: filter.status,
            limit: filter.limit,
          })
        ).map(toInvoice),

      byId: async (id) => {
        const row = await orUndefined(fetcher.get<WireInvoice>(`/invoices/${id}`));
        return row && toInvoice(row);
      },

      cancel: async (id, note) =>
        toInvoice(await fetcher.post<WireInvoice>(`/invoices/${id}/cancel`, { note })),

      // Through `request` rather than `del`, because the confirmation travels
      // in the body — an invoice number in the URL would end up in access logs.
      remove: async (id, confirmNumber) => {
        await fetcher.request<{ deleted: true }>('DELETE', `/invoices/${id}`, { confirmNumber });
      },
    },

    payments: {
      capture: async (input) =>
        toPayment(
          await fetcher.post<WirePayment>('/payments', {
            invoiceId: input.invoiceId,
            paymentMethodId: input.paymentMethodId,
            amount: input.amount,
            reference: input.reference,
            // The key is the whole safety net for a retried capture, so it is
            // sent verbatim and never regenerated here.
            idempotencyKey: input.idempotencyKey,
          }),
        ),

      listByInvoice: async (invoiceId) =>
        (await fetcher.get<WirePayment[]>(`/invoices/${invoiceId}/payments`)).map(toPayment),

      listByDay: async (storeId, businessDate, counterId) =>
        (await fetcher.get<WirePayment[]>('/payments', { storeId, businessDate, counterId })).map(
          toPayment,
        ),
    },

    salesReturns: {
      create: async (input) =>
        toSalesReturn(
          await fetcher.post<WireSalesReturn>('/sales-returns', {
            invoiceId: input.invoiceId,
            reasonCodeId: input.reasonCodeId,
            lines: input.lines,
            note: input.note,
            refundMethodId: input.refundMethodId,
          }),
        ),

      list: async (filter = {}) =>
        (
          await fetcher.get<WireSalesReturn[]>('/sales-returns', {
            storeId: filter.storeId,
            invoiceId: filter.invoiceId,
          })
        ).map(toSalesReturn),
    },

    purchases: {
      listOrders: async () =>
        (await fetcher.get<WirePurchaseOrder[]>('/purchase-orders')).map(toPurchaseOrder),

      listReceipts: async () =>
        (await fetcher.get<WireGoodsReceipt[]>('/goods-receipts')).map(toGoodsReceipt),

      listReturns: async () =>
        (await fetcher.get<WirePurchaseReturn[]>('/purchase-returns')).map(toPurchaseReturn),

      createOrder: async (input) =>
        toPurchaseOrder(
          await fetcher.post<WirePurchaseOrder>('/purchase-orders', {
            supplierId: input.supplierId,
            locationId: input.locationId,
            lines: input.lines,
            expectedAt: input.expectedAt,
          }),
        ),

      receive: async (input) =>
        toGoodsReceipt(
          await fetcher.post<WireGoodsReceipt>('/goods-receipts', {
            purchaseOrderId: input.purchaseOrderId,
            supplierInvoiceNo: input.supplierInvoiceNo,
            lines: input.lines,
          }),
        ),

      createReturn: async (input) =>
        toPurchaseReturn(
          await fetcher.post<WirePurchaseReturn>('/purchase-returns', {
            goodsReceiptId: input.goodsReceiptId,
            reasonCodeId: input.reasonCodeId,
            lines: input.lines,
          }),
        ),

      cancelOrder: async (purchaseOrderId) =>
        toPurchaseOrder(
          await fetcher.post<WirePurchaseOrder>(`/purchase-orders/${purchaseOrderId}/cancel`, {}),
        ),
    },

    closing: {
      preview: async (request) =>
        toPreview(
          await fetcher.get<WireClosingPreview>('/closings/preview', {
            storeId: request.storeId,
            counterId: request.counterId,
            businessDate: request.businessDate,
          }),
        ),

      submit: async (input) =>
        toClosing(
          await fetcher.post<WireClosing>('/closings', {
            storeId: input.storeId,
            counterId: input.counterId,
            businessDate: input.businessDate,
            openingCash: input.openingCash,
            physicalCash: input.physicalCash,
            depositedAmount: input.depositedAmount,
            carriedForward: input.carriedForward,
            note: input.note,
          }),
        ),

      approve: async (closingId) =>
        toClosing(await fetcher.post<WireClosing>(`/closings/${closingId}/approve`, {})),

      list: async (storeId) =>
        (await fetcher.get<WireClosing[]>('/closings', { storeId })).map(toClosing),
    },

    discrepancies: {
      list: async (locationId) =>
        (await fetcher.get<WireDiscrepancy[]>('/discrepancies', { locationId })).map(toDiscrepancy),

      resolve: async (input) =>
        toDiscrepancy(
          await fetcher.post<WireDiscrepancy>(`/discrepancies/${input.discrepancyId}/resolve`, {
            status: input.status,
            reasonCodeId: input.reasonCodeId,
            note: input.note,
          }),
        ),
    },

    audit: {
      list: async (limit) => (await fetcher.get<WireAudit[]>('/audit', { limit })).map(toAuditLog),
    },
  };
}
