import { useReplenishmentSuggestions, useSessionStore } from '@shop/state';
import { CheckCircle2, TruckIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { qty as fmtQty } from '@/lib/utils';

/**
 * Not in the original module map, but the store/warehouse split makes it
 * necessary: a store bills only from its own shelf, so a low shelf standing
 * next to a full warehouse is a stockout waiting to happen. This turns "this
 * shelf is low" into "send this much, from here".
 */
export function ReplenishmentPage() {
  const store = useSessionStore((s) => s.store);
  const { suggestions, isLoading } = useReplenishmentSuggestions();

  const forStore = suggestions.filter((s) => s.storeId === store?.id);
  const blocked = suggestions.filter((s) => s.sourceShort);

  return (
    <>
      <PageHeader
        title="Replenishment"
        description="Store shelves below their reorder level, and the linked warehouse that can cover them."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Lines to send"
          value={String(suggestions.length)}
          tone={suggestions.length ? 'warning' : 'success'}
          icon={TruckIcon}
        />
        <Stat label={`At ${store?.name ?? 'this store'}`} value={String(forStore.length)} />
        <Stat
          label="Warehouse cannot cover"
          value={String(blocked.length)}
          tone={blocked.length ? 'danger' : 'default'}
          hint="Needs purchasing, not transferring"
        />
        <Stat
          label="Units suggested"
          value={fmtQty(suggestions.reduce((sum, s) => sum + s.suggestedQty, 0))}
        />
      </div>

      <Card>
        <CardHeader
          title="Suggestions"
          description="Sorted by how short each shelf is. In-transit stock is already counted."
        />
        {!isLoading && suggestions.length === 0 ? (
          <CardBody className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Every store shelf is at or above its reorder level.
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Store</Th>
                <Th className="text-right">On shelf</Th>
                <Th className="text-right">In transit</Th>
                <Th className="text-right">Target</Th>
                <Th className="text-right">Short by</Th>
                <Th>Send from</Th>
                <Th className="text-right">Suggested</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <EmptyRow colSpan={8}>Working it out…</EmptyRow>
              ) : (
                suggestions.map((s) => (
                  <tr key={`${s.storeId}:${s.skuId}`}>
                    <Td>
                      <p className="font-medium">{s.skuName}</p>
                      <p className="text-xs text-muted-foreground">{s.skuCode}</p>
                    </Td>
                    <Td>{s.storeName}</Td>
                    <Td className="tabular text-right">{fmtQty(s.available)}</Td>
                    <Td className="tabular text-right text-muted-foreground">
                      {s.inbound > 0 ? `+${fmtQty(s.inbound)}` : '—'}
                    </Td>
                    <Td className="tabular text-right text-muted-foreground">{fmtQty(s.target)}</Td>
                    <Td className="tabular text-right font-medium text-destructive">
                      {fmtQty(s.shortfall)}
                    </Td>
                    <Td>
                      {s.sourceLocationName ? (
                        <Badge tone={s.sourceShort ? 'warning' : 'info'}>{s.sourceLocationName}</Badge>
                      ) : (
                        <Badge tone="danger">no linked stock</Badge>
                      )}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {s.suggestedQty > 0 ? fmtQty(s.suggestedQty) : '—'}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>

      {blocked.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Lines marked <em>warning</em> cannot be fully covered by a linked warehouse — those need a
          purchase order, not a transfer.
        </p>
      ) : null}
    </>
  );
}
