# Stepped billing with configurable customer fields

Billing becomes three steps — cart, customer, payment — and which customer
details are asked for becomes a company setting rather than something fixed in
the code.

The two halves are one change because neither is worth much alone. A step for
customer details is only useful if a shop can decide what those details are; a
field configuration has nowhere to appear until there is a step to hold it.

Web only. The native app keeps its current billing screen and follows later,
inheriting the configuration through `@shop/state` without any further data
changes.

## Why fields are not all alike

A vehicle registration is not a property of a customer. The same person brings a
different vehicle next month, and a bill from March has to keep saying which
vehicle it was for. A phone number is the opposite: it identifies the person,
and typing it again next visit should find them rather than create a second
record of the same customer.

So each field declares where its value belongs.

| Scope | Stored on | Behaviour |
| --- | --- | --- |
| `customer` | the `Customer` row | Persists between visits; prefilled when the customer is recognised |
| `sale` | the `Invoice` row | Captured per bill; never overwritten by a later sale |

Getting this wrong in either direction is quietly destructive. Everything on the
customer means a vehicle number is overwritten on every visit and no historical
bill can say what it was. Everything on the invoice means a returning customer
retypes their details each time and the customer master stops being used at all.

## Data model

```prisma
/// Which customer details this company asks for at the till, and where each
/// answer belongs.
model BillFieldConfig {
  id        String   @id @default(cuid())
  companyId String

  /// Names the Customer column this field drives — 'name', 'phone', 'email',
  /// 'gstin', 'addressLine' — or null for a field the company invented. The
  /// value is the column name exactly, so the mapping needs no lookup table.
  builtin   String?
  /// Stable identifier. Invoices store captured values against it, so it is
  /// assigned once and never re-keyed; the label carries the display name.
  key       String
  label     String
  /// 'customer' or 'sale'. See above.
  scope     String
  /// 'text' | 'number' | 'phone'
  type      String   @default("text")
  required  Boolean  @default(false)
  sortOrder Int      @default(0)
  active    Boolean  @default(true)

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, key])
  @@index([companyId, active])
  @@map("bill_field_configs")
}
```

And one column: `Invoice.customerDetails Json?`, holding the sale-scope answers
keyed by `key` — `{ "vehicle_number": "KA01AB1234" }`.

### Why JSON rather than a table of values

These values are written once with the invoice and read back only with that
invoice. Nothing aggregates or filters across them. A child table would add a
join to every bill read to serve a query nobody runs, and Postgres can still
reach inside the JSON if that changes.

### Why the values are snapshotted

The invoice keeps what was captured, under the key it was captured against.
Renaming a field afterwards is then cosmetic, and deactivating one does not
blank out the bills that already carry it. A label is resolved when a bill is
displayed; if the configuration is gone, the raw key is shown rather than
nothing.

### Built-in fields are not a second mechanism

`Customer` already has `name`, `phone`, `email`, `gstin` and `addressLine` as
real columns, and `phone` is uniquely indexed per company because that is how a
counter finds a returning customer. Those stay exactly as they are. A
`BillFieldConfig` row with `builtin: 'phone'` does not store the number — it
decides whether the till asks for it, whether it is mandatory, and where it sits
in the list.

Treating them as ordinary custom fields would mean giving up that index,
rebuilding customer lookup, and migrating existing customer records, to gain
uniformity nobody at the counter can see.

## The three steps

```
[1] Cart        add SKUs, adjust prices, see the totals
      | Continue to customer
[2] Customer    whatever the configuration asks for
      | Continue to payment
[3] Payment     tenders, then complete the sale
```

Enforced rather than decorative: payment is unreachable while a required field
is empty. Moving back is always allowed and never discards what has been
entered — a cashier who realises they missed an item should not lose the
customer's details to go and add it.

The cart's current behaviour is unchanged. This adds a step after it, and moves
payment behind that step; it does not alter pricing, overrides, or stock checks.

### Recognising a returning customer

When `phone` is configured and a known number is entered, the other
customer-scope fields prefill and the sale links to the existing customer rather
than creating a second record. Sale-scope fields stay empty — that is the
distinction the scopes exist to draw.

An unrecognised number creates a customer only when a name was also given,
since `Customer.name` is non-null. Phone alone is carried on the invoice and no
customer record is made: a half-identified walk-in should not become a row named
after their phone number, which is what the counter would have to type to get
past the requirement.

### Anonymous sales still work

`Customer.name` is non-null, and walk-in sales already pass a `customerName`
without creating a customer. A configuration that hides name changes nothing
about that path.

## Configuration UI

A "Bill fields" section in Masters, beside Categories and Taxes.

Built-ins appear as a fixed checklist — shown, required, order. Custom fields
can be added, edited and deactivated, each with a scope and a type. Deactivating
hides a field from the till without touching the bills that carry it.

Gated on `admin.manage`, like every other master.

## Testing

- **Resolution** — a pure function turning the configuration plus entered values
  into what the customer record and the invoice each receive. Asserted directly:
  a customer-scope value reaches the customer, a sale-scope value reaches the
  invoice, an inactive field is ignored, an unknown key is dropped.
- **Required fields** — payment is refused while one is empty, and permitted
  once filled.
- **Returning customer** — a known phone prefills customer-scope fields, leaves
  sale-scope fields empty, and links rather than duplicates.
- **Snapshot durability** — a bill renders its captured values after the field
  is renamed, and after it is deactivated.
- **Default configuration** — a company with no rows behaves exactly as billing
  does today.

## Deliberately excluded

Conditional fields, per-branch configuration, validation patterns beyond the
type, and drag-to-reorder. Ordering uses `sortOrder` numbers, as Categories
already does.

Per-branch configuration is excluded because every master in this schema is
company-scoped and nothing about the request suggests two branches of one
business would ask their customers for different things.

## Migration

Additive: one new table, one nullable column. A company with no `BillFieldConfig`
rows falls back to the present behaviour — an optional customer name — so the
change is invisible until someone configures it.

Seeding a default set for existing companies is not part of this. The fallback
covers them, and guessing which fields a shop wants is how the configuration
ends up ignored.
