import type { StockLocation, StockMovementType } from '@shop/core';
import type { NewMovement } from '@shop/data';
import { usePostMovements, useReasonCodes, useSessionStore, type StockRow } from '@shop/state';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { qty as fmtQty } from '@/lib/utils';

type Mode = 'count' | 'adjustment' | 'damage' | 'opening';

const MODES: {
  value: Mode;
  label: string;
  hint: string;
  movementType: StockMovementType;
  refType: NewMovement['refType'];
  reasonUsage: 'adjustment' | 'damage';
}[] = [
  {
    value: 'count',
    label: 'Stock count correction',
    hint: 'Enter the counted quantity — the delta is written to the ledger.',
    movementType: 'adjustment',
    refType: 'stock_count',
    reasonUsage: 'adjustment',
  },
  {
    value: 'adjustment',
    label: 'Manual adjustment',
    hint: 'Signed quantity: 5 adds, −5 removes.',
    movementType: 'adjustment',
    refType: 'adjustment',
    reasonUsage: 'adjustment',
  },
  {
    value: 'damage',
    label: 'Damage / write-off',
    hint: 'Removes from on-hand and tallies as damaged.',
    movementType: 'damage',
    refType: 'adjustment',
    reasonUsage: 'damage',
  },
  {
    value: 'opening',
    label: 'Opening stock',
    hint: 'Seeds a starting balance for this product at this location.',
    movementType: 'opening',
    refType: 'opening',
    reasonUsage: 'adjustment',
  },
];

/**
 * The only way stock ever changes outside billing: append a movement. There is
 * no "set quantity" write anywhere in the system, so a physical count becomes a
 * signed delta the ledger can explain.
 */
export function AdjustStockDialog({
  row,
  location,
  onClose,
}: {
  row: StockRow | null;
  /** The location whose stock this row is showing. */
  location: StockLocation | null;
  onClose: () => void;
}) {
  const user = useSessionStore((s) => s.user);
  const post = usePostMovements();

  const [mode, setMode] = useState<Mode>('count');
  const [value, setValue] = useState('');
  const [reasonCodeId, setReasonCodeId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const config = MODES.find((m) => m.value === mode)!;
  const reasons = useReasonCodes(config.reasonUsage);

  const onHand = row?.level.onHand ?? 0;
  const parsed = Number(value);
  const delta = mode === 'count' ? Math.round((parsed - onHand) * 1000) / 1000 : parsed;
  /** What the ledger will actually record, once direction is applied. */
  const effectiveDelta = config.movementType === 'damage' ? -Math.abs(parsed) : delta;

  const close = () => {
    setMode('count');
    setValue('');
    setReasonCodeId('');
    setNote('');
    setError(null);
    onClose();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!row || !user || !location) return;
    setError(null);

    if (!Number.isFinite(parsed)) {
      setError('Enter a quantity.');
      return;
    }
    if (delta === 0) {
      setError('That leaves stock unchanged — nothing to record.');
      return;
    }
    if (mode !== 'adjustment' && mode !== 'count' && parsed <= 0) {
      setError('Quantity must be positive.');
      return;
    }
    if (config.movementType === 'damage' && parsed > row.level.available) {
      setError(`Only ${fmtQty(row.level.available)} available to write off.`);
      return;
    }
    if (onHand + effectiveDelta < 0) {
      setError(`That would take on-hand below zero (currently ${fmtQty(onHand)}).`);
      return;
    }

    try {
      await post.mutateAsync([
        {
          skuId: row.sku.id,
          locationId: location.id,
          type: config.movementType,
          qty: mode === 'count' || mode === 'adjustment' ? delta : parsed,
          refType: config.refType,
          refId: `${mode}-${row.sku.code}`,
          reasonCodeId: reasonCodeId || undefined,
          unitCost: config.movementType === 'opening' ? row.sku.purchasePrice : undefined,
          note: note || undefined,
          createdBy: user.id,
        },
      ]);
      close();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  if (!row || !location) return null;

  return (
    <Modal
      open
      title={`Adjust stock · ${row.sku.name}`}
      description={`${location.name} · ${row.sku.code} · on hand ${fmtQty(onHand)} · available ${fmtQty(row.level.available)}`}
      onClose={close}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={post.isPending}>
            Cancel
          </Button>
          <Button form="adjust-form" type="submit" disabled={post.isPending}>
            {post.isPending ? 'Posting…' : 'Post movement'}
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <Label htmlFor="mode">Movement</Label>
          <Select
            id="mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setReasonCodeId('');
              setError(null);
            }}
          >
            {MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{config.hint}</p>
        </div>

        <div>
          <Label htmlFor="qty">{mode === 'count' ? 'Counted quantity' : 'Quantity'}</Label>
          <Input
            id="qty"
            className="tabular"
            autoFocus
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {Number.isFinite(parsed) && value !== '' ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Ledger entry:{' '}
              <span className={effectiveDelta >= 0 ? 'text-success' : 'text-destructive'}>
                {effectiveDelta > 0 ? '+' : ''}
                {fmtQty(effectiveDelta)}
              </span>{' '}
              → on hand becomes <span className="font-medium">{fmtQty(onHand + effectiveDelta)}</span>
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="reason">Reason code</Label>
          <Select id="reason" value={reasonCodeId} onChange={(e) => setReasonCodeId(e.target.value)}>
            <option value="">— none —</option>
            {(reasons.data ?? []).map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.code} · {reason.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="note">Note</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </form>
    </Modal>
  );
}
