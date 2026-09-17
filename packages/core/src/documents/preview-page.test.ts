import { describe, expect, it } from 'vitest';
import { PREVIEW_NUMBER, previewInvoicePage } from './preview-page.ts';

const line = {
  name: 'MRF ZLX 165/80 R14',
  hsnCode: '4011',
  qty: 2,
  unitPrice: 4200,
  taxRate: 28,
  taxableValue: 6562.5,
  taxAmount: 1837.5,
  lineTotal: 8400,
};

const totals = { taxableValue: 6562.5, taxTotal: 1837.5, roundOff: 0, grandTotal: 8400 };

describe('previewInvoicePage', () => {
  it('says the number is not assigned yet', () => {
    // The counter allocates on write, so a preview has no number to show. It
    // must not show a plausible one either — that would be a number nobody
    // issued appearing on something shaped like a bill.
    const page = previewInvoicePage({ lines: [line], totals, interState: false });
    expect(page.number).toBe(PREVIEW_NUMBER);
    expect(page.number).not.toMatch(/\d{4}/);
  });

  it('carries the lines through untouched', () => {
    const page = previewInvoicePage({ lines: [line], totals, interState: false });
    expect(page.lines).toEqual([line]);
    expect(page.totals).toEqual(totals);
  });

  it('carries the customer and the supply type', () => {
    const page = previewInvoicePage({
      lines: [line],
      totals,
      interState: true,
      customerName: 'Ravi Kumar',
      customerGstin: '27AABCU9603R1ZX',
    });
    expect(page.customerName).toBe('Ravi Kumar');
    expect(page.customerGstin).toBe('27AABCU9603R1ZX');
    expect(page.interState).toBe(true);
  });

  it('drops an empty customer name rather than printing a blank', () => {
    const page = previewInvoicePage({
      lines: [line],
      totals,
      interState: false,
      customerName: '   ',
      customerGstin: '',
    });
    expect(page.customerName).toBeUndefined();
    expect(page.customerGstin).toBeUndefined();
  });

  it('carries the billing entity when one is resolved', () => {
    const page = previewInvoicePage({
      lines: [line],
      totals,
      interState: false,
      billFrom: {
        legalName: 'S.M Automobiles Pvt Ltd',
        gstin: '29AAACC1206D1ZC',
        phones: ['+91 80 4000 1001'],
      },
    });
    expect(page.billFrom?.legalName).toBe('S.M Automobiles Pvt Ltd');
    expect(page.billFrom?.phones).toEqual(['+91 80 4000 1001']);
  });

  it('leaves the entity absent when none is chosen', () => {
    const page = previewInvoicePage({ lines: [line], totals, interState: false });
    expect(page.billFrom).toBeUndefined();
  });

  it('stamps a timestamp so the preview dates itself', () => {
    const page = previewInvoicePage({ lines: [line], totals, interState: false });
    expect(Number.isNaN(Date.parse(page.createdAt))).toBe(false);
  });
});
