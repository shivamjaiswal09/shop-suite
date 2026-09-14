import type { BillFieldConfig } from '../entities/bill-field.ts';

const filled = (value: string | undefined): string => (value ?? '').trim();

/**
 * Routes entered values to the record each one belongs on.
 *
 * The split is the whole point of the feature: a phone number identifies a
 * person and must survive the sale, while a vehicle registration describes one
 * bill and must not be overwritten by the next. Keeping the decision here, as a
 * pure function, is what lets the API and the till agree about it without
 * either owning the rule.
 *
 * Values with no active field behind them are dropped rather than passed
 * through, so a stale form cannot write keys nobody configured.
 */
export function splitBillFields(
  fields: readonly BillFieldConfig[],
  values: Readonly<Record<string, string>>,
): { customer: Record<string, string>; sale: Record<string, string> } {
  const customer: Record<string, string> = {};
  const sale: Record<string, string> = {};

  for (const field of fields) {
    if (!field.active) continue;
    const value = filled(values[field.key]);
    if (!value) continue;
    (field.scope === 'customer' ? customer : sale)[field.key] = value;
  }

  return { customer, sale };
}

/** Required fields with nothing in them. An inactive field can never block. */
export function missingRequiredFields(
  fields: readonly BillFieldConfig[],
  values: Readonly<Record<string, string>>,
): BillFieldConfig[] {
  return fields.filter((field) => field.active && field.required && !filled(values[field.key]));
}
