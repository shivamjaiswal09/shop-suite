import { describe, expect, it } from 'vitest';
import type { PaymentMethod } from '../entities/masters.ts';
import type { Payment } from '../entities/payment.ts';
import { calcClosing, needsDiscrepancy, summarizeSalesByMethod } from './closing.ts';

const methods: PaymentMethod[] = [
  { id: 'pm_cash', code: 'CASH', name: 'Cash', kind: 'cash', countedInDrawer: true, active: true },
  { id: 'pm_upi', code: 'UPI', name: 'UPI', kind: 'upi', countedInDrawer: false, active: true },
  { id: 'pm_old', code: 'OLD', name: 'Retired', kind: 'wallet', countedInDrawer: false, active: false },
];

const payment = (paymentMethodId: string, amount: number, status: Payment['status'] = 'success'): Payment => ({
  id: `pay_${paymentMethodId}_${amount}`,
  invoiceId: 'inv_1',
  storeId: 'br_1',
  counterId: 'ctr_1',
  businessDate: '2026-08-16',
  paymentMethodId,
  amount,
  status,
  idempotencyKey: `key_${paymentMethodId}_${amount}`,
  createdBy: 'usr_1',
  createdAt: '2026-08-16T10:00:00.000Z',
});

describe('summarizeSalesByMethod', () => {
  it('groups successful payments and skips inactive methods', () => {
    const summary = summarizeSalesByMethod(
      [payment('pm_cash', 500), payment('pm_cash', 250), payment('pm_upi', 1000)],
      methods,
    );
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({ paymentMethodId: 'pm_cash', txnCount: 2, amount: 750 });
    expect(summary[1]).toMatchObject({ paymentMethodId: 'pm_upi', txnCount: 1, amount: 1000 });
  });

  it('excludes failed and pending payments', () => {
    const summary = summarizeSalesByMethod(
      [payment('pm_cash', 500), payment('pm_cash', 999, 'failed'), payment('pm_cash', 111, 'pending')],
      methods,
    );
    expect(summary[0]?.amount).toBe(500);
  });
});

describe('calcClosing', () => {
  it('expects only drawer-counted tenders plus opening cash', () => {
    const salesByMethod = summarizeSalesByMethod([payment('pm_cash', 750), payment('pm_upi', 1000)], methods);
    const calc = calcClosing({ openingCash: 2000, salesByMethod, physicalCash: 2750 });
    expect(calc.expectedCash).toBe(2750);
    expect(calc.variance).toBe(0);
    expect(calc.totalSales).toBe(1750);
    expect(calc.nonDrawerSales).toBe(1000);
  });

  it('reports a short drawer as a negative variance needing a discrepancy', () => {
    const salesByMethod = summarizeSalesByMethod([payment('pm_cash', 750)], methods);
    const calc = calcClosing({ openingCash: 2000, salesByMethod, physicalCash: 2700 });
    expect(calc.variance).toBe(-50);
    expect(needsDiscrepancy(calc.variance)).toBe(true);
  });

  it('tolerates rounding-level variance', () => {
    expect(needsDiscrepancy(0.5)).toBe(false);
  });
});
