import type { InvoicePage } from './invoice-html.ts';

/**
 * What stands in for the number on a bill that has not been raised.
 *
 * Deliberately not a plausible number. The counter allocates on write, so a
 * preview has none — and showing a likely-looking one on a page shaped like a
 * tax invoice is how a number nobody issued ends up quoted to a customer.
 */
export const PREVIEW_NUMBER = '— assigned on raising —';

export interface PreviewInput {
  lines: InvoicePage['lines'];
  totals: InvoicePage['totals'];
  interState: boolean;
  customerName?: string;
  customerGstin?: string;
  billFrom?: InvoicePage['billFrom'];
}

/** Blank boxes are what an untouched field looks like, not an answer. */
const filled = (value: string | undefined): string | undefined => value?.trim() || undefined;

/**
 * The bill as it would be raised, for confirming before raising it.
 *
 * Shared by the till and the phone so the sheet a cashier confirms is built by
 * the same rule on both — a preview that disagreed with the document would be
 * worse than no preview.
 */
export const previewInvoicePage = (input: PreviewInput): InvoicePage => ({
  number: PREVIEW_NUMBER,
  createdAt: new Date().toISOString(),
  customerName: filled(input.customerName),
  customerGstin: filled(input.customerGstin),
  interState: input.interState,
  lines: input.lines,
  totals: input.totals,
  billFrom: input.billFrom,
});
