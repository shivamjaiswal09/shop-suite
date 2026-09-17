import { subBrandsOf, topLevelBrands } from '@shop/core';
import {
  useBrands,
  useCategories,
  useCategoryMap,
  useProducts,
  useSessionStore,
  useSkus,
  useTaxes,
  useTaxMap,
  useUnitsOfMeasure,
  useUpdateProduct,
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
  const updateProduct = useUpdateProduct();
  const brands = useBrands(true);
  const categoryList = useCategories(true);
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
  /** How many SKUs hang off each product, so the edit form can warn about reach. */
  const skusPerProduct = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sku of skus.data ?? []) {
      counts.set(sku.productId, (counts.get(sku.productId) ?? 0) + 1);
    }
    return counts;
  }, [skus.data]);

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
        title="Products"
        description={`${skus.data?.length ?? 0} products · the catalogue every store sells from`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New product
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
              <EmptyRow colSpan={10}>No products match.</EmptyRow>
            ) : (
              visible.map((sku) => {
                const product = productById.get(sku.productId);
                return (
                  <tr key={sku.id}>
                    <Td>
                      {/* One name. The product's, not the item's — they are the
                          same thing now, and the code below identifies the row
                          where two products were onboarded under one name. */}
                      <p className="font-medium">{product?.name ?? sku.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sku.code}
                        {product?.brand ? ` · ${product.brand}` : ''}
                      </p>
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
                              { name: 'code', label: 'Product code', initial: sku.code, required: true },
                              { name: 'barcode', label: 'Barcode', initial: sku.barcode ?? '' },
                              { name: 'hsnCode', label: 'HSN code', initial: sku.hsnCode ?? '' },

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
                              // Brand, sub-brand, category and product name live
                              // on the parent Product, not the SKU. Every unique
                              // combination is onboarded as its own product here,
                              // so editing them together is the only way that
                              // matches how they were entered.
                              {
                                name: 'productName',
                                // Says so when the product is shared. Brand,
                                // category and name belong to the product, so
                                // changing them here changes every SKU under it
                                // — silently, if the form does not admit it.
                                label:
                                  skusPerProduct.get(sku.productId)! > 1
                                    ? `Name (shared by ${skusPerProduct.get(sku.productId)} products)`
                                    : 'Name',
                                initial: product?.name ?? '',
                                span: 2,
                              },
                              {
                                name: 'categoryId',
                                label: 'Category',
                                type: 'select',
                                initial: product?.categoryId ?? '',
                                options: (categoryList.data ?? []).map((c) => ({
                                  value: c.id,
                                  label: c.name,
                                })),
                              },
                              {
                                name: 'brandId',
                                label: 'Brand',
                                type: 'select',
                                initial: product?.brandId ?? '',
                                options: [
                                  { value: '', label: '— none —' },
                                  ...topLevelBrands(brands.data ?? []).map((b) => ({
                                    value: b.id,
                                    label: b.name,
                                  })),
                                ],
                              },
                              {
                                name: 'subBrandId',
                                label: 'Sub-brand',
                                type: 'select',
                                initial: product?.subBrandId ?? '',
                                // Narrowed by the brand chosen above, and cleared
                                // if the brand changes out from under it.
                                optionsFor: (values) => [
                                  { value: '', label: '— none —' },
                                  ...subBrandsOf(brands.data ?? [], values.brandId || undefined).map(
                                    (b) => ({ value: b.id, label: b.name }),
                                  ),
                                ],
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
        pending={updateSku.isPending || updateProduct.isPending}
        onClose={() => setEditing(null)}
        onSubmit={async (id, v) => {
          if (!actor) return;

          // The product first. If the brand pair is rejected the SKU is left
          // untouched, so a failed save does not half-apply — and the API
          // validates brand against sub-brand, which is the check that fails.
          const productId = (skus.data ?? []).find((s) => s.id === id)?.productId;
          if (productId) {
            await updateProduct.mutateAsync({
              id: productId,
              actorId: actor.id,
              patch: {
                name: v.productName,
                categoryId: v.categoryId,
                // '' clears it: a product mis-assigned to a brand has to be
                // detachable, and the API reads null as "clear".
                brandId: v.brandId || null,
                subBrandId: v.subBrandId || null,
              },
            });
          }

          await updateSku.mutateAsync({
            id,
            actorId: actor.id,
            patch: {
              code: v.code,
              barcode: v.barcode,
              // '' clears it, matching how barcode behaves — an HSN typed onto
              // the wrong row has to be removable. Coerced here rather than
              // passed through: the field yields '' when blank, which is
              // neither a code nor an instruction to clear.
              hsnCode: v.hsnCode?.trim() || null,
              // The same name on both rows. They are one thing in the UI, so
              // letting them differ would only reintroduce the second level by
              // the back door — and the invoice line snapshots this one.
              name: v.productName,
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
