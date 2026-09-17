import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

export interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox' | 'email';
  options?: { value: string; label: string }[];
  /**
   * Options that depend on what is currently entered — a sub-brand list
   * narrowed by the chosen brand. Takes precedence over `options`.
   *
   * A value no longer in the list is treated as unset, so changing the brand
   * cannot leave a sub-brand from the old one silently selected and submitted.
   */
  optionsFor?: (values: FormValues) => { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  initial?: string;
  /** Grid width in a 4-column row. */
  span?: 1 | 2 | 3 | 4;
}

export type FormValues = Record<string, string>;

const initialValues = (fields: FormField[]): FormValues =>
  Object.fromEntries(
    fields.map((f) => [f.name, f.initial ?? (f.type === 'checkbox' ? 'false' : '')]),
  );

/**
 * One spec-driven form behind every onboarding create. Keeping a single
 * implementation is what stops eight near-identical forms drifting apart.
 */
export function RecordForm({
  fields,
  submitLabel,
  pending,
  resetOnSuccess = true,
  onSubmit,
}: {
  fields: FormField[];
  submitLabel: string;
  pending?: boolean;
  /** Create forms clear themselves; edit forms keep what you typed. */
  resetOnSuccess?: boolean;
  /** Throw to surface a message — the form keeps the entered values. */
  onSubmit: (values: FormValues) => Promise<void> | void;
}) {
  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [error, setError] = useState<string | null>(null);

  const set = (name: string, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  const optionsOf = (field: FormField) =>
    field.optionsFor ? field.optionsFor(values) : (field.options ?? []);

  /**
   * What the form actually holds, after dependent selects have dropped any
   * value their current options no longer offer.
   */
  const resolved: FormValues = { ...values };
  for (const field of fields) {
    if (field.type !== 'select' || !field.optionsFor) continue;
    const current = values[field.name] ?? '';
    if (current && !optionsOf(field).some((option) => option.value === current)) {
      resolved[field.name] = '';
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit(resolved);
      if (resetOnSuccess) setValues(initialValues(fields));
    } catch (cause) {
      // Deliberately keep `values` — retyping a rejected form is miserable.
      setError(readable((cause as Error).message));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {fields.map((field) => (
          <div key={field.name} className={spanClass(field.span)}>
            <Label htmlFor={field.name}>{field.label}</Label>
            {field.type === 'select' ? (
              <Select
                id={field.name}
                value={resolved[field.name] ?? ''}
                onChange={(e) => set(field.name, e.target.value)}
              >
                {optionsOf(field).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : field.type === 'checkbox' ? (
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  id={field.name}
                  type="checkbox"
                  checked={values[field.name] === 'true'}
                  onChange={(e) => set(field.name, String(e.target.checked))}
                />
                <span className="text-muted-foreground">yes</span>
              </label>
            ) : (
              <Input
                id={field.name}
                required={field.required}
                placeholder={field.placeholder}
                value={values[field.name] ?? ''}
                onChange={(e) => set(field.name, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}

/**
 * Zod stringifies a failure as its raw issue array, which reached the screen as
 * a wall of JSON. Nobody can act on that; the issue's own message and field can
 * be read at a glance.
 */
function readable(message: string): string {
  if (!message.trimStart().startsWith('[')) return message;
  try {
    const issues = JSON.parse(message) as { message?: string; path?: (string | number)[] }[];
    const lines = issues
      .filter((issue) => issue?.message)
      .map((issue) => (issue.path?.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message!));
    return lines.length > 0 ? lines.join('; ') : message;
  } catch {
    return message;
  }
}

const spanClass = (span?: 1 | 2 | 3 | 4) =>
  span === 4 ? 'sm:col-span-4' : span === 3 ? 'sm:col-span-3' : span === 2 ? 'sm:col-span-2' : '';
