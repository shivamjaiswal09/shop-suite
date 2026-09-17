# The GST invoice PDF

A printable A4 tax invoice matching the sample, replacing the placeholder scope
in `2026-08-31-bill-printing-design.md`. That document's decisions still hold —
server-side Chromium, a view model as the contract, `GET /invoices/:id/pdf` —
and are not repeated here. This one says what the page contains and what has to
exist before it can be drawn.

## What the sample requires that we do not have

Five gaps, found by reading the sample against the schema rather than by
starting to draw it.

| Needed | Status |
| --- | --- |
| HSN per line | On the SKU, **not** snapshotted onto `InvoiceLine` |
| Amount in words | Not implemented |
| Terms & conditions | No home |
| Bank account, IFSC, branch | No home |
| State name from a code | We store `08`; the bill prints `08 RAJASTHAN` |

Each is dealt with below. None is hard; all of them are invisible until someone
tries to print a bill, which is why they are listed first.

### HSN moves onto the line

`InvoiceLine` gains `hsnCode String?`, captured at billing from the SKU.

It is snapshotted for the same reason `skuCode` and `name` already are: an HSN
corrected on the SKU next month must not change the classification a bill was
issued under. Reading it live through `skuId` would also break the moment a SKU
is deleted.

### Amount in words

A pure function in `@shop/core`:

```ts
export function amountInWords(amount: number): string;
// 552000 -> "Five Lakh Fifty Two Thousand Rupees Only"
// 1234.50 -> "One Thousand Two Hundred Thirty Four Rupees and Fifty Paise Only"
```

Indian numbering — lakh and crore, not million and billion. A bill printed in
Dholpur that says "five hundred fifty-two thousand" is wrong in the way that
makes a customer distrust the rest of the document.

Paise are included only when non-zero, matching how the sample prints a round
figure as plain rupees.

### Terms and bank details belong to the entity

`BillFrom` gains:

```prisma
  terms        String[] @default([])
  bankName     String?
  bankAccount  String?
  bankIfsc     String?
  bankBranch   String?
```

On the entity rather than the company because that is the level at which they
differ: two entities under one business file separately and bank separately, and
the sample's terms name a specific jurisdiction — Dholpur — which is a property
of the entity, not of the software.

`terms` is a list so each numbered line is a line, rather than one blob that the
renderer has to guess how to split.

These are **not** snapshotted onto the invoice. They are context printed on the
page, not facts the document asserts about the transaction — unlike the GSTIN,
which is. A reprint should carry the current bank account, because that is where
the customer is being asked to pay.

### State codes

A lookup in `@shop/core` mapping the 36 GST state codes to their names, so `08`
prints as `08 RAJASTHAN`. Static data, no table.

## The page

A4 portrait, one page per invoice, ruled like the sample.

```
┌──────────────────────────────────────────────────────────────┐
│ Original                                                     │
├──────────────────────────────────────────────────────────────┤
│ S.M. TRADERS            GST INVOICE      M/s AUTOEXIM HOUSE  │
│ Opposite Roadways...                     LLP                 │
│ DHOLPUR (Raj.)-328001                    MOB :               │
│ Mob : 9414268807, 9461696933             State : 08 RAJASTHAN│
│ GSTIN : 08ARCPM6091L1ZC                  GSTIN : 08ABEFA...  │
│ PAN   : ARCPM6091L                       Inv No: 5512  Date  │
├─────┬────┬──────────┬───┬──────┬────────┬─────────┬─────────┤
│ HSN │S.No│PARTICULARS│Qty│ RATE │ AMOUNT │CGST SGST│Net Amount│
├─────┴────┴──────────┴───┴──────┴────────┴─────────┴─────────┤
│ …lines…                                                      │
├──────────────────────────────────────────────────────────────┤
│ Amount (in words): RUPEES …        │ Total       552000      │
│                                    │ Round Off        0      │
│                                    │ Amount Payable 552000   │
├────────────────────────────────────┴─────────────────────────┤
│ Terms & Conditions:                     For S.M. TRADERS     │
│ 1. …                                                         │
│ 2. …                                    (Authorised Signatory)│
├──────────────────────────────────────────────────────────────┤
│ A/c No. : …   IFSC : …   BANK, BRANCH                        │
└──────────────────────────────────────────────────────────────┘
```

Three details from the sample that matter:

**The tax columns follow the supply.** CGST and SGST as a paired block for an
intra-state bill; a single IGST block across a state border. The sample is
intra-state, so it shows the pair — the renderer must not hard-code that.

**Line height is fixed and the table is padded to the page.** The sample's
table runs to a fixed depth whether there are three lines or ten, which is what
makes a stack of printed bills look uniform. Short bills get blank ruled rows.

**"Original" is a copy marking.** GST practice is Original for the buyer,
Duplicate for the transporter, Triplicate for the supplier. The endpoint takes
`?copy=original|duplicate|triplicate`, defaulting to original, and prints the
word. Nothing else differs between them.

## Overflow

A bill with more lines than one page holds continues onto a second, repeating
the header and the column headings. Totals, terms and the signature block print
once, on the last page.

Not paginating is the tempting shortcut and the wrong one: a 30-line invoice
silently losing its last rows is worse than not printing at all, and it would be
discovered by a customer rather than by us.

## View model

The pure function from the earlier spec, now concrete:

```ts
export interface InvoicePdfModel {
  copy: 'Original' | 'Duplicate' | 'Triplicate';
  seller: { legalName; addressLine; phones: string[]; gstin; pan };
  buyer: { name; gstin; stateCode; stateName };
  invoice: { number; date };
  lines: Array<{
    serial; hsnCode; particulars; qty; rate;
    amount; cgstRate; cgstAmount; sgstRate; sgstAmount; igstRate; igstAmount;
    netAmount;
  }>;
  interState: boolean;
  totals: { total; roundOff; payable; inWords };
  terms: string[];
  bank?: { name; account; ifsc; branch };
}
```

Built from the invoice alone plus the entity's terms and bank details. Asserted
directly in tests; the HTML is a rendering of it, not a source of truth.

## Testing

- **Amount in words** — zero, a round figure, paise, a lakh, a crore, and the
  teens and tens that trip naive implementations (11–19, 20, 90).
- **View model** — an intra-state bill fills CGST/SGST and leaves IGST zero; an
  inter-state one does the reverse; a line with no HSN renders blank rather than
  the word undefined.
- **State names** — every code the lookup claims to know resolves; an unknown
  code yields the bare number rather than throwing.
- **Rendering** — a golden test asserting the extracted text of a fixed invoice
  contains the number, both GSTINs, each HSN, and the amount payable. Text
  rather than bytes, so it survives a Chromium upgrade.
- **Pagination** — a 40-line invoice produces more than one page and the totals
  appear once.

## Deliberately excluded

A logo, the signature image, e-invoice IRN and QR codes, and e-way bill fields.
The last two are statutory above a turnover threshold and are a separate piece
of work with their own government integration — worth saying out loud, because
a shop that crosses that threshold will need them and will assume this covers it.
