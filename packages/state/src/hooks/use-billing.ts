import {
  calcTotals,
  emptyTotals,
  priceLine,
  taxBreakup,
  type SaleLine,
  type SaleTotals,
  type TaxBreakupRow,
} from '@shop/core';
import type { CapturePayment, InvoiceCopy, InvoiceFilter, SaleLineInput } from '@shop/data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCartStore } from '../cart';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';
import { useTaxMap } from './use-masters';

/** Live pricing of the in-progress cart. Pure derivation — nothing is stored. */
/**
 * `interState` is passed in rather than read here, because it depends on the
 * bill-from entity and the customer GSTIN the billing screen holds. The rule
 * itself lives in `@shop/core` and the API applies the same one, so what a
 * cashier sees and what is written cannot disagree.
 */
export function useCartPricing(options?: { interState?: boolean }): {
  lines: SaleLine[];
  totals: SaleTotals;
  taxRows: TaxBreakupRow[];
} {
  const cartLines = useCartStore((s) => s.lines);
  const taxes = useTaxMap();

  return useMemo(() => {
    const priced = cartLines.flatMap<SaleLine>((line) => {
      const tax = taxes.get(line.sku.taxId);
      if (!tax) return [];
      return [
        priceLine({
          id: line.lineId,
          sku: line.sku,
          tax,
          qty: line.qty,
          discount: line.discount,
          unitPriceOverride: line.unitPriceOverride,
          overrideBasis: line.overrideBasis,
        }),
      ];
    });
    return {
      lines: priced,
      totals: priced.length ? calcTotals(priced) : emptyTotals(),
      taxRows: taxBreakup(priced, { interState: options?.interState }),
    };
  }, [cartLines, taxes, options?.interState]);
}

export interface Tender {
  paymentMethodId: string;
  amount: number;
  reference?: string;
}

export interface CheckoutInput {
  /** The store sells from its own shelf, so this is also the stock location. */
  storeId: string;
  counterId: string;
  customerId?: string;
  customerName?: string;
  /** Customer-scope answers, keyed by BillFieldConfig.key. */
  customerFields?: Record<string, string>;
  /** Sale-scope answers, keyed by BillFieldConfig.key. */
  customerDetails?: Record<string, string>;
  /** The entity to issue this bill under. */
  billFromId?: string;
  lines: SaleLineInput[];
  /** Empty = park the invoice unpaid. Multiple entries = split payment. */
  tenders: Tender[];
  createdBy: string;
}

/**
 * The demo's core write: bills the cart (which appends `sale` movements) and
 * captures its tenders. Idempotency keys are derived per tender so a retry of
 * the same checkout can never double-charge.
 */
export function useCheckout() {
  const repos = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const invoice = await repos.invoices.create({
        storeId: input.storeId,
        counterId: input.counterId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerFields: input.customerFields,
        customerDetails: input.customerDetails,
        billFromId: input.billFromId,
        lines: input.lines,
        createdBy: input.createdBy,
      });

      const payments = [];
      for (const [index, tender] of input.tenders.entries()) {
        if (tender.amount <= 0) continue;
        payments.push(
          await repos.payments.capture({
            invoiceId: invoice.id,
            paymentMethodId: tender.paymentMethodId,
            amount: tender.amount,
            reference: tender.reference,
            idempotencyKey: `${invoice.id}:${index}`,
            createdBy: input.createdBy,
          }),
        );
      }

      const settled = (await repos.invoices.byId(invoice.id)) ?? invoice;
      return { invoice: settled, payments };
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: qk.closing });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useInvoices(filter: InvoiceFilter) {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.invoices(filter), queryFn: () => repos.invoices.list(filter) });
}

/**
 * Voiding and erasing an invoice. Both require `admin.manage`; the API enforces
 * that independently, so a UI that offers them to the wrong role gets a 403
 * rather than a mistake.
 *
 * Both invalidate the same set as billing does. A cancellation moves stock,
 * cash and the audit log exactly as the sale did, only in the other direction.
 */
export function useCancelInvoice() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => repos.invoices.cancel(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: qk.closing });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useDeleteInvoice() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmNumber }: { id: string; confirmNumber: string }) =>
      repos.invoices.remove(id, confirmNumber),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: qk.closing });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

/**
 * Fetches the printable bill and hands it to the browser.
 *
 * Opened in a tab rather than downloaded: the point is the print dialog, which
 * is what reaches a bluetooth printer from a phone. The object URL is revoked
 * on a timer because revoking it immediately races the viewer that is still
 * loading it.
 */
export function usePrintInvoice() {
  const repos = useRepositories();
  return useMutation({
    mutationFn: async ({ id, copy }: { id: string; copy?: InvoiceCopy }) => {
      const blob = await repos.invoices.pdf(id, copy);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });
}

export function useInvoice(id: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.invoice(id ?? 'none'),
    queryFn: () => repos.invoices.byId(id!),
    enabled: Boolean(id),
  });
}

/** Settles an invoice that was parked unpaid or only part-paid at the counter. */
export function useCapturePayment() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CapturePayment) => repos.payments.capture(input),
    onSuccess: (payment) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: qk.invoicePayments(payment.invoiceId) });
      void queryClient.invalidateQueries({ queryKey: qk.closing });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useInvoicePayments(invoiceId: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.invoicePayments(invoiceId ?? 'none'),
    queryFn: () => repos.payments.listByInvoice(invoiceId!),
    enabled: Boolean(invoiceId),
  });
}
