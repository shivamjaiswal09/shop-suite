import type { BillFieldConfig } from '@shop/core';
import { Input, Label } from '@/components/ui/input';

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
      {fields.map((field) => (
        <div key={field.id}>
          <Label htmlFor={`bf-${field.key}`}>{field.label}</Label>
          <Input
            id={`bf-${field.key}`}
            required={field.required}
            inputMode={field.type === 'number' ? 'numeric' : field.type === 'phone' ? 'tel' : 'text'}
            value={values[field.key] ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
          {missingKeys.has(field.key) ? (
            <p className="mt-1 text-xs text-destructive">{field.label} is required.</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
