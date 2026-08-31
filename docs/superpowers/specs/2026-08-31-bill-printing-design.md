# Bill printing

Print a bill from the Android app to a Bluetooth printer, and download the same
document from the web app.

Delivered in two phases. **Phase 1 is the current scope**: one fixed bill layout,
rendered server-side, printable from both apps. **Phase 2 is roadmap**: the same
pipeline with a per-company and per-branch HTML template that admins author
themselves.

Phase 1 is not a throwaway prototype of Phase 2. It builds the whole pipeline —
view model, renderer, endpoint, print path — and hard-codes only the one thing
Phase 2 replaces: where the HTML comes from.

## Why the printer needs no code

The printers in question are ordinary printers that happen to speak Bluetooth,
not thermal receipt printers. Android's print framework already handles them:
an app hands a PDF to the OS, the OS shows its print dialog, and every printer
it can see — Bluetooth, Wi-Fi or USB — appears there. `expo-print` is that API.

So there is no Bluetooth pairing code, no ESC/POS byte protocol, and no custom
native module anywhere in this feature. This is worth stating because the
obvious reading of "print over Bluetooth" implies all three, and a thermal
receipt printer genuinely would require them.

## Rendering happens on the server

`GET /invoices/:id/pdf` returns a finished PDF.

The alternative — rendering on the phone with `expo-print`'s HTML-to-PDF — was
rejected because the PDF would then be produced by whatever WebView version each
phone happens to carry, and the web app would need a second implementation. One
renderer means a bill looks the same whether it came from the counter, the
office, or an email months later.

The cost is that printing needs connectivity. Acceptable for now: the till
already cannot bill without the API, so printing is not the thing that makes it
network-dependent.

### Engine

`puppeteer-core` with `@sparticuz/chromium` in the Vercel function.

A real browser is the only way to render arbitrary HTML and CSS faithfully.
Pure-JS HTML-to-PDF libraries support a fraction of CSS, which is survivable for
one hand-tuned layout but fails the moment Phase 2 lets other people author
templates — and choosing an engine now that cannot carry Phase 2 would mean
rewriting the renderer later. A hosted rendering API was rejected because
invoice and customer details would leave the platform.

It costs roughly 50 MB in the function, well inside Vercel's 5 GB limit, and a
2-4 second cold start on the first bill of a quiet period.

## The view model is the contract

The renderer never sees Prisma rows. A pure function builds a plain-JSON view
model — company, branch, invoice, lines, totals, amount in words — and the
template sees only that.

This boundary is what makes Phase 2 cheap and safe. Template authors get a
documented, stable shape; a schema change breaks one mapping function rather
than every shop's bill; and the view model can be built and asserted on in tests
without a browser anywhere near them.

## Phase 1 — one fixed bill

### Scope

- A single built-in bill layout: a GST tax invoice with the company and branch
  header, line items with HSN, tax breakdown, totals, and amount in words.
  A4 portrait, since it prints to ordinary office printers loaded with A4.
- `GET /invoices/:id/pdf`, company-scoped like every other route.
- Web: download and print buttons on invoice detail.
- Mobile: print after billing, and reprint from invoice detail, via
  `expo-print` into the Android print dialog.

### Deliberately excluded

No `BillTemplate` table, no versioning, no configuration UI, no per-branch
override, no PDF archiving, no emailing. Phase 2 covers the first four; the last
two are not currently wanted at all.

### The one seam to leave open

Template lookup goes behind a `resolveTemplate(companyId, locationId)` function
that, in Phase 1, ignores both arguments and returns the built-in default.
Phase 2 replaces that function's body and nothing else.

Do not add `Invoice.billTemplateId` yet. It is a nullable column that can be
added when versioning exists, and a null would mean "the default" either way.

### Permissions

Printing requires whatever already permits reading the invoice. Nothing new.

## Phase 2 — configurable templates (roadmap)

### Data model

```prisma
model BillTemplate {
  id         String   @id @default(cuid())
  companyId  String
  /// null = the company-wide default; set = an override for one branch.
  locationId String?
  version    Int
  html       String
  active     Boolean  @default(true)
  createdBy  String
  createdAt  DateTime @default(now())

  @@unique([companyId, locationId, version])
  @@index([companyId, locationId, active])
}
```

Plus `Invoice.billTemplateId String?`.

**Editing never updates a row.** It deactivates the current version and inserts
the next. Reprint fidelity depends entirely on this: mutate in place and every
historical bill silently re-renders under a layout it was never issued with.

### Resolution

At issue time: branch active template, else company active template, else the
built-in default. The chosen id is stamped onto the invoice inside the same
transaction that writes it, so a bill cannot exist without a record of how it
looked.

At reprint time there is no resolution — the pinned id is used directly. This is
what makes a reprinted GST invoice match the copy the customer holds.

Branch fields are available as `{{branch.*}}` in every template, so branches
differing in address or GSTIN never need differing templates. The override
exists for genuinely different layouts, which is rare.

### Authoring

A page under Administration, gated on `admin.manage`: editor beside a live
preview rendered through the same endpoint against a sample invoice. Saving
test-renders first, so a template that cannot render cannot be saved.

Web only. It is a code editor, and configuring a bill format is an occasional
admin task, not counter work.

### Sandboxing

The HTML is authored by users, so the render context is locked down: JavaScript
disabled in the page, request interception rejecting every URL except the
platform's own asset host, a render timeout, and no filesystem access.

A template that throws or times out falls back to the built-in default and logs.
A till must never be unable to print because someone mistyped a `{{#each}}`.

## Testing

- **View model** — pure function, asserted directly: totals, tax grouping,
  amount in words, a branch with null GSTIN, a line with a price override.
- **Endpoint** — company scoping (one company cannot fetch another's bill),
  content type, non-trivial PDF size.
- **Golden render** — render a fixed sample invoice and assert extracted text
  contains the invoice number, GSTIN and grand total. Asserting on text rather
  than bytes keeps it stable across Chromium versions.
- **Phase 2 sandbox guards** — a template containing `<script>` does not
  execute; a template with an external `<img src="http://...">` issues no
  outbound request; a template that throws yields the default rather than a 500.

## Release note

`expo-print` is a native module, so Phase 1 needs one Android build. It is the
last one this feature requires. Because rendering is server-side, every future
change to the bill — including all of Phase 2 — reaches the shops without an app
update, and fixes to the print button itself ship over the air through EAS
Update.
