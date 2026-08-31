import { describe, expect, it } from 'vitest';
import { calcTotals, convertPriceBasis, priceLine, taxBreakup } from './pricing.ts';

const sku = { id: 'sku_1', code: 'SKU-1', name: 'Widget', sellingPrice: 100, taxId: 'tax_18' };
const exclusive = { id: 'tax_18', rate: 18, inclusive: false };
const inclusive = { id: 'tax_18i', rate: 18, inclusive: true };

describe('priceLine', () => {
  it('adds tax on top for exclusive pricing', () => {
    const line = priceLine({ id: 'l1', sku, tax: exclusive, qty: 2 });
    expect(line.taxableValue).toBe(200);
    expect(line.taxAmount).toBe(36);
    expect(line.lineTotal).toBe(236);
  });

  it('extracts tax from the price for inclusive pricing', () => {
    const line = priceLine({ id: 'l1', sku, tax: inclusive, qty: 1 });
    expect(line.lineTotal).toBe(100);
    expect(line.taxableValue).toBe(84.75);
    expect(line.taxAmount).toBe(15.26);
  });

  it('applies a line discount before tax', () => {
    const line = priceLine({ id: 'l1', sku, tax: exclusive, qty: 2, discount: 50 });
    expect(line.taxableValue).toBe(150);
    expect(line.lineTotal).toBe(177);
  });

  it('honours a manual unit price override', () => {
    const line = priceLine({ id: 'l1', sku, tax: exclusive, qty: 1, unitPriceOverride: 80 });
    expect(line.unitPrice).toBe(80);
    expect(line.lineTotal).toBe(94.4);
  });
});

describe('calcTotals', () => {
  it('sums lines and rounds the grand total to the nearest rupee', () => {
    const lines = [
      priceLine({ id: 'l1', sku, tax: exclusive, qty: 1 }),
      priceLine({ id: 'l2', sku, tax: inclusive, qty: 1 }),
    ];
    const totals = calcTotals(lines);
    expect(totals.subTotal).toBe(200);
    expect(totals.grandTotal).toBe(Math.round(totals.taxableValue + totals.taxTotal));
    expect(totals.roundOff).toBeCloseTo(totals.grandTotal - (totals.taxableValue + totals.taxTotal), 2);
  });
});


describe('convertPriceBasis', () => {
  it('round-trips a price across the tax boundary', () => {
    const inclusive = convertPriceBasis(100, 'exclusive', 'inclusive', 18);
    expect(inclusive).toBe(118);
    expect(convertPriceBasis(inclusive, 'inclusive', 'exclusive', 18)).toBe(100);
  });

  it('is a no-op when the basis does not change', () => {
    expect(convertPriceBasis(99.994, 'inclusive', 'inclusive', 18)).toBe(99.99);
  });
});

describe('priceLine with an edited price', () => {
  it('treats a pre-tax override as the taxable value and adds tax on top', () => {
    const line = priceLine({
      id: 'l1',
      sku,
      tax: inclusive,
      qty: 1,
      unitPriceOverride: 100,
      overrideBasis: 'exclusive',
    });
    expect(line.taxableValue).toBe(100);
    expect(line.taxAmount).toBe(18);
    expect(line.lineTotal).toBe(118);
  });

  it('treats a post-tax override as what the customer pays', () => {
    const line = priceLine({
      id: 'l1',
      sku,
      tax: inclusive,
      qty: 1,
      unitPriceOverride: 118,
      overrideBasis: 'inclusive',
    });
    expect(line.lineTotal).toBe(118);
    expect(line.taxableValue).toBe(100);
    expect(line.taxAmount).toBe(18);
  });

  it('gives the same answer from either side for the same money', () => {
    const fromPreTax = priceLine({
      id: 'a',
      sku,
      tax: exclusive,
      qty: 3,
      unitPriceOverride: 100,
      overrideBasis: 'exclusive',
    });
    const fromPostTax = priceLine({
      id: 'b',
      sku,
      tax: exclusive,
      qty: 3,
      unitPriceOverride: 118,
      overrideBasis: 'inclusive',
    });
    expect(fromPostTax.lineTotal).toBe(fromPreTax.lineTotal);
    expect(fromPostTax.taxableValue).toBe(fromPreTax.taxableValue);
  });

  it('falls back to the SKU price when no override is given', () => {
    expect(priceLine({ id: 'l1', sku, tax: exclusive, qty: 1 }).unitPrice).toBe(sku.sellingPrice);
  });
});

describe('taxBreakup', () => {
  it('groups by rate and splits CGST/SGST so the halves re-sum', () => {
    const rows = taxBreakup([
      priceLine({ id: 'a', sku, tax: exclusive, qty: 1 }),
      priceLine({ id: 'b', sku, tax: exclusive, qty: 1 }),
      priceLine({ id: 'c', sku, tax: { id: 't5', rate: 5, inclusive: false }, qty: 1 }),
    ]);

    expect(rows.map((r) => r.rate)).toEqual([5, 18]);
    for (const row of rows) {
      expect(row.cgst + row.sgst).toBeCloseTo(row.taxAmount, 2);
    }
    // Both 18% lines land in one row.
    expect(rows.find((r) => r.rate === 18)?.taxableValue).toBe(200);
  });

  it('is empty for an empty cart', () => {
    expect(taxBreakup([])).toEqual([]);
  });
});
