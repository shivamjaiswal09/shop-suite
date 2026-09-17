# Bill From entities

The legal entity a bill is issued *by* becomes a master: legal name, GSTIN, PAN,
address. Entities are created once at company level and mapped to the branches
allowed to bill under them. At the till the cashier picks one — or has it picked
for them when only one applies — and the rest fills itself in.

## Why this is not just a field on the branch

A GSTIN already sits on `Company` and on every `StockLocation`, and nothing in
the app reads either. That is the problem in miniature: two places can answer
"who is this bill from" and no rule says which wins.

The request is also specifically many-to-many — one entity available across
several branches, and a branch able to choose between entities. A column on the
branch cannot express that. This company already has branches named *S.M.
Automobiles* and *S.M. Traders*, which is the shape the feature exists for.

## Data model

```prisma
/// A legal entity this company issues bills as.
model BillFrom {
  id          String  @id @default(cuid())
  companyId   String
  /// Printed on the invoice as the supplier.
  legalName   String
  gstin       String?
  pan         String?
  addressLine String?
  active      Boolean @default(true)

  company   Company            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  locations BillFromLocation[]
  invoices  Invoice[]

  @@unique([companyId, legalName])
  @@index([companyId, active])
  @@map("bill_from")
}

/// Which branches may bill under which entity.
model BillFromLocation {
  billFromId String
  locationId String

  billFrom BillFrom      @relation(fields: [billFromId], references: [id], onDelete: Cascade)
  location StockLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@id([billFromId, locationId])
  @@index([locationId])
  @@map("bill_from_locations")
}
```

Cascade on both sides of the join: the mapping is not a fact in its own right,
so deleting either end should take it with them rather than leave a row pointing
at nothing.

`StockLocation.gstin` is dropped. It is null everywhere today, nothing reads it,
and leaving it would preserve exactly the ambiguity this change removes.
`Company.gstin` stays — it describes the tenant's own registration, which is not
the same question as what to print on a bill.

## The invoice keeps both the reference and a copy

`Invoice` gains:

```prisma
  billFromId      String?
  billFromName    String?
  billFromGstin   String?
  billFromPan     String?
```

The id is for reporting — "what did we bill under Traders this quarter" should
be one query, not a string match. The three copies are for the document: a
tax invoice has to keep saying what it said when it was issued, and correcting a
mistyped GSTIN next month must not rewrite the bills already given to customers.

This mirrors `InvoiceLine`, which keeps `skuId` alongside a snapshot of the code
and name for the same reason.

Named columns rather than JSON, unlike the customer bill-fields: this set is
fixed, known at schema time, and printed on every single invoice.

## Choosing one at the till

Resolution, in order:

1. The branch maps to exactly one active entity — selected silently, shown
   read-only. Most shops, and no decision at the counter.
2. The branch maps to several — a select appears beside the customer details,
   defaulting to none so the choice is deliberate. Required before billing.
3. The branch maps to none — billing proceeds with the entity fields empty, as
   it does today. A company that never opens the screen is unaffected.

Case 3 is what keeps this additive. It is also why `billFromId` is nullable.

## Migration

1. Add `bill_from`, `bill_from_locations`, and the four `Invoice` columns.
2. For each company, create one entity from its `legalName` and `gstin`, mapped
   to all of its store locations. Every company already has a legal name, so
   nothing is invented.
3. Drop `StockLocation.gstin`.

Warehouses are not mapped. Stock moves through them; bills do not come from
them.

No existing invoice is backfilled. A bill issued before this feature existed was
not issued under a chosen entity, and writing one onto it would be inventing
history rather than recording it.

## UI

**Masters → Bill From.** Create an entity with legal name, GSTIN, PAN and
address; tick the branches it may bill from; deactivate. Gated on
`admin.manage` like every other master.

**Quick Billing.** Sits in the Customer card, above the customer's own details —
the bill's two parties, in the order they appear on the document. One option
renders as a read-only line; several render as a select. Choosing one shows the
GSTIN and PAN beneath it, so what will print is visible before billing.

**Invoice detail.** The entity is shown with the captured customer details,
from the snapshot rather than the master.

## Testing

- **Resolution** — one mapping auto-selects; several require a choice; none
  leaves the fields empty and still bills.
- **Scoping** — a branch is only offered entities mapped to it, and only active
  ones.
- **Snapshot durability** — renaming an entity or changing its GSTIN leaves
  invoices already issued unchanged.
- **Mapping lifecycle** — unmapping a branch stops it being offered without
  touching the invoices it already issued.

## Deliberately excluded

Per-entity invoice numbering series, per-entity logos, and bank details on the
bill. Numbering is the one most likely to be wanted: an accountant may expect a
separate series per GSTIN. It is left out because the numbering helper is shared
by six document types and changing its key is a larger change than this feature
should carry.
