import type { StockMovementType } from '@shop/core';
import { useLocations, useMovements, useSkus } from '@shop/state';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { qty as fmtQty, shortDateTime } from '@/lib/utils';

const TYPES: (StockMovementType | 'all')[] = [
  'all',
  'opening',
  'receipt',
  'sale',
  'sale_return',
  'transfer_in',
  'transfer_out',
  'adjustment',
  'damage',
];

export function MovementsPage() {
  const locations = useLocations();
  const [locationId, setLocationId] = useState<string>('');
  const [type, setType] = useState<StockMovementType | 'all'>('all');
  const skus = useSkus();

  const movements = useMovements({
    locationId: locationId || undefined,
    type: type === 'all' ? undefined : type,
    limit: 200,
  });

  const skuById = useMemo(() => new Map((skus.data ?? []).map((s) => [s.id, s])), [skus.data]);

  return (
    <>
      <PageHeader
        title="Stock Movements"
        description="The append-only ledger every stock number is folded from."
        actions={
          <>
          <Select
            className="w-56"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">All locations</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.kind})
              </option>
            ))}
          </Select>
          <Select
            className="w-44"
            value={type}
            onChange={(e) => setType(e.target.value as StockMovementType | 'all')}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All types' : t.replace('_', ' ')}
              </option>
            ))}
          </Select>
          </>
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>SKU</Th>
              <Th>Type</Th>
              <Th className="text-right">Qty</Th>
              <Th>Reference</Th>
              <Th className="text-right">Unit cost</Th>
            </tr>
          </thead>
          <tbody>
            {movements.isLoading ? (
              <EmptyRow colSpan={6}>Loading…</EmptyRow>
            ) : (movements.data ?? []).length === 0 ? (
              <EmptyRow colSpan={6}>No movements recorded.</EmptyRow>
            ) : (
              movements.data!.map((movement) => (
                <tr key={movement.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {shortDateTime(movement.createdAt)}
                  </Td>
                  <Td>
                    <p className="font-medium">{skuById.get(movement.skuId)?.name ?? movement.skuId}</p>
                    <p className="text-xs text-muted-foreground">
                      {skuById.get(movement.skuId)?.code ?? ''}
                    </p>
                  </Td>
                  <Td>
                    <Badge tone={movement.qty >= 0 ? 'success' : 'danger'}>
                      {movement.type.replace('_', ' ')}
                    </Badge>
                  </Td>
                  <Td
                    className={`tabular text-right font-medium ${
                      movement.qty >= 0 ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {movement.qty > 0 ? '+' : ''}
                    {fmtQty(movement.qty)}
                  </Td>
                  <Td className="text-xs text-muted-foreground">
                    {movement.refType} · {movement.refId}
                  </Td>
                  <Td className="tabular text-right text-muted-foreground">
                    {movement.unitCost !== undefined ? movement.unitCost.toFixed(2) : '—'}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
