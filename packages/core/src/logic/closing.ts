import { roundMoney } from '../entities/common.ts';
import type { SalesByMethod } from '../entities/closing.ts';
import type { PaymentMethod } from '../entities/masters.ts';
import type { Payment } from '../entities/payment.ts';

/** Groups successful payments for a business day by tender. */
export function summarizeSalesByMethod(
  payments: readonly Payment[],
  methods: readonly PaymentMethod[],
): SalesByMethod[] {
  const byMethod = new Map<string, { txnCount: number; amount: number }>();

  for (const p of payments) {
    if (p.status !== 'success') continue;
    const bucket = byMethod.get(p.paymentMethodId) ?? { txnCount: 0, amount: 0 };
    bucket.txnCount += 1;
    bucket.amount = roundMoney(bucket.amount + p.amount);
    byMethod.set(p.paymentMethodId, bucket);
  }

  return methods
    .filter((m) => m.active)
    .map((m) => {
      const bucket = byMethod.get(m.id) ?? { txnCount: 0, amount: 0 };
      return {
        paymentMethodId: m.id,
        paymentMethodName: m.name,
        kind: m.kind,
        countedInDrawer: m.countedInDrawer,
        txnCount: bucket.txnCount,
        amount: bucket.amount,
      };
    });
}

export interface ClosingCalcInput {
  openingCash: number;
  salesByMethod: readonly SalesByMethod[];
  physicalCash: number;
}

export interface ClosingCalc {
  expectedCash: number;
  physicalCash: number;
  /** Negative = drawer is short, positive = excess. */
  variance: number;
  totalSales: number;
  drawerSales: number;
  nonDrawerSales: number;
}

export function calcClosing(input: ClosingCalcInput): ClosingCalc {
  const drawerSales = roundMoney(
    input.salesByMethod.filter((s) => s.countedInDrawer).reduce((sum, s) => sum + s.amount, 0),
  );
  const nonDrawerSales = roundMoney(
    input.salesByMethod.filter((s) => !s.countedInDrawer).reduce((sum, s) => sum + s.amount, 0),
  );
  const expectedCash = roundMoney(input.openingCash + drawerSales);

  return {
    expectedCash,
    physicalCash: roundMoney(input.physicalCash),
    variance: roundMoney(input.physicalCash - expectedCash),
    totalSales: roundMoney(drawerSales + nonDrawerSales),
    drawerSales,
    nonDrawerSales,
  };
}

/** A variance beyond this (in currency) must raise a Discrepancy. */
export const CASH_VARIANCE_TOLERANCE = 1;

export const needsDiscrepancy = (variance: number): boolean =>
  Math.abs(variance) > CASH_VARIANCE_TOLERANCE;
