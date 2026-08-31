import type { Sku } from '@shop/core';
import { useCategories, useCategoryMap, useProducts, useSkus, useStockOverview, useTaxMap } from '@shop/state';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { money, qty as fmtQty } from '@/lib/utils';

const ALL = '__all__';

/**
 * Browsing beats scanning when there is no barcode gun: pick a category, skim,
 * add. Text search still matches a barcode exactly, so a scanner keeps working
 * without the flow being built around one.
 */
export function ProductPicker({
  storeId,
  storeName,
  inCart,
  onAdd,
}: {
  storeId: string | undefined;
  storeName: string;
  inCart: Set<string>;
  onAdd: (sku: Sku) => void;
}) {
  const products = useProducts();
  const categoryList = useCategories();
  const categoryById = useCategoryMap();
  const skus = useSkus();
  const taxes = useTaxMap();
  const stock = useStockOverview(storeId);

  const [category, setCategory] = useState(ALL);
  const [term, setTerm] = useState('');
  const [inStockOnly, setInStockOnly] = useState(true);

  const productById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data],
  );
  const availableBySku = useMemo(
    () => new Map(stock.rows.map((row) => [row.sku.id, row.level.available])),
    [stock.rows],
  );

  // Straight from the master, already in merchandising order — no longer the
  // accidental set of strings that happened to be typed on products.
  const categories = categoryList.data ?? [];

  const needle = term.trim().toLowerCase();
  const visible = (skus.data ?? []).filter((sku) => {
    const product = productById.get(sku.productId);
    if (category !== ALL && product?.categoryId !== category) return false;
    if (inStockOnly && (availableBySku.get(sku.id) ?? 0) <= 0) return false;
    if (!needle) return true;
    return (
      sku.name.toLowerCase().includes(needle) ||
      sku.code.toLowerCase().includes(needle) ||
      sku.barcode === needle ||
      (product?.name.toLowerCase().includes(needle) ?? false) ||
      (product?.brand?.toLowerCase().includes(needle) ?? false)
    );
  });

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader
        title="Products"
        description={`Selling from ${storeName} — availability and price are that store's`}
        action={<Badge tone="neutral">{visible.length} shown</Badge>}
      />

      <div className="space-y-3 border-b border-border p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-10 pl-9"
            placeholder="Search by product, SKU, brand…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-52" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value={ALL}>All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            In stock only
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <CategoryChip label="All" active={category === ALL} onClick={() => setCategory(ALL)} />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            />
          ))}
        </div>
      </div>

      <div className="grid max-h-[28rem] grid-cols-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
        {visible.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            Nothing matches. Try another category, or untick “In stock only”.
          </p>
        ) : (
          visible.map((sku) => {
            const available = availableBySku.get(sku.id) ?? 0;
            const tax = taxes.get(sku.taxId);
            const added = inCart.has(sku.id);
            return (
              <button
                key={sku.id}
                type="button"
                onClick={() => onAdd(sku)}
                disabled={available <= 0}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-ring hover:bg-muted disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{sku.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoryById.get(productById.get(sku.productId)?.categoryId ?? '')?.name ?? '—'} · {sku.code}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {available > 0 ? `${fmtQty(available)} available` : 'Out of stock'}
                    {tax ? ` · ${tax.name}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-sm font-semibold">{money(sku.sellingPrice)}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                    <Plus className="h-3 w-3" />
                    {added ? 'Add more' : 'Add'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="sm" variant={active ? 'default' : 'outline'} onClick={onClick}>
      {label}
    </Button>
  );
}
