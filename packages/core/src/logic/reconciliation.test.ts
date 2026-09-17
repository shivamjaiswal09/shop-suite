import { describe, expect, it } from 'vitest';
import type { Invoice } from '../entities/sales.ts';
import type { StockMovement, StockTransfer } from '../entities/stock.ts';
import { reconcileInventory, reconcilePayments, reconcileSales } from './reconciliation.ts';
import { suggestReplenishment } from './replenishment.ts';

const invoice = (id: string, qty: number, total: number): Invoice => ({
  id,
  number: `INV-${id}`,
  storeId: 'st_1',
  counterId: 'counter-1',
  businessDate: '2026-08-30',
  status: 'unpaid',
  interState: false,
  lines: [
    {
      id: 'l1',
      skuId: 'sku_1',
      skuCode: 'SKU-1',
      name: 'Widget',
      qty,
      unitPrice: total / qty,
      discount: 0,
      taxId: 'tax_1',
      taxRate: 0,
      taxInclusive: true,
      taxableValue: total,
      taxAmount: 0,
      lineTotal: total,
    },
  ],
  totals: {
    subTotal: total,
    discountTotal: 0,
    taxableValue: total,
    taxTotal: 0,
    roundOff: 0,
    grandTotal: total,
  },
  amountPaid: 0,
  amountDue: total,
  createdBy: 'usr_1',
  createdAt: '2026-08-30T10:00:00.000Z',
});

const saleMovement = (refId: string, qty: number): StockMovement => ({
  id: `mov_${refId}`,
  skuId: 'sku_1',
  locationId: 'st_1',
  type: 'sale',
  qty: -qty,
  refType: 'invoice',
  refId,
  createdBy: 'usr_1',
  createdAt: '2026-08-30T10:00:00.000Z',
});

describe('reconcileSales', () => {
  it('is silent when every invoice line has its movement', () => {
    expect(reconcileSales([invoice('a', 3, 300)], [saleMovement('a', 3)])).toHaveLength(0);
  });

  it('flags an invoice whose ledger movements do not match what was billed', () => {
    const findings = reconcileSales([invoice('a', 3, 300)], [saleMovement('a', 2)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'error', expected: 3, actual: 2, variance: -1 });
  });
});

describe('reconcilePayments', () => {
  it('flags outstanding money as a warning and over-capture as an error', () => {
    const unpaid = reconcilePayments([invoice('a', 1, 100)], []);
    expect(unpaid[0]).toMatchObject({ severity: 'warning' });

    const over = reconcilePayments(
      [invoice('b', 1, 100)],
      [
        {
          id: 'p1',
          invoiceId: 'b',
          storeId: 'st_1',
          counterId: 'counter-1',
          businessDate: '2026-08-30',
          paymentMethodId: 'pm_cash',
          amount: 150,
          status: 'success',
          idempotencyKey: 'k',
          createdBy: 'usr_1',
          createdAt: '2026-08-30T10:00:00.000Z',
        },
      ],
    );
    expect(over[0]).toMatchObject({ severity: 'error' });
  });
});

describe('reconcileInventory', () => {
  const transfer = (dispatchedAt: string): StockTransfer => ({
    id: 'trf_1',
    number: 'TRF-1',
    fromLocationId: 'wh_1',
    toLocationId: 'st_1',
    lines: [{ skuId: 'sku_1', qty: 10, receivedQty: 0 }],
    status: 'in_transit',
    dispatchedBy: 'usr_1',
    dispatchedAt,
  });

  const base = {
    locationName: (id: string) => id,
    skuName: (id: string) => id,
    today: '2026-08-30',
  };

  it('catches a location driven negative', () => {
    const findings = reconcileInventory({
      ...base,
      movements: [saleMovement('a', 5)],
      transfers: [],
    });
    expect(findings[0]).toMatchObject({ severity: 'error', actual: -5 });
  });

  it('flags stock stranded in transit but not a fresh dispatch', () => {
    const stale = reconcileInventory({
      ...base,
      movements: [],
      transfers: [transfer('2026-08-01T00:00:00.000Z')],
    });
    expect(stale).toHaveLength(1);

    const fresh = reconcileInventory({
      ...base,
      movements: [],
      transfers: [transfer('2026-08-30T06:00:00.000Z')],
    });
    expect(fresh).toHaveLength(0);
  });
});

describe('suggestReplenishment', () => {
  const level = (available: number) => ({
    skuId: 'sku_1',
    locationId: 'st_1',
    onHand: available,
    reserved: 0,
    available,
    damaged: 0,
    avgCost: 0,
    value: 0,
  });

  const input = (available: number, inbound: number, sources: { available: number; isPrimary: boolean }[]) => ({
    skuId: 'sku_1',
    skuCode: 'SKU-1',
    skuName: 'Widget',
    storeId: 'st_1',
    storeName: 'Store',
    storeLevel: level(available),
    minStock: 10,
    reorderLevel: 20,
    inbound,
    sources: sources.map((s, i) => ({
      locationId: `wh_${i}`,
      locationName: `Warehouse ${i}`,
      available: s.available,
      isPrimary: s.isPrimary,
    })),
  });

  it('suggests nothing when the shelf is at target', () => {
    expect(suggestReplenishment([input(25, 0, [{ available: 100, isPrimary: true }])])).toHaveLength(0);
  });

  it('counts in-transit stock before deciding a shelf is short', () => {
    expect(suggestReplenishment([input(5, 20, [{ available: 100, isPrimary: true }])])).toHaveLength(0);
  });

  it('prefers the primary warehouse and caps at what it holds', () => {
    const [suggestion] = suggestReplenishment([
      input(0, 0, [
        { available: 500, isPrimary: false },
        { available: 8, isPrimary: true },
      ]),
    ]);
    expect(suggestion?.sourceLocationName).toBe('Warehouse 1');
    expect(suggestion?.shortfall).toBe(20);
    expect(suggestion?.suggestedQty).toBe(8);
    // Flagged because the preferred source cannot cover it.
    expect(suggestion?.sourceShort).toBe(true);
  });

  it('marks a line with no linked stock as needing purchasing', () => {
    const [suggestion] = suggestReplenishment([input(0, 0, [])]);
    expect(suggestion?.suggestedQty).toBe(0);
    expect(suggestion?.sourceShort).toBe(true);
  });
});
