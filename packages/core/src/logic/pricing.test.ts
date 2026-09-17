import { describe, expect, it } from 'vitest';
import type { SaleLine } from '../entities/sales.ts';
import { roundMoney } from '../entities/common.ts';
import {
  calcTotals,
  convertPriceBasis,
  isInterState,
  priceLine,
  stateCodeOf,
  taxBreakup,
} from './pricing.ts';

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

describe('stateCodeOf', () => {
  it('reads the two-digit prefix a GSTIN begins with', () => {
    expect(stateCodeOf('08ARCPM6091L1ZC')).toBe('08');
    expect(stateCodeOf(' 27AABCU9603R1ZX ')).toBe('27');
  });

  it('gives nothing for anything that does not start with two digits', () => {
    // A wrong-but-plausible GSTIN is a data-entry problem, not a reason to
    // refuse the sale — so it simply yields no state rather than throwing.
    for (const bad of [undefined, null, '', '   ', 'ABCDE', '8']) {
      expect(stateCodeOf(bad)).toBeUndefined();
    }
  });
});

describe('isInterState', () => {
  it('is true only when both states are known and differ', () => {
    expect(isInterState('08ARCPM6091L1ZC', '27AABCU9603R1ZX')).toBe(true);
    expect(isInterState('08ARCPM6091L1ZC', '08ABEFA1194J1ZE')).toBe(false);
  });

  it('falls back to intra-state when either side is unknown', () => {
    // A counter sale to an unregistered walk-in, which is most of them.
    expect(isInterState('08ARCPM6091L1ZC', undefined)).toBe(false);
    expect(isInterState(undefined, '27AABCU9603R1ZX')).toBe(false);
    expect(isInterState(undefined, undefined)).toBe(false);
  });
});

describe('taxBreakup across a state border', () => {
  const line = (taxableValue: number, taxAmount: number, taxRate: number) =>
    ({ taxableValue, taxAmount, taxRate }) as SaleLine;

  it('splits in half within a state', () => {
    const [row] = taxBreakup([line(1000, 180, 18)]);
    expect(row).toMatchObject({ cgst: 90, sgst: 90, igst: 0, taxAmount: 180 });
  });

  it('puts the whole amount on IGST across one', () => {
    const [row] = taxBreakup([line(1000, 180, 18)], { interState: true });
    expect(row).toMatchObject({ cgst: 0, sgst: 0, igst: 180, taxAmount: 180 });
  });

  it('charges the same tax either way — only its presentation changes', () => {
    const lines = [line(1000, 180, 18), line(500, 25, 5)];
    const sum = (rows: ReturnType<typeof taxBreakup>) =>
      rows.reduce((t, r) => t + r.cgst + r.sgst + r.igst, 0);

    expect(sum(taxBreakup(lines))).toBe(sum(taxBreakup(lines, { interState: true })));
  });

  it('gives an odd remainder to SGST so the halves still re-sum', () => {
    // Compared as money: 9.03 + 9.02 is 18.049999999999997 in binary floating
    // point, which is a fact about doubles rather than about the split.
    const [row] = taxBreakup([line(100, 18.05, 18)]);
    // Which half absorbs the odd paisa is not specified — only that together
    // they come to the tax actually charged.
    expect(roundMoney(row!.cgst + row!.sgst)).toBe(row!.taxAmount);
  });
});
