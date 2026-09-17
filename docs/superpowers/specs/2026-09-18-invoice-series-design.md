# Configurable invoice series, per entity and financial year

An invoice number is currently `INV-STRA-000001` — a fixed prefix, the branch
code, and a six-digit counter that begins at one and never resets. A shop
migrating from another system cannot continue its existing numbering, two
branches billing under one registration keep separate counters, and nothing
marks the financial year.

GST asks for a consecutive serial number, unique within a financial year, for
each registered entity. Today's scheme satisfies none of those three properties
by accident of design: it is per branch, never resets, and cannot start anywhere
but one.

## What an admin configures

Two fields on a Bill From entity:

| Field | Meaning |
| --- | --- |
| `invoiceTemplate` | The shape of the number, with tokens |
| `invoiceSeqStart` | What the counter begins at each financial year |

A template is literal text with tokens substituted:

```
SMA/{FY}/{SEQ:5}   ->   SMA/26-27/00501
```

| Token | Renders | Notes |
| --- | --- | --- |
| `{FY}` | `26-27` | The financial year, two digits either side |
| `{FYYY}` | `2026-27` | The same, four digits on the left |
| `{BRANCH}` | `STRA` | The billing branch's code |
| `{SEQ:n}` | `00501` | The counter, zero-padded to `n` |

### What the validator enforces

A template is checked when it is saved, not when a bill is raised. A counter is
no place to discover that a number cannot be produced.

- **Exactly one `{SEQ}` token.** This is what makes a number unique within its
  series; zero of them would repeat forever and two would be ambiguous.
- **At most sixteen characters rendered**, which is the GST limit. The check is
  against the worst case — the widest year, the longest branch code among those
  mapped to the entity, and a counter at its padded width.
- **Only `A-Z`, `0-9`, `/` and `-` in the literal text**, which is the character
  set GST permits. Lower case is upper-cased on save rather than rejected.
- **`n` between 1 and 9** in `{SEQ:n}`.

A template that fails any of these is refused with the reason. An entity with no
template keeps today's `INV-{BRANCH}-{SEQ:6}` behaviour exactly, so a company
that never opens this screen sees no change.

## One sequence per entity per financial year

The counter belongs to the registered entity, not the till. Two branches billing
under one GSTIN draw from the same series — `00501` at one branch, `00502` at the
other — because that is the series GST expects the entity to be able to produce.

`{BRANCH}` remains available for anyone who wants the branch visible on the
document. It is a label, not a key: including it does not split the counter.

## Data model

A counter row, rather than deriving the next number from the highest one issued:

```prisma
/// The running number for one entity in one financial year.
model InvoiceSeries {
  id         String @id @default(cuid())
  companyId  String
  billFromId String
  /// `2026-27`, as the financial year is written.
  fy         String
  /// The number the next invoice in this series will take.
  nextSeq    Int

  billFrom BillFrom @relation(fields: [billFromId], references: [id], onDelete: Cascade)

  @@unique([billFromId, fy])
  @@map("invoice_series")
}
```

and on `BillFrom`:

```prisma
  /// Null keeps the legacy `INV-{BRANCH}-{SEQ:6}` numbering.
  invoiceTemplate String?
  /// Where the counter starts each financial year.
  invoiceSeqStart Int     @default(1)
```

A stored counter rather than `max(number) + 1` is the decision the rest of this
design rests on, for three reasons.

**A configurable start cannot be expressed as a maximum.** With no invoices yet,
the highest number plus one is one. The start has to seed the counter, and then
stop mattering — otherwise lowering it next month would reissue numbers already
on customers' bills.

**The present lookup is a string sort.** `orderBy: { number: 'desc' }` is correct
only while every number is the same width. A template padded to five digits that
reaches `100000` sorts below `99999`, and the next invoice silently takes a
number already used. Widening the padding of a live series does the same thing.
A counter has no width.

**A template must stay editable.** Nothing parses a sequence back out of a
formatted number, so changing the prefix in October leaves the counter where it
was and the next bill simply carries the new shape.

The financial-year reset needs no special case: a new year has no row, so one is
created seeded from `invoiceSeqStart`.

## Where the financial year comes from

From the invoice's `businessDate`, which is the shop's own day and is already
stored on the row. An Indian financial year begins on 1 April, so a business date
of `2026-09-18` is `2026-27` and `2027-03-31` is still `2026-27`.

Deriving it from the business date rather than from the wall clock keeps one
notion of which day a sale belongs to. A bill and the day-end closing that counts
it must agree, and they already agree on `businessDate`.

**A caveat this inherits.** `businessDateOf` in `apps/api/src/routes/sales.ts`
computes the day as `at.toISOString().slice(0, 10)` — in UTC. A shop's day
therefore turns over at 05:30 IST rather than midnight, and a sale rung up at
01:00 IST on 1 April is recorded against 31 March and so against the previous
financial year.

This is not introduced here and is not fixed here: `businessDate` drives day-end
closings and every sales report, and changing it is its own piece of work with
its own migration. It is written down because the financial year now depends on
it, and because a numbering bug that appears for five and a half hours once a
year is the kind that gets diagnosed at the counter in April.

## Allocating a number

Inside the transaction that already writes the invoice:

1. Derive `fy` from the business date.
2. Upsert the `InvoiceSeries` row for `(billFromId, fy)`, creating it with
   `nextSeq = invoiceSeqStart` if absent.
3. Take `nextSeq`, increment the row.
4. Render the template.

Steps two and three are one statement — an atomic increment returning the value
it replaced — so two tills cannot read the same counter. Postgres serialises the
row update; the loser waits rather than duplicating.

`@@unique([companyId, number])` on `Invoice` stays as the backstop. The existing
`withNumberRetry` wrapper keeps its three attempts, so a collision from any
source still resolves rather than failing a sale.

A number is allocated only where one is written today, which leaves a cancelled
invoice's number consumed rather than returned to the pool. That is correct: GST
expects a cancelled invoice to remain in the series as a cancelled document, not
to leave a hole that a later bill fills.

## Invoices already issued

Untouched. An issued document keeps the number it was issued under, whatever is
configured afterwards.

Configuring a template mid-year therefore leaves two series inside one financial
year — the old `INV-STRA-000001` run and the new one. This is permitted rather
than prevented, because migrating from another system mid-year is the case the
feature exists for. The Bill From screen says so plainly when a template is set
on an entity that has already billed this year.

## UI

The Bill From card gains an **Invoice numbering** section per entity: the
template, the starting number, and a live preview of the next number the entity
would issue — rendered from the real counter where a series exists, and from
`invoiceSeqStart` where it does not.

The preview is the point of the screen. A template is an abstraction an admin
should never have to evaluate in their head, and the failure it prevents —
discovering the shape is wrong on a customer's bill — is not one that can be
undone.

Validation errors appear against the field, naming the rule broken: which token
is missing, or how many characters over the limit it renders.

## Testing

- **Tokens** — each renders; `{SEQ:5}` pads; `{FY}` and `{FYYY}` differ as
  documented; `{BRANCH}` takes the billing branch's code.
- **Validation** — no `{SEQ}` is refused; two are refused; seventeen rendered
  characters are refused; a disallowed character is refused; lower case is
  accepted and upper-cased.
- **Financial year** — 1 April opens one; 31 March closes it; a December date
  sits in the year that began that April.
- **The counter** — starts at `invoiceSeqStart`; increments; a second branch
  under the same entity continues the same run rather than starting its own.
- **The reset** — the first invoice of the next financial year takes
  `invoiceSeqStart` again, and the previous year's row is left where it was.
- **Editing** — changing the template mid-year keeps the counter; changing
  `invoiceSeqStart` mid-year does not disturb a series already running.
- **Concurrency** — two checkouts against one entity in parallel produce two
  different numbers.
- **Default** — an entity with no template numbers exactly as it does today.

## Deliberately excluded

Per-branch counters under one entity, which the sequence scope rules out on
purpose. Templates on orders, purchase orders, receipts and returns, which keep
today's scheme — only the tax invoice carries the GST serial obligation, and
`nextNumber` continues to serve the other five unchanged. Retrospective
renumbering of issued invoices, which a tax invoice does not permit. Reserving or
reusing the number of a cancelled invoice. And fixing the UTC business date,
which is described above as inherited and belongs to its own change.
