import { roundMoney, roundQty } from '../entities/common.ts';
import type { Invoice } from '../entities/sales.ts';
import type { Payment } from '../entities/payment.ts';
import type { StockMovement, StockTransfer } from '../entities/stock.ts';

export type FindingSeverity = 'ok' | 'warning' | 'error';

export interface ReconFinding {
  id: string;
  label: string;
  detail: string;
  severity: FindingSeverity;
  expected?: number;
  actual?: number;
  variance?: number;
}

/**
 * Sales reconciliation: every invoice line must have produced a matching `sale`
 * movement. With an append-only ledger this should hold by construction — the
 * check exists so that if it ever stops holding, it is loud rather than silent.
 */
export function reconcileSales(
  invoices: readonly Invoice[],
  movements: readonly StockMovement[],
): ReconFinding[] {
  const findings: ReconFinding[] = [];
  const soldByInvoice = new Map<string, number>();

  for (const movement of movements) {
    if (movement.refType !== 'invoice') continue;
    soldByInvoice.set(movement.refId, roundQty((soldByInvoice.get(movement.refId) ?? 0) + Math.abs(movement.qty)));
  }

  for (const invoice of invoices) {
    if (invoice.status === 'cancelled') continue;
    const billed = roundQty(invoice.lines.reduce((sum, l) => sum + l.qty, 0));
    const moved = soldByInvoice.get(invoice.id) ?? 0;
    if (moved !== billed) {
      findings.push({
        id: `sales:${invoice.id}`,
        label: `Invoice ${invoice.number}`,
        detail: `Billed ${billed} unit(s) but the ledger records ${moved}`,
        severity: 'error',
        expected: billed,
        actual: moved,
        variance: roundQty(moved - billed),
      });
    }
  }

  return findings;
}

/** Payment reconciliation: what each invoice is owed versus what was captured. */
export function reconcilePayments(
  invoices: readonly Invoice[],
  payments: readonly Payment[],
): ReconFinding[] {
  const findings: ReconFinding[] = [];
  const capturedByInvoice = new Map<string, number>();

  for (const payment of payments) {
    if (payment.status !== 'success') continue;
    capturedByInvoice.set(
      payment.invoiceId,
      roundMoney((capturedByInvoice.get(payment.invoiceId) ?? 0) + payment.amount),
    );
  }

  for (const invoice of invoices) {
    if (invoice.status === 'cancelled') continue;
    const captured = capturedByInvoice.get(invoice.id) ?? 0;
    const due = roundMoney(invoice.totals.grandTotal - captured);
    if (Math.abs(due) < 0.01) continue;

    findings.push({
      id: `payment:${invoice.id}`,
      label: `Invoice ${invoice.number}`,
      detail:
        due > 0
          ? `${due} outstanding against a total of ${invoice.totals.grandTotal}`
          : `Over-captured by ${Math.abs(due)}`,
      severity: due > 0 ? 'warning' : 'error',
      expected: invoice.totals.grandTotal,
      actual: captured,
      variance: roundMoney(-due),
    });
  }

  return findings;
}

export interface InventoryReconInput {
  movements: readonly StockMovement[];
  transfers: readonly StockTransfer[];
  locationName: (locationId: string) => string;
  skuName: (skuId: string) => string;
  /** Business date, used to age in-transit transfers. */
  today: string;
  /** In-transit longer than this many days is flagged. */
  staleAfterDays?: number;
}

/**
 * Inventory reconciliation. There is no external system to compare against, so
 * this checks the things that can actually go wrong: stock driven negative, and
 * transfers dispatched but never received (stock that belongs to nobody).
 */
export function reconcileInventory(input: InventoryReconInput): ReconFinding[] {
  const findings: ReconFinding[] = [];
  const staleAfter = input.staleAfterDays ?? 3;

  const balances = new Map<string, number>();
  for (const movement of input.movements) {
    const key = `${movement.skuId}::${movement.locationId}`;
    balances.set(key, roundQty((balances.get(key) ?? 0) + movement.qty));
  }

  for (const [key, balance] of balances) {
    if (balance >= 0) continue;
    const [skuId, locationId] = key.split('::');
    findings.push({
      id: `stock:${key}`,
      label: `${input.skuName(skuId!)} at ${input.locationName(locationId!)}`,
      detail: `Ledger balance is negative (${balance}) — more was taken out than ever went in`,
      severity: 'error',
      expected: 0,
      actual: balance,
      variance: balance,
    });
  }

  const cutoff = new Date(`${input.today}T00:00:00.000Z`).getTime() - staleAfter * 86_400_000;
  for (const transfer of input.transfers) {
    if (transfer.status !== 'in_transit') continue;
    if (new Date(transfer.dispatchedAt).getTime() > cutoff) continue;
    const units = roundQty(transfer.lines.reduce((sum, l) => sum + l.qty, 0));
    findings.push({
      id: `transit:${transfer.id}`,
      label: `Transfer ${transfer.number}`,
      detail: `${units} unit(s) in transit since ${transfer.dispatchedAt.slice(0, 10)} — owned by no location`,
      severity: 'warning',
      expected: units,
      actual: 0,
      variance: -units,
    });
  }

  return findings;
}
