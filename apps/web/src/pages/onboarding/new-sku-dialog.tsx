import { subBrandsOf, topLevelBrands } from '@shop/core';
import {
  useBrands,
  useCategories,
  useCategoryMap,
  useCreateProduct,
  useCreateSku,
  useProducts,
  useLocations,
  useSessionStore,
  useTaxes,
  useUnitsOfMeasure,
} from '@shop/state';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

const NEW_PRODUCT = '__new__';

interface FormState {
  productId: string;
  newProductName: string;
  newProductCategoryId: string;
  newProductBrandId: string;
  newProductSubBrandId: string;
  code: string;
  name: string;
  barcode: string;
  hsnCode: string;
  uomId: string;
  taxId: string;
  purchasePrice: string;
  sellingPrice: string;
  minStock: string;
  reorderLevel: string;
  openingQty: string;
  openingLocationId: string;
}

const EMPTY: FormState = {
  productId: NEW_PRODUCT,
  newProductName: '',
  newProductCategoryId: '',
  newProductBrandId: '',
  newProductSubBrandId: '',
  code: '',
  name: '',
  barcode: '',
  hsnCode: '',
  uomId: '',
  taxId: '',
  purchasePrice: '',
  sellingPrice: '',
  minStock: '0',
  reorderLevel: '0',
  openingQty: '0',
  openingLocationId: '',
};

/**
 * Creates a SKU (optionally its parent product too) and seeds opening stock —
 * which appends an `opening` movement rather than writing a stock number.
 */
export function NewSkuDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSessionStore((s) => s.user);
  const store = useSessionStore((s) => s.store);
  const locations = useLocations();
  const products = useProducts();
  const categories = useCategories();
  const categoryById = useCategoryMap();
  const uoms = useUnitsOfMeasure();
  const taxes = useTaxes();
  const brands = useBrands();
  const createProduct = useCreateProduct();
  const createSku = useCreateSku();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // The first real thing the category master buys us: a new SKU inherits the
  // tax its category is normally sold at, instead of whatever sat first in the
  // list. An explicit choice on the form still wins.
  const selectedCategory =
    (categories.data ?? []).find(
      (c) => c.id === (form.productId === NEW_PRODUCT
        ? form.newProductCategoryId || categories.data?.[0]?.id
        : products.data?.find((p) => p.id === form.productId)?.categoryId),
    ) ?? null;
  const suggestedTaxId = selectedCategory?.defaultTaxId ?? taxes.data?.[0]?.id;

  const brandOptions = useMemo(() => topLevelBrands(brands.data ?? []), [brands.data]);
  const subBrandOptions = useMemo(
    () => subBrandsOf(brands.data ?? [], form.newProductBrandId || undefined),
    [brands.data, form.newProductBrandId],
  );
  // HSN classifies the commodity and the tax already carries one, so it is the
  // sensible starting value — but only a starting value, since tyres and tubes
  // share a rate and not a code.
  const suggestedHsn = (taxes.data ?? []).find((t) => t.id === (form.taxId || suggestedTaxId))?.hsnCode ?? '';

  const close = () => {
    setForm(EMPTY);
    setError(null);
    onClose();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setError(null);

    const uomId = form.uomId || uoms.data?.[0]?.id;
    const taxId = form.taxId || suggestedTaxId;
    if (!uomId || !taxId) {
      // A new company has no masters at all, so the honest failure here is
      // "none exist" rather than "not yet arrived". Telling someone to wait for
      // something that will never load is the worst of the two, and naming the
      // master saves them opening Masters to find out which one is missing.
      const loading = uoms.isPending || taxes.isPending;
      const missing = [!uomId && 'a unit of measure', !taxId && 'a tax'].filter(Boolean).join(' and ');
      setError(
        loading
          ? 'Masters are still loading — try again in a moment.'
          : `Every SKU needs ${missing}. Add one under Onboarding → Masters first.`,
      );
      return;
    }

    try {
      let productId = form.productId;
      if (productId === NEW_PRODUCT) {
        const categoryId = form.newProductCategoryId || categories.data?.[0]?.id;
        if (!form.newProductName.trim() || !categoryId) {
          setError('New products need a name and a category.');
          return;
        }
        const product = await createProduct.mutateAsync({
          name: form.newProductName.trim(),
          categoryId,
          brandId: form.newProductBrandId || undefined,
          subBrandId: form.newProductSubBrandId || undefined,
          createdBy: user.id,
        });
        productId = product.id;
      }

      const openingQty = Number(form.openingQty) || 0;
      const openingLocationId = form.openingLocationId || store?.id || '';
      await createSku.mutateAsync({
        productId,
        code: form.code,
        // Blank rather than absent would be stored as '', which the barcode
        // unique index treats as a value — the second unbarcoded SKU would
        // then collide. Absent lets the API store null and the name fall back
        // to the product's.
        name: form.name.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        hsnCode: form.hsnCode.trim() || suggestedHsn || undefined,
        uomId,
        taxId,
        purchasePrice: Number(form.purchasePrice) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        minStock: Number(form.minStock) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        openingStock:
          openingQty > 0 && openingLocationId ? { locationId: openingLocationId, qty: openingQty } : undefined,
        createdBy: user.id,
      });

      close();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const pending = createProduct.isPending || createSku.isPending;

  return (
    <Modal
      open={open}
      title="New SKU"
      description="Stock is tracked per SKU. Opening stock is written as a ledger movement."
      onClose={close}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button form="new-sku-form" type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create SKU'}
          </Button>
        </>
      }
    >
      <form id="new-sku-form" onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <Label htmlFor="product">Product</Label>
          <Select id="product" value={form.productId} onChange={(e) => set('productId', e.target.value)}>
            <option value={NEW_PRODUCT}>+ New product</option>
            {(products.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {categoryById.get(product.categoryId)?.name ?? '—'}
              </option>
            ))}
          </Select>
        </div>

        {form.productId === NEW_PRODUCT ? (
          <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="p-name">Product name</Label>
              <Input
                id="p-name"
                required
                value={form.newProductName}
                onChange={(e) => set('newProductName', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="p-cat">Category</Label>
              <Select
                id="p-cat"
                value={form.newProductCategoryId || categories.data?.[0]?.id || ''}
                onChange={(e) => set('newProductCategoryId', e.target.value)}
              >
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="p-brand">Brand</Label>
              <Select
                id="p-brand"
                value={form.newProductBrandId}
                onChange={(e) => {
                  // Clearing the sub-brand is the point: keeping it would leave
                  // a child of the previous brand attached to the new one, and
                  // the API refuses that pair.
                  set('newProductBrandId', e.target.value);
                  set('newProductSubBrandId', '');
                }}
              >
                <option value="">— none —</option>
                {brandOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="p-subbrand">Sub-brand</Label>
              <Select
                id="p-subbrand"
                value={form.newProductSubBrandId}
                disabled={subBrandOptions.length === 0}
                onChange={(e) => set('newProductSubBrandId', e.target.value)}
              >
                <option value="">
                  {form.newProductBrandId
                    ? subBrandOptions.length === 0
                      ? '— none defined —'
                      : '— none —'
                    : '— pick a brand first —'}
                </option>
                {subBrandOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="code">SKU code</Label>
            <Input
              id="code"
              required
              placeholder="ATT-2KG"
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="hsn">HSN code</Label>
            <Input
              id="hsn"
              className="tabular"
              placeholder={suggestedHsn || '4011'}
              value={form.hsnCode}
              onChange={(e) => set('hsnCode', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="barcode">Barcode</Label>
            <Input
              id="barcode"
              placeholder="8901030101034 (optional)"
              value={form.barcode}
              onChange={(e) => set('barcode', e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="name">SKU name</Label>
          <Input
            id="name"
            placeholder="Defaults to the product name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="uom">Unit of measure</Label>
            <Select
              id="uom"
              value={form.uomId || uoms.data?.[0]?.id || ''}
              onChange={(e) => set('uomId', e.target.value)}
            >
              {(uoms.data ?? []).map((uom) => (
                <option key={uom.id} value={uom.id}>
                  {uom.code} · {uom.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tax">
              Tax
              {!form.taxId && selectedCategory?.defaultTaxId ? (
                <span className="ml-1 font-normal normal-case">
                  · from {selectedCategory.name}
                </span>
              ) : null}
            </Label>
            <Select
              id="tax"
              value={form.taxId || suggestedTaxId || ''}
              onChange={(e) => set('taxId', e.target.value)}
            >
              {(taxes.data ?? []).map((tax) => (
                <option key={tax.id} value={tax.id}>
                  {tax.name} {tax.inclusive ? '(inclusive)' : '(exclusive)'}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="purchase">Purchase price</Label>
            <Input
              id="purchase"
              className="tabular"
              placeholder="0"
              value={form.purchasePrice}
              onChange={(e) => set('purchasePrice', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="selling">Selling price</Label>
            <Input
              id="selling"
              className="tabular"
              placeholder="0"
              value={form.sellingPrice}
              onChange={(e) => set('sellingPrice', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="min">Min stock</Label>
            <Input
              id="min"
              className="tabular"
              value={form.minStock}
              onChange={(e) => set('minStock', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="reorder">Reorder level</Label>
            <Input
              id="reorder"
              className="tabular"
              value={form.reorderLevel}
              onChange={(e) => set('reorderLevel', e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="opening-loc">Opening stock at</Label>
            <Select
              id="opening-loc"
              value={form.openingLocationId || store?.id || ''}
              onChange={(e) => set('openingLocationId', e.target.value)}
            >
              {(locations.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.kind})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="opening">Opening quantity</Label>
            <Input
              id="opening"
              className="tabular"
              value={form.openingQty}
              onChange={(e) => set('openingQty', e.target.value)}
            />
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </form>
    </Modal>
  );
}
