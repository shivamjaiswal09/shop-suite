import { roundMoney } from '../entities/common.ts';
import type { Tax } from '../entities/masters.ts';
import type { Sku } from '../entities/product.ts';
import type { SaleLine, SaleTotals } from '../entities/sales.ts';

/**
 * Which side of tax a price is quoted on.
 *   exclusive — the figure is the taxable value; tax is added on top
 *   inclusive — the figure is what the customer pays; tax is inside it
 */
export type PriceBasis = 'exclusive' | 'inclusive';

export interface PriceLineInput {
  id: string;
  sku: Pick<Sku, 'id' | 'code' | 'name' | 'sellingPrice' | 'taxId'>;
  tax: Pick<Tax, 'id' | 'rate' | 'inclusive'>;
  qty: number;
  /** Absolute discount on the whole line, in currency. */
  discount?: number;
  /** Override the SKU's selling price (manual price edit at the counter). */
  unitPriceOverride?: number;
  /**
   * How to read the override. Defaults to however the tax itself is quoted, so
   * an override with no basis behaves exactly like the SKU's own price.
   */
  overrideBasis?: PriceBasis;
}

/** The tax's own basis — what `Sku.sellingPrice` is quoted on. */
export const basisOfTax = (tax: Pick<Tax, 'inclusive'>): PriceBasis =>
  tax.inclusive ? 'inclusive' : 'exclusive';

/**
 * Converts a price quoted on one side of tax to the other. This is what lets a
 * cashier type either the pre-tax or the post-tax figure and have the rest
 * computed, rather than reaching for a calculator.
 */
export function convertPriceBasis(
  amount: number,
  from: PriceBasis,
  to: PriceBasis,
  rate: number,
): number {
  if (from === to) return roundMoney(amount);
  const factor = 1 + rate / 100;
  return roundMoney(to === 'inclusive' ? amount * factor : amount / factor);
}

/**
 * Computes one priced line. Handles both tax-inclusive MRP-style pricing and
 * tax-exclusive pricing; `lineTotal` is always what the customer pays.
 */
export function priceLine(input: PriceLineInput): SaleLine {
  const native = basisOfTax(input.tax);
  const unitPrice =
    input.unitPriceOverride === undefined
      ? input.sku.sellingPrice
      : convertPriceBasis(
          input.unitPriceOverride,
          input.overrideBasis ?? native,
          native,
          input.tax.rate,
        );
  const discount = roundMoney(input.discount ?? 0);
  const gross = roundMoney(unitPrice * input.qty - discount);
  const rate = input.tax.rate;

  const taxableValue = input.tax.inclusive ? roundMoney(gross / (1 + rate / 100)) : gross;
  const taxAmount = roundMoney(taxableValue * (rate / 100));
  const lineTotal = input.tax.inclusive ? gross : roundMoney(taxableValue + taxAmount);

  return {
    id: input.id,
    skuId: input.sku.id,
    skuCode: input.sku.code,
    name: input.sku.name,
    qty: input.qty,
    unitPrice,
    discount,
    taxId: input.tax.id,
    taxRate: rate,
    taxInclusive: input.tax.inclusive,
    taxableValue,
    taxAmount,
    lineTotal,
  };
}

/** Sums priced lines and applies nearest-rupee round-off. */
export function calcTotals(lines: readonly SaleLine[]): SaleTotals {
  const subTotal = roundMoney(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  const discountTotal = roundMoney(lines.reduce((s, l) => s + l.discount, 0));
  const taxableValue = roundMoney(lines.reduce((s, l) => s + l.taxableValue, 0));
  const taxTotal = roundMoney(lines.reduce((s, l) => s + l.taxAmount, 0));
  const beforeRounding = roundMoney(taxableValue + taxTotal);
  const grandTotal = Math.round(beforeRounding);
  const roundOff = roundMoney(grandTotal - beforeRounding);

  return { subTotal, discountTotal, taxableValue, taxTotal, roundOff, grandTotal };
}

export const emptyTotals = (): SaleTotals => ({
  subTotal: 0,
  discountTotal: 0,
  taxableValue: 0,
  taxTotal: 0,
  roundOff: 0,
  grandTotal: 0,
});

export interface TaxBreakupRow {
  rate: number;
  taxableValue: number;
  /** Central GST — half the total for an intra-state supply. */
  cgst: number;
  /** State GST — the other half. */
  sgst: number;
  taxAmount: number;
}

/**
 * Tax grouped by rate, split into CGST/SGST halves the way an Indian retail
 * invoice prints it.
 *
 * Assumes an intra-state supply, which is the only case a single-state shop
 * sees. An inter-state sale would show one IGST line at the full rate instead.
 */
export function taxBreakup(lines: readonly SaleLine[]): TaxBreakupRow[] {
  const byRate = new Map<number, { taxableValue: number; taxAmount: number }>();

  for (const line of lines) {
    const bucket = byRate.get(line.taxRate) ?? { taxableValue: 0, taxAmount: 0 };
    bucket.taxableValue = roundMoney(bucket.taxableValue + line.taxableValue);
    bucket.taxAmount = roundMoney(bucket.taxAmount + line.taxAmount);
    byRate.set(line.taxRate, bucket);
  }

  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, bucket]) => {
      const half = roundMoney(bucket.taxAmount / 2);
      return {
        rate,
        taxableValue: bucket.taxableValue,
        cgst: half,
        // Give any rounding remainder to SGST so the halves always re-sum.
        sgst: roundMoney(bucket.taxAmount - half),
        taxAmount: bucket.taxAmount,
      };
    });
}
