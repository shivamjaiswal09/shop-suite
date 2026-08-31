import { convertPriceBasis, type PriceBasis, type SaleLine, type Tax } from '@shop/core';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money } from '@/lib/utils';

/**
 * Lets the cashier type the price on either side of tax and computes the other.
 *
 * The typed figure is held as a string while focused, so a half-typed "1" in
 * "12.50" does not get rounded out from under the cursor.
 */
export function PriceEditor({
  line,
  tax,
  overridden,
  onChange,
  onReset,
}: {
  line: SaleLine;
  tax: Pick<Tax, 'rate'> | undefined;
  overridden: boolean;
  onChange: (price: number, basis: PriceBasis) => void;
  onReset: () => void;
}) {
  const rate = tax?.rate ?? line.taxRate;
  const [basis, setBasis] = useState<PriceBasis>('inclusive');
  const [draft, setDraft] = useState<string | null>(null);

  // Per-unit figures, derived from the line so they always agree with the total.
  const unitTaxable = line.qty > 0 ? line.taxableValue / line.qty : 0;
  const unitInclusive = line.qty > 0 ? line.lineTotal / line.qty : 0;
  const shown = basis === 'inclusive' ? unitInclusive : unitTaxable;

  useEffect(() => setDraft(null), [line.id, basis]);

  const commit = (raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    onChange(value, basis);
  };

  const other = convertPriceBasis(
    Number(draft ?? shown) || 0,
    basis,
    basis === 'inclusive' ? 'exclusive' : 'inclusive',
    rate,
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end gap-1">
        <div className="flex overflow-hidden rounded-md border border-border">
          {(['exclusive', 'inclusive'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBasis(option)}
              className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                basis === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {option === 'exclusive' ? 'pre-tax' : 'incl. tax'}
            </button>
          ))}
        </div>
        <Input
          className="tabular h-7 w-24 text-right"
          value={draft ?? shown.toFixed(2)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            commit(e.target.value);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {overridden ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Back to the SKU's own price"
            onClick={onReset}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        ) : null}
      </div>

      <p className="text-right text-[11px] text-muted-foreground">
        {basis === 'inclusive' ? 'pre-tax' : 'incl. tax'} {money(other)} @ {rate}%
        {overridden ? <span className="ml-1 text-warning">· edited</span> : null}
      </p>
    </div>
  );
}
