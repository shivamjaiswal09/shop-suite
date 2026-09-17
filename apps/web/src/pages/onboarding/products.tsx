import {
  useCategoryMap,
  useProducts,
  useSessionStore,
  useSkus,
  useTaxes,
  useTaxMap,
  useUnitsOfMeasure,
  useUpdateSku,
} from '@shop/state';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { activeField, EditDialog, type EditTarget } from './edit-dialog';
import { NewSkuDialog } from './new-sku-dialog';
import { money } from '@/lib/utils';

export function ProductsPage() {
  const actor = useSessionStore((s) => s.user);
  const products = useProducts(true);
  const skus = useSkus(true);
  const uoms = useUnitsOfMeasure(true);
  const taxList = useTaxes(true);
  const updateSku = useUpdateSku();
  const taxes = useTaxMap();
  const categories = useCategoryMap();
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const productById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data],
  );
  const uomById = useMemo(() => new Map((uoms.data ?? []).map((u) => [u.id, u])), [uoms.data]);

  const needle = term.trim().toLowerCase();
  const visible = (skus.data ?? []).filter(
    (sku) =>
      !needle ||
      sku.name.toLowerCase().includes(needle) ||
      sku.code.toLowerCase().includes(needle) ||
      (sku.barcode?.includes(needle) ?? false),
  );

  return (
    <>
      <PageHeader
        title="Products & SKUs"
        description={`${products.data?.length ?? 0} products · ${skus.data?.length ?? 0} SKUs · the catalogue every store sells from`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New SKU
          </Button>
        }
      />

      <NewSkuDialog open={creating} onClose={() => setCreating(false)} />

      <Card>
        <div className="border-b border-border p-4">
          <Input
            className="max-w-xs"
            placeholder="Search name, code or barcode…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        <Table>
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th>Barcode</Th>
              <Th>UoM</Th>
              <Th>Tax</Th>
              <Th className="text-right">Purchase</Th>
              <Th className="text-right">Selling</Th>
              <Th className="text-right">Reorder</Th>
              <Th className="text-right">Status</Th>
              <Th className="w-24 text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={11}>No SKUs match.</EmptyRow>
            ) : (
              visible.map((sku) => {
                const product = productById.get(sku.productId);
                return (
                  <tr key={sku.id}>
                    <Td>
                      <p className="font-medium">{sku.name}</p>
                      <p className="text-xs text-muted-foreground">{sku.code}</p>
                    </Td>
                    <Td>
                      <p>{product?.name ?? '—'}</p>
                      {product?.brand ? (
                        <p className="text-xs text-muted-foreground">{product.brand}</p>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge>{categories.get(product?.categoryId ?? '')?.name ?? '—'}</Badge>
                    </Td>
                    <Td className="tabular text-xs text-muted-foreground">
                      <p>{sku.barcode}</p>
                      {sku.hsnCode ? <p>HSN {sku.hsnCode}</p> : null}
                    </Td>
                    <Td>{uomById.get(sku.uomId)?.code ?? '—'}</Td>
                    <Td>{taxes.get(sku.taxId)?.name ?? '—'}</Td>
                    <Td className="tabular text-right text-muted-foreground">{money(sku.purchasePrice)}</Td>
                    <Td className="tabular text-right font-medium">{money(sku.sellingPrice)}</Td>
                    <Td className="tabular text-right text-muted-foreground">{sku.reorderLevel}</Td>
                    <Td className="text-right">
                      <Badge tone={sku.active ? 'success' : 'neutral'}>
                        {sku.active ? 'active' : 'inactive'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            id: sku.id,
                            title: `Edit ${sku.name}`,
                            fields: [
                              { name: 'code', label: 'SKU code', initial: sku.code, required: true },
                              { name: 'barcode', label: 'Barcode', initial: sku.barcode ?? '' },
                              { name: 'hsnCode', label: 'HSN code', initial: sku.hsnCode ?? '' },
                              { name: 'name', label: 'Name', initial: sku.name, required: true, span: 2 },
                              {
                                name: 'uomId',
                                label: 'Unit',
                                type: 'select',
                                initial: sku.uomId,
                                options: (uoms.data ?? []).map((u) => ({ value: u.id, label: u.code })),
                              },
                              {
                                name: 'taxId',
                                label: 'Tax',
                                type: 'select',
                                initial: sku.taxId,
                                options: (taxList.data ?? []).map((t) => ({ value: t.id, label: t.name })),
                              },
                              {
                                name: 'purchasePrice',
                                label: 'Purchase price',
                                initial: String(sku.purchasePrice),
                              },
                              {
                                name: 'sellingPrice',
                                label: 'Selling price',
                                initial: String(sku.sellingPrice),
                              },
                              { name: 'minStock', label: 'Min stock', initial: String(sku.minStock) },
                              {
                                name: 'reorderLevel',
                                label: 'Reorder level',
                                initial: String(sku.reorderLevel),
                              },
                              activeField(sku.active),
                            ],
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>

                      {/* Deliberately a flag, never a row removal. Invoices
                          snapshot the code and name at billing time, so a past
                          bill reads correctly either way — but the stock ledger
                          references this SKU by id, and deleting the row would
                          leave movements pointing at nothing. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={sku.active ? 'text-destructive' : undefined}
                        disabled={!actor || updateSku.isPending}
                        onClick={() =>
                          actor &&
                          updateSku.mutate({
                            id: sku.id,
                            patch: { active: !sku.active },
                            actorId: actor.id,
                          })
                        }
                      >
                        {sku.active ? (
                          <>
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </>
                        ) : (
                          <>
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </>
                        )}
                      </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>

      <EditDialog
        target={editing}
        pending={updateSku.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;
          await updateSku.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              code: v.code,
              barcode: v.barcode,
              // '' clears it, matching how barcode behaves — an HSN typed onto
              // the wrong row has to be removable.
              hsnCode: v.hsnCode ?? null,
              name: v.name,
              uomId: v.uomId,
              taxId: v.taxId,
              purchasePrice: Number(v.purchasePrice) || 0,
              sellingPrice: Number(v.sellingPrice) || 0,
              minStock: Number(v.minStock) || 0,
              reorderLevel: Number(v.reorderLevel) || 0,
              active: v.active === 'true',
            },
          });
        }}
      />
    </>
  );
}
