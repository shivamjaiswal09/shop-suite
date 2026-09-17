# Customer GSTIN and inter-state tax

A bill to a customer registered in another state carries one IGST line at the
full rate, not CGST and SGST at half each. The system currently splits every
bill in half regardless, which is wrong for any inter-state sale.

This is the first of two pieces. The second prints the invoice as a PDF, and it
is sequenced after this one because the PDF only renders what the tax rule
decides.

## Where the states come from

A GSTIN begins with a two-digit state code — `08ARCPM6091L1ZC` is Rajasthan,
`27AABCU9603R1ZX` is Maharashtra. Both parties' codes are already available:

| Party | Source |
| --- | --- |
| Supplier | `BillFrom.gstin`, chosen at the till |
| Customer | the `gstin` built-in bill field, captured at the till |

No new capture mechanism. The GSTIN bill field already exists, is
customer-scope, and is reused on a returning customer's next visit. A shop with
no B2B customers leaves it switched off and sees no change.

## The rule

```
interState = supplierState && customerState && supplierState !== customerState
```

Both must be known. A missing GSTIN on either side means intra-state — which is
the present behaviour, and the correct default for a counter sale to an
unregistered walk-in.

Deriving it rather than asking is deliberate. A cashier should not be choosing
between CGST and IGST; it follows from two numbers already on the bill, and
leaving it to a person is how the wrong tax gets charged.

### What changes on the invoice

| | Intra-state | Inter-state |
| --- | --- | --- |
| Lines shown | CGST @ half, SGST @ half | IGST @ full |
| Total tax | unchanged | unchanged |
| Grand total | unchanged | unchanged |

Only the presentation of the same tax changes. Nothing about pricing, totals or
stock moves.

## Data model

`TaxBreakupRow` gains `igst`, and `taxBreakup` takes the flag:

```ts
export interface TaxBreakupRow {
  rate: number;
  taxableValue: number;
  /** Half the total on an intra-state supply; zero on an inter-state one. */
  cgst: number;
  sgst: number;
  /** The full amount on an inter-state supply; zero otherwise. */
  igst: number;
  taxAmount: number;
}

export function taxBreakup(
  lines: readonly SaleLine[],
  options?: { interState?: boolean },
): TaxBreakupRow[];
```

Three fields rather than a discriminated union, because every consumer wants to
render a row and a row is the same shape either way — one of the three is simply
zero. A union would push a branch into each of them to say the same thing.

`Invoice` gains:

```prisma
  /// Snapshot: whether this bill was raised as an inter-state supply.
  interState      Boolean @default(false)
  /// The customer's GSTIN as given, for the bill and for the return.
  customerGstin   String?
  /// Two-digit place of supply, from that GSTIN.
  placeOfSupply   String?
```

Snapshotted for the same reason the supplier details are: a bill states the tax
it was raised under, and a customer correcting their GSTIN next month must not
change a document already issued. It is also what lets a reprint show the same
figures it showed at the counter.

## Where it is decided

In `@shop/core`, as a pure function beside the pricing rules:

```ts
export const stateCodeOf = (gstin: string | undefined): string | undefined =>
  /^\d{2}/.test(gstin?.trim() ?? '') ? gstin!.trim().slice(0, 2) : undefined;

export const isInterState = (supplierGstin?: string, customerGstin?: string): boolean => {
  const a = stateCodeOf(supplierGstin);
  const b = stateCodeOf(customerGstin);
  return Boolean(a && b && a !== b);
};
```

The API decides it at checkout from the entity it resolved and the customer
fields it received, and stores the result. The till computes the same thing for
display, from the same function — so what the cashier sees and what is written
cannot disagree.

A GSTIN that does not start with two digits yields no state code and therefore
no inter-state supply. Validating the whole fifteen-character format is not
attempted: a wrong-but-plausible GSTIN is a data-entry problem, and refusing to
bill over it would stop a sale at the counter for something only the customer
can fix.

## UI

**Quick Billing.** The tax table in the bill summary shows CGST/SGST columns or
a single IGST column, following the same rule. A line naming the place of supply
appears when it is inter-state, because that is the surprising case and a
cashier should see why the tax looks different.

**Invoice detail.** The same table, from the snapshot.

## Testing

- **State code** — extracted from a well-formed GSTIN; absent from an empty,
  short, or non-numeric one.
- **The rule** — same state is intra; different states is inter; either side
  missing is intra.
- **Breakup** — intra splits in half with the remainder to SGST and zero IGST;
  inter puts the full amount on IGST and zero on the halves; both re-sum to the
  same total tax.
- **Snapshot** — an invoice keeps the flag and the GSTIN it was raised with
  after the customer's GSTIN is later corrected.
- **Default** — a company capturing no GSTIN bills exactly as it does today.

## Deliberately excluded

GSTIN format validation beyond the state prefix, reverse charge, export and
SEZ supplies, and the place-of-supply rules for services — which differ from
goods and are not what this shop sells. Each is a real part of GST and none is
needed to bill a tyre correctly.
