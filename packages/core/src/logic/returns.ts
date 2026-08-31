import { roundMoney, roundQty } from '../entities/common.ts';
import type { Invoice } from '../entities/sales.ts';

export interface ReturnableLine {
  skuId: string;
  skuCode: string;
  name: string;
  billedQty: number;
  returnedQty: number;
  /** Still eligible to come back. */
  remainingQty: number;
  /** What one unit refunds, tax included. */
  unitRefund: number;
}

/**
 * What may still be returned against an invoice, given everything already
 * returned. Refund per unit is derived from the line total actually charged —
 * discounts and tax included — so a partial return never refunds more than was
 * taken.
 */
export function returnableLines(
  invoice: Invoice,
  priorReturns: { lines: { skuId: string; qty: number }[] }[],
): ReturnableLine[] {
  const already = new Map<string, number>();
  for (const ret of priorReturns) {
    for (const line of ret.lines) {
      already.set(line.skuId, (already.get(line.skuId) ?? 0) + line.qty);
    }
  }

  return invoice.lines.map((line) => {
    const returnedQty = roundQty(already.get(line.skuId) ?? 0);
    return {
      skuId: line.skuId,
      skuCode: line.skuCode,
      name: line.name,
      billedQty: line.qty,
      returnedQty,
      remainingQty: roundQty(Math.max(line.qty - returnedQty, 0)),
      unitRefund: line.qty > 0 ? roundMoney(line.lineTotal / line.qty) : 0,
    };
  });
}

export function calcRefund(
  lines: readonly ReturnableLine[],
  requested: readonly { skuId: string; qty: number }[],
): number {
  return roundMoney(
    requested.reduce((sum, req) => {
      const line = lines.find((l) => l.skuId === req.skuId);
      return line ? sum + line.unitRefund * req.qty : sum;
    }, 0),
  );
}
