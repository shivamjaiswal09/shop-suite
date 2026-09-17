import { type BillFieldConfig, gstinProblem } from '@shop/core';
import { Input, Label } from '@/components/ui/input';

/**
 * What to say about a GSTIN that looks wrong, or nothing.
 *
 * Held back until the number is as long as a GSTIN, so the warning arrives
 * when there is enough typed to be wrong rather than at the third character.
 * It never blocks the bill: a wrong-but-plausible GSTIN is the customer's to
 * fix, and stopping a sale at the counter over one helps nobody.
 */
function gstinWarning(field: BillFieldConfig, value: string): string | undefined {
  if (field.builtin !== 'gstin' || value.trim().length < 15) return undefined;
  switch (gstinProblem(value)) {
    case 'format':
      return 'This does not look like a GSTIN.';
    case 'checksum':
      return 'Check this GSTIN — its last character does not match the rest.';
    default:
      return undefined;
  }
}

/**
 * The configured customer details, in the order an admin set.
 *
 * Holds no state of its own: the values live with the rest of the sale on the
 * billing page, so stepping back to the cart and forward again does not lose
 * what was typed.
 */
export function CustomerStep({
  fields,
  values,
  onChange,
  missingKeys,
}: {
  fields: BillFieldConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  missingKeys: ReadonlySet<string>;
}) {
  if (fields.length === 0) {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        No customer details are configured. Add them under Onboarding → Masters → Bill fields, or
        carry on to payment.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.key] ?? '';
        const warning = gstinWarning(field, value);
        return (
          <div key={field.id}>
            <Label htmlFor={`bf-${field.key}`}>{field.label}</Label>
            <Input
              id={`bf-${field.key}`}
              required={field.required}
              inputMode={
                field.type === 'number' ? 'numeric' : field.type === 'phone' ? 'tel' : 'text'
              }
              value={value}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
            {missingKeys.has(field.key) ? (
              <p className="mt-1 text-xs text-destructive">{field.label} is required.</p>
            ) : warning ? (
              // Amber, not destructive: this is worth a second look, not a stop.
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">{warning}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
