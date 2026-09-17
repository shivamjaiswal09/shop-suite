import type { BillFieldConfig, Invoice } from '@shop/core';

/**
 * The customer details captured on a bill.
 *
 * The invoice stores answers against the field's key, never its label, so the
 * label is resolved here at display time. That is what lets an admin rename or
 * deactivate a field without rewriting the bills already issued — and why a key
 * with no configuration behind it still shows its value rather than vanishing.
 */
export function CapturedDetails({
  invoice,
  fields,
  className,
}: {
  invoice: Pick<Invoice, 'customerName' | 'customerDetails' | 'billFrom'>;
  fields: BillFieldConfig[];
  className?: string;
}) {
  const entries = Object.entries(invoice.customerDetails ?? {});
  if (!invoice.billFrom && !invoice.customerName && entries.length === 0) return null;

  /**
   * The configured label wins verbatim — capitalising it would quietly rewrite
   * what an admin typed. Only the fallback, built from a raw key, is tidied.
   */
  const labelFor = (key: string): { text: string; fromKey: boolean } => {
    const configured = fields.find((f) => f.key === key)?.label;
    return configured
      ? { text: configured, fromKey: false }
      : { text: key.replace(/_/g, ' '), fromKey: true };
  };

  return (
    <div className={className}>
      {/* From the snapshot, never the master: this is what the bill said when
          it was issued, whatever the entity has been corrected to since. */}
      {invoice.billFrom ? (
        <div className="mb-1.5 border-b border-border pb-1.5">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Billed by</span>
            <span className="truncate font-medium">{invoice.billFrom.legalName}</span>
          </div>
          {(
            [
              ['GSTIN', invoice.billFrom.gstin],
              ['PAN', invoice.billFrom.pan],
              ['Address', invoice.billFrom.addressLine],
              ['Phone', invoice.billFrom.phones.join(', ')],
              ['Email', invoice.billFrom.email],
            ] as const
          )
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="truncate">{value}</span>
              </div>
            ))}
        </div>
      ) : null}
      {invoice.customerName ? (
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Customer</span>
          <span className="truncate font-medium">{invoice.customerName}</span>
        </div>
      ) : null}
      {entries.map(([key, value]) => {
        const label = labelFor(key);
        return (
          <div key={key} className="flex justify-between gap-3 text-sm">
            <span className={`text-muted-foreground${label.fromKey ? ' first-letter:uppercase' : ''}`}>
              {label.text}
            </span>
            <span className="truncate font-medium">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
