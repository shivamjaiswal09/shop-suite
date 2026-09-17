import type { StockLocation } from '@shop/core';
import { useAggregateStockOverview, useInboundInTransit, type StockRow } from '@shop/state';
import { AlertTriangle, Boxes, IndianRupee, PackageX, SlidersHorizontal, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { StockBadge } from '@/pages/sales/quick-billing';
import { AdjustStockDialog } from './adjust-stock-dialog';
import { money, qty as fmtQty } from '@/lib/utils';

type Filter = 'all' | 'low' | 'out';

/** Sentinel for the "everything in this menu" option. */
const ALL = '__all__';

export interface LocationStockViewProps {
  title: string;
  description: string;
  /** The locations this screen may show, in picker order. */
  locations: StockLocation[];
  /** Label for the combined option, e.g. "All stores". */
  allLabel: string;
  isLoading?: boolean;
  emptyHint?: string;
}

/**
 * One screen shared by Stores, Warehouses and All Inventory. Each owns its own
 * location scope — there is no global location context to disagree with.
 *
 * Picking a single location makes stock actionable (Adjust, in-transit column);
 * the combined option is a read-only rollup, because a quantity spread across
 * locations is not something you can adjust in one place.
 */
export function LocationStockView({
  title,
  description,
  locations,
  allLabel,
  isLoading,
  emptyHint,
}: LocationStockViewProps) {
  const [selectedId, setSelectedId] = useState<string>(ALL);
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adjusting, setAdjusting] = useState<StockRow | null>(null);

  // Default to the single location when there is only one to choose from.
  const effectiveId = locations.length === 1 ? (locations[0]?.id ?? ALL) : selectedId;
  const isAggregate = effectiveId === ALL;
  const selected = locations.find((l) => l.id === effectiveId);

  const scope = useMemo(
    () => (isAggregate ? locations : selected ? [selected] : []),
    [isAggregate, locations, selected],
  );

  const view = useAggregateStockOverview(scope);
  const inbound = useInboundInTransit(isAggregate ? undefined : selected?.id);
  const inboundTotal = [...inbound.values()].reduce((sum, q) => sum + q, 0);

  const needle = term.trim().toLowerCase();
  const visible = view.rows.filter((row) => {
    if (needle && !row.sku.name.toLowerCase().includes(needle) && !row.sku.code.toLowerCase().includes(needle))
      return false;
    if (filter === 'out') return row.alert === 'out_of_stock';
    if (filter === 'low') return row.alert === 'below_min' || row.alert === 'reorder';
    return true;
  });

  const columns = isAggregate ? 8 : 9;

  return (
    <>
      <PageHeader
        title={title}
        description={isAggregate ? description : `${selected?.name ?? ''} · ${selected?.code ?? ''}`}
        actions={
          locations.length > 1 ? (
            <Select
              className="w-64"
              value={effectiveId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value={ALL}>{allLabel}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.code})
                </option>
              ))}
            </Select>
          ) : null
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Products tracked" value={String(view.summary.skuCount)} icon={Boxes} />
        <Stat label="Stock value" value={money(view.summary.stockValue)} icon={IndianRupee} />
        {!isAggregate && inboundTotal > 0 ? (
          <Stat
            label="Inbound in transit"
            value={fmtQty(inboundTotal)}
            hint="Dispatched, not yet received"
            icon={Truck}
            tone="warning"
          />
        ) : (
          <Stat
            label="Low stock"
            value={String(view.summary.lowStock)}
            icon={AlertTriangle}
            tone={view.summary.lowStock ? 'warning' : 'default'}
          />
        )}
        <Stat
          label="Out of stock"
          value={String(view.summary.outOfStock)}
          icon={PackageX}
          tone={view.summary.outOfStock ? 'danger' : 'default'}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <Input
            className="max-w-xs"
            placeholder="Search product code or name…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <Select className="w-40" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">All items</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          {isAggregate && locations.length > 1 ? (
            <span className="text-xs text-muted-foreground">
              Combined across {locations.length} locations — pick one to adjust stock.
            </span>
          ) : null}
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>{isAggregate ? 'Split by location' : 'Barcode'}</Th>
              <Th className="text-right">On hand</Th>
              <Th className="text-right">Reserved</Th>
              {!isAggregate ? <Th className="text-right">In transit</Th> : null}
              <Th className="text-right">Available</Th>
              <Th className="text-right">Value</Th>
              <Th className="text-right">Status</Th>
              {!isAggregate ? <Th className="w-24 text-right">Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {isLoading || view.isLoading ? (
              <EmptyRow colSpan={columns}>Loading…</EmptyRow>
            ) : locations.length === 0 ? (
              <EmptyRow colSpan={columns}>{emptyHint ?? 'No locations available.'}</EmptyRow>
            ) : visible.length === 0 ? (
              <EmptyRow colSpan={columns}>Nothing matches this filter.</EmptyRow>
            ) : (
              visible.map((row) => {
                const inTransit = inbound.get(row.sku.id) ?? 0;
                return (
                  <tr key={row.sku.id}>
                    <Td>
                      <p className="font-medium">{row.sku.name}</p>
                      <p className="text-xs text-muted-foreground">{row.sku.code}</p>
                    </Td>
                    <Td>
                      {isAggregate ? (
                        <div className="flex flex-wrap gap-1">
                          {(row.split ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            row.split!.map((part) => (
                              <Badge key={part.locationId} tone={part.kind === 'store' ? 'info' : 'neutral'}>
                                {part.locationName}: {fmtQty(part.available)}
                              </Badge>
                            ))
                          )}
                        </div>
                      ) : (
                        <span className="tabular text-xs text-muted-foreground">{row.sku.barcode}</span>
                      )}
                    </Td>
                    <Td className="tabular text-right">{fmtQty(row.level.onHand)}</Td>
                    <Td className="tabular text-right text-muted-foreground">
                      {fmtQty(row.level.reserved)}
                    </Td>
                    {!isAggregate ? (
                      <Td className="tabular text-right">
                        {inTransit > 0 ? (
                          <span className="text-warning">+{fmtQty(inTransit)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                    ) : null}
                    <Td className="tabular text-right font-semibold">{fmtQty(row.level.available)}</Td>
                    <Td className="tabular text-right">{money(row.level.value)}</Td>
                    <Td className="text-right">
                      <StockBadge alert={row.alert} />
                    </Td>
                    {!isAggregate ? (
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setAdjusting(row)}>
                          <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                        </Button>
                      </Td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>

      <AdjustStockDialog
        row={adjusting}
        location={selected ?? null}
        onClose={() => setAdjusting(null)}
      />
    </>
  );
}
