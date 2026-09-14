import type { Invoice, Sku } from '@shop/core';
import { missingRequiredFields, splitBillFields } from '@shop/core';
import {
  useCartPricing,
  useCartIsForeign,
  useCartStore,
  useBillFields,
  useCheckout,
  useCreateOrder,
  useCustomerByPhone,
  usePaymentMethods,
  useSessionStore,
  useStockOverview,
  useTaxMap,
  type Tender,
} from '@shop/state';
import { Minus, Plus, Receipt, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CustomerStep } from './customer-step';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyRow, Table, Td, Th } from '@/components/ui/table';
import { PriceEditor } from './price-editor';
import { ProductPicker } from './product-picker';
import { cn, money, qty as fmtQty, shortTime } from '@/lib/utils';

export function QuickBillingPage() {
  const store = useSessionStore((s) => s.store);
  const user = useSessionStore((s) => s.user);
  const counterId = useSessionStore((s) => s.counterId);

  const cart = useCartStore();
  const { lines, totals, taxRows } = useCartPricing();
  const taxes = useTaxMap();
  const paymentMethods = usePaymentMethods();
  const checkout = useCheckout();
  const createOrder = useCreateOrder();
  const stock = useStockOverview(store?.id);
  const cartIsForeign = useCartIsForeign(store?.id);

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  const availableFor = useMemo(
    () => new Map(stock.rows.map((row) => [row.sku.id, row.level.available])),
    [stock.rows],
  );
  const inCart = useMemo(() => new Set(cart.lines.map((l) => l.sku.id)), [cart.lines]);

  const addSku = (sku: Sku) => cart.addSku(sku, 1, store?.id);

  /* ------------------------------------------------------------ the wizard */

  const billFields = useBillFields();
  const [step, setStep] = useState<'cart' | 'customer' | 'payment'>('cart');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showMissing, setShowMissing] = useState(false);

  const activeFields = useMemo(() => billFields.data ?? [], [billFields.data]);
  const missing = missingRequiredFields(activeFields, fieldValues);
  const missingKeys = new Set(showMissing ? missing.map((f) => f.key) : []);

  // Recognising a returning customer is the point of a customer-scope field:
  // the counter types a phone it has seen before and the rest fills itself.
  const known = useCustomerByPhone(fieldValues.phone);
  useEffect(() => {
    const found = known.data;
    if (!found) return;
    // Fills blanks only. A cashier correcting a stale name must not have the
    // stored one typed back over them on the next render.
    setFieldValues((prev) => ({
      ...prev,
      name: prev.name || found.name,
      email: prev.email || found.email || '',
      gstin: prev.gstin || found.gstin || '',
      addressLine: prev.addressLine || found.addressLine || '',
    }));
  }, [known.data]);

  /**
   * One row set behind both cart renderings. A phone gets stacked cards and a
   * desk gets the table, and computing this twice is how the two would come to
   * disagree about a price or an oversell warning.
   */
  const cartRows = useMemo(
    () =>
      cart.lines.flatMap((line) => {
        const priced = lines.find((l) => l.id === line.lineId);
        if (!priced) return [];
        const available = availableFor.get(line.sku.id);
        return [{
          line,
          priced,
          available,
          overselling: available !== undefined && line.qty > available,
        }];
      }),
    [cart.lines, lines, availableFor],
  );

  const dueAmount = Math.max(
    Math.round((totals.grandTotal - tenders.reduce((sum, t) => sum + t.amount, 0)) * 100) / 100,
    0,
  );
  const defaultMethodId = paymentMethods.data?.[0]?.id ?? '';

  const saleLines = () =>
    cart.lines.map((l) => ({
      skuId: l.sku.id,
      qty: l.qty,
      discount: l.discount,
      unitPriceOverride: l.unitPriceOverride,
      overrideBasis: l.overrideBasis,
    }));

  const onBill = async () => {
    if (!store || !user || lines.length === 0) return;
    // Last line of defence: these lines were priced against another store's
    // shelf, so billing them here would take the wrong stock and the wrong money.
    if (cartIsForeign) return;
    const split = splitBillFields(activeFields, fieldValues);
    const result = await checkout.mutateAsync({
      storeId: store.id,
      counterId,
      customerId: cart.customerId,
      // The configured name wins; the cart's own stays as the fallback for a
      // company that has configured nothing, which is the old behaviour.
      customerName: split.customer.name ?? cart.customerName,
      customerFields: split.customer,
      customerDetails: split.sale,
      lines: saleLines(),
      tenders: tenders.filter((t) => t.amount > 0),
      createdBy: user.id,
    });
    setLastInvoice(result.invoice);
    cart.clear();
    setTenders([]);
    setFieldValues({});
    setShowMissing(false);
    setStep('cart');
  };

  const onReserve = async () => {
    if (!store || !user || cart.lines.length === 0) return;
    await createOrder.mutateAsync({
      storeId: store.id,
      customerId: cart.customerId,
      lines: saleLines(),
      createdBy: user.id,
    });
    cart.clear();
    setTenders([]);
  };

  return (
    <>
      <PageHeader
        title="Quick Billing"
        description={`Counter ${counterId} · ${store?.name ?? ''} · selling from its own shelf`}
        actions={
          cart.lines.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => cart.clear()}>
              <Trash2 className="h-3.5 w-3.5" /> Clear cart
            </Button>
          ) : null
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {step === 'cart' ? (
          <>
          <ProductPicker
            storeId={store?.id}
            storeName={store?.name ?? '—'}
            inCart={inCart}
            onAdd={addSku}
          />

          <Card>
            <CardHeader
              title="Cart"
              description="Prices come from the SKU. Edit either side of tax and the rest recomputes."
            />
            {/* A phone gets the cart as cards. The table is seven columns wide and
                would scroll sideways to reach the quantity stepper — the control
                a cashier touches most. */}
            <div className="divide-y divide-border lg:hidden">
              {cartRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Pick a product above to start billing.
                </p>
              ) : (
                cartRows.map(({ line, priced, available, overselling }) => (
                  <div key={line.lineId} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{line.sku.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.sku.code}
                          {available !== undefined ? ` \u00b7 ${fmtQty(available)} available` : ''}
                        </p>
                        {overselling ? (
                          <Badge tone="danger" className="mt-1">
                            Exceeds available stock
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${line.sku.name}`}
                        onClick={() => cart.remove(line.lineId)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Reduce quantity"
                          onClick={() => cart.setQty(line.lineId, line.qty - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <Input
                          className="tabular w-16 text-center"
                          aria-label={`Quantity of ${line.sku.name}`}
                          value={line.qty}
                          onChange={(e) => cart.setQty(line.lineId, Number(e.target.value) || 0)}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Increase quantity"
                          onClick={() => cart.setQty(line.lineId, line.qty + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <span className="tabular text-base font-semibold">{money(priced.lineTotal)}</span>
                    </div>

                    <PriceEditor
                      line={priced}
                      tax={taxes.get(line.sku.taxId)}
                      overridden={line.unitPriceOverride !== undefined}
                      align="between"
                      onChange={(price, basis) => cart.setUnitPrice(line.lineId, price, basis)}
                      onReset={() => cart.clearUnitPrice(line.lineId)}
                    />

                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Taxable {money(priced.taxableValue)}</span>
                      <span>
                        Tax {money(priced.taxAmount)} @ {priced.taxRate}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden lg:block">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="w-32 text-center">Qty</Th>
                  <Th className="w-52 text-right">Unit price</Th>
                  <Th className="w-28 text-right">Taxable</Th>
                  <Th className="w-28 text-right">Tax</Th>
                  <Th className="w-28 text-right">Total</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {cartRows.length === 0 ? (
                  <EmptyRow colSpan={7}>Pick a product above to start billing.</EmptyRow>
                ) : (
                  cartRows.map(({ line, priced, available, overselling }) => {
                    return (
                      <tr key={line.lineId}>
                        <Td>
                          <p className="font-medium">{line.sku.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.sku.code}
                            {available !== undefined ? ` · ${fmtQty(available)} available` : ''}
                          </p>
                          {overselling ? (
                            <Badge tone="danger" className="mt-1">
                              Exceeds available stock
                            </Badge>
                          ) : null}
                        </Td>
                        <Td>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => cart.setQty(line.lineId, line.qty - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              className="tabular h-7 w-14 text-center"
                              value={line.qty}
                              onChange={(e) => cart.setQty(line.lineId, Number(e.target.value) || 0)}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => cart.setQty(line.lineId, line.qty + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </Td>
                        <Td>
                          <PriceEditor
                            line={priced}
                            tax={taxes.get(line.sku.taxId)}
                            overridden={line.unitPriceOverride !== undefined}
                            onChange={(price, basis) => cart.setUnitPrice(line.lineId, price, basis)}
                            onReset={() => cart.clearUnitPrice(line.lineId)}
                          />
                        </Td>
                        <Td className="tabular text-right">{money(priced.taxableValue)}</Td>
                        <Td className="tabular text-right text-muted-foreground">
                          {money(priced.taxAmount)}
                          <span className="block text-[11px]">@ {priced.taxRate}%</span>
                        </Td>
                        <Td className="tabular text-right font-medium">{money(priced.lineTotal)}</Td>
                        <Td>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => cart.remove(line.lineId)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
            </div>
          </Card>
          </>
          ) : null}

          {step === 'cart' ? (
            <Button
              className="w-full"
              disabled={cart.lines.length === 0}
              onClick={() => setStep('customer')}
            >
              Continue to customer
            </Button>
          ) : null}

          {step === 'customer' ? (
            <Card>
              <CardHeader title="Customer" description="Recorded against this bill." />
              <CardBody className="space-y-4">
                <CustomerStep
                  fields={activeFields}
                  values={fieldValues}
                  missingKeys={missingKeys}
                  onChange={(key, value) =>
                    setFieldValues((prev) => ({ ...prev, [key]: value }))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setStep('cart')}>
                    Back to cart
                  </Button>
                  <Button
                    onClick={() => {
                      // Revealed only on an attempt, so the form does not open
                      // covered in errors for fields nobody has had a chance to
                      // fill in yet.
                      setShowMissing(true);
                      if (missingRequiredFields(activeFields, fieldValues).length === 0) {
                        setStep('payment');
                      }
                    }}
                  >
                    Continue to payment
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Bill summary" />
            <CardBody className="space-y-3">
              <div className="space-y-1.5 text-sm">
                <Row label="Sub total" value={money(totals.subTotal)} />
                <Row label="Discount" value={`− ${money(totals.discountTotal)}`} muted />
                <Row label="Taxable value" value={money(totals.taxableValue)} />
              </div>

              {taxRows.length > 0 ? (
                <div className="rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-2 py-1.5 text-left font-medium">Tax</th>
                        <th className="px-2 py-1.5 text-right font-medium">Taxable</th>
                        <th className="px-2 py-1.5 text-right font-medium">CGST</th>
                        <th className="px-2 py-1.5 text-right font-medium">SGST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxRows.map((row) => (
                        <tr key={row.rate} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5">{row.rate}%</td>
                          <td className="tabular px-2 py-1.5 text-right">{money(row.taxableValue)}</td>
                          <td className="tabular px-2 py-1.5 text-right">{money(row.cgst)}</td>
                          <td className="tabular px-2 py-1.5 text-right">{money(row.sgst)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="space-y-1.5 text-sm">
                <Row label="Total tax" value={money(totals.taxTotal)} />
                <Row label="Round off" value={money(totals.roundOff)} muted />
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                  <span>Grand total</span>
                  <span className="tabular">{money(totals.grandTotal)}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="customer">Customer</Label>
                <Input
                  id="customer"
                  placeholder="Walk-in Customer"
                  value={cart.customerName ?? ''}
                  onChange={(e) => cart.setCustomer({ name: e.target.value || undefined })}
                />
              </div>
            </CardBody>
          </Card>

          {step === 'payment' ? (
          <Card>
            <CardHeader title="Payment" description="Split across tenders if needed." />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(paymentMethods.data ?? []).map((method) => (
                  <Button
                    key={method.id}
                    variant="outline"
                    size="sm"
                    disabled={totals.grandTotal <= 0}
                    onClick={() => setTenders([{ paymentMethodId: method.id, amount: totals.grandTotal }])}
                  >
                    {method.name} · full
                  </Button>
                ))}
              </div>

              {tenders.map((tender, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={tender.paymentMethodId}
                    onChange={(e) =>
                      setTenders((prev) =>
                        prev.map((t, i) => (i === index ? { ...t, paymentMethodId: e.target.value } : t)),
                      )
                    }
                  >
                    {(paymentMethods.data ?? []).map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="tabular w-28 text-right"
                    value={tender.amount}
                    onChange={(e) =>
                      setTenders((prev) =>
                        prev.map((t, i) => (i === index ? { ...t, amount: Number(e.target.value) || 0 } : t)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTenders((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() =>
                    defaultMethodId &&
                    setTenders((prev) => [...prev, { paymentMethodId: defaultMethodId, amount: dueAmount }])
                  }
                >
                  + Add tender
                </button>
                <span className="tabular">Due: {money(dueAmount)}</span>
              </div>

              {cartIsForeign ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  This cart was priced at a different store. Clear it, or switch back, before billing.
                </p>
              ) : null}

              {checkout.error ? (
                <p className="text-xs text-destructive">{(checkout.error as Error).message}</p>
              ) : null}

              <Button
                className="w-full"
                size="lg"
                disabled={cart.lines.length === 0 || checkout.isPending || cartIsForeign}
                onClick={() => void onBill()}
              >
                <Receipt className="h-4 w-4" />
                {checkout.isPending
                  ? 'Billing…'
                  : tenders.length === 0
                    ? `Bill ${money(totals.grandTotal)} — unpaid`
                    : `Bill ${money(totals.grandTotal)}`}
              </Button>

              <Button
                variant="outline"
                className="w-full"
                disabled={cart.lines.length === 0 || createOrder.isPending}
                onClick={() => void onReserve()}
              >
                {createOrder.isPending ? 'Reserving…' : 'Park as order (reserve stock)'}
              </Button>

              {createOrder.error ? (
                <p className="text-xs text-destructive">{(createOrder.error as Error).message}</p>
              ) : null}

              <Button variant="outline" className="w-full" onClick={() => setStep('customer')}>
                Back to customer
              </Button>

              <p className="text-[11px] text-muted-foreground">
                Billing appends one <code>sale</code> movement per line — stock is never written
                directly. With no tender the invoice is parked unpaid and can be settled later from
                Invoices.
              </p>
            </CardBody>
          </Card>
          ) : null}

          {lastInvoice ? (
            <Card>
              <CardHeader
                title={`Invoice ${lastInvoice.number}`}
                description={`${shortTime(lastInvoice.createdAt)} · ${lastInvoice.status}`}
              />
              <CardBody className="space-y-2 text-sm">
                {lastInvoice.lines.map((line) => (
                  <div key={line.id} className="flex justify-between gap-3">
                    <span className="truncate">
                      {line.name} × {fmtQty(line.qty)}
                    </span>
                    <span className="tabular shrink-0">{money(line.lineTotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Total</span>
                  <span className="tabular">{money(lastInvoice.totals.grandTotal)}</span>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between', muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

export function StockBadge({ alert }: { alert: 'out_of_stock' | 'below_min' | 'reorder' | 'ok' }) {
  if (alert === 'out_of_stock') return <Badge tone="danger">Out of stock</Badge>;
  if (alert === 'below_min') return <Badge tone="danger">Below min</Badge>;
  if (alert === 'reorder') return <Badge tone="warning">Reorder</Badge>;
  return <Badge tone="success">OK</Badge>;
}
