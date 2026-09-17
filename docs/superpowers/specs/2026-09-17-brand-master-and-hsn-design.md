# Brand master and HSN on the SKU

Two changes to catalogue onboarding, together because both land on the same
form.

Brand stops being free text and becomes a master with one level of sub-brands.
Creating a SKU picks a brand, then a sub-brand from that brand's children, then
names the SKU. And the SKU regains an HSN code of its own.

## Why brand needs a master

It is free text on `Product` today, which cannot answer "what did we sell of
Ceat this month" without trusting that nobody typed `ceat`, `CEAT` or `Ceat `.
The catalogue is small enough to fix now — three distinct values across eleven
products — and only gets harder later.

Sub-brands matter because that is how the stock is actually organised. The
existing tyres are entered as separate products named `2.75-18 Milaze X5`,
`3.00-17 Milaze X5` and `Tyre Ceat 3.00-18 Milaze X5` — three sizes of one line,
with the line's name repeated in each and no way to group them.

### Products and SKUs stay one-to-one

Every unique combination is entered as its own product with a single SKU, and
that is not being changed. The decision is deliberate and the spec records it so
the next person does not read the two tables as an unused hierarchy and try to
"fix" it.

Brand and sub-brand therefore live on `Product`, which the SKU form creates
inline — so in practice they are chosen per SKU, which is what the form shows.

## Data model

```prisma
/// Brands and their sub-brands, in one self-referencing table.
model Brand {
  id        String  @id @default(cuid())
  companyId String
  name      String
  /// Null for a top-level brand; set for a sub-brand.
  parentId  String?
  active    Boolean @default(true)

  company  Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  parent   Brand?  @relation("BrandTree", fields: [parentId], references: [id], onDelete: NoAction)
  children Brand[] @relation("BrandTree")
  products Product[]
  subBrandProducts Product[] @relation("ProductSubBrand")

  @@unique([companyId, parentId, name])
  @@index([companyId, parentId])
  @@map("brands")
}
```

One table rather than a `Brand` and a `SubBrand`, because the two would carry
identical columns and identical CRUD. The unique key includes `parentId`, so
`Ceat → Milaze X5` and `MRF → Milaze X5` can both exist; two top-level brands
called Ceat cannot.

Depth is limited to two by the API, not by the schema: a sub-brand's parent must
itself be top-level. Nothing in the request needs a third level, and allowing one
by accident means every consumer has to handle a tree it was never designed for.

`Product` gains:

```prisma
  brandId    String?
  subBrandId String?
```

and loses its free-text `brand`.

### Both ids, not just the sub-brand

Storing only the sub-brand would make the brand derivable, but every list and
filter would need a join to answer "which brand is this". Storing both costs one
column and one rule: **the API rejects a sub-brand whose parent is not the given
brand.** Without that check the two could disagree, which is worse than the join
would have been.

### The display string is computed, not stored

`Product.brand` is removed as a column and returned as a computed field in the
API's projection — `Ceat · Milaze X5`, or just `Ceat`, or absent. Existing
screens that read `product.brand` keep working untouched, and there is no
denormalised copy to drift.

## HSN

`Sku` gains a nullable `hsnCode`.

HSN classifies a commodity, and `Tax` already carries one. That is not enough:
tyres are 4011 and tubes 4013, and both are taxed at the same rate, so a
per-tax code cannot describe a varied catalogue. `Tax.hsnCode` stays, and is
offered as the default when the SKU form knows the tax — a starting value, not
the answer.

Optional, in keeping with the rest of the SKU form, where only the code is
required.

## Migration

Additive except for the `brand` column.

1. Add `brands`, add `brandId` and `subBrandId` to `products`, add `hsnCode` to
   `skus`.
2. For each distinct non-null `Product.brand`, create a top-level `Brand` and
   point its products at it. Three values, eleven products.
3. Drop `Product.brand`.

Step 2 runs before step 3, so no brand is lost. No sub-brands are invented —
which of the existing tyres belong to *Milaze X5* is a judgement about the
catalogue, and guessing it would put wrong data in front of the person best
placed to enter it correctly.

## UI

**Masters → Brands.** Add a brand; add sub-brands under a selected brand;
deactivate either. A brand with active sub-brands warns before deactivation,
since hiding the parent hides its children from the SKU form.

**New SKU form.** The free-text Brand input is replaced by two selects: Brand,
then Sub-brand filtered to that brand's children. Sub-brand is optional — `ITC`
has none and unbranded stock has neither. HSN sits beside the tax field,
prefilled from the tax and editable.

## Testing

- **Hierarchy rules** — a sub-brand's parent must be top-level; a product's
  sub-brand must belong to its brand; the same sub-brand name may exist under
  two different brands.
- **Display string** — brand with sub-brand, brand alone, neither.
- **HSN default** — the tax's code prefills, an entered code wins, and neither
  is required.
- **Deactivation** — a deactivated brand disappears from the SKU form without
  disturbing the products already pointing at it.

## Deliberately excluded

A third level, brand logos, brand-level default tax, and merging two brands into
one. The last is the only one likely to be missed; it is worth building when
someone has actually created a duplicate, because the merge rules depend on what
they got wrong.
