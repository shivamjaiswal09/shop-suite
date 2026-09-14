import { describe, expect, it } from 'vitest';
import { DuplicateBarcodeError, InsufficientStockError, MockRepositories } from './repositories';

const setup = async () => {
  const repos = new MockRepositories();
  const store = (await repos.org.stores())[0]!;
  const sku = (await repos.products.skuByBarcode('8901030101010'))!;
  // A store sells from its own shelf, so the store *is* the stock location.
  return { repos, store, location: store, sku, actor: 'usr_0001', counterId: 'counter-1' };
};

describe('billing decrements stock through the ledger', () => {
  it('reduces available stock by exactly the billed quantity', async () => {
    const { repos, store, sku, actor, counterId } = await setup();
    const before = await repos.stock.levelFor(sku.id, store.id);

    const invoice = await repos.invoices.create({
      storeId: store.id,
      counterId,
      lines: [{ skuId: sku.id, qty: 3 }],
      createdBy: actor,
    });

    const after = await repos.stock.levelFor(sku.id, store.id);
    expect(after.available).toBe(before.available - 3);
    expect(invoice.totals.grandTotal).toBeGreaterThan(0);
    expect(invoice.status).toBe('unpaid');

    const movements = await repos.stock.movements({ skuId: sku.id, locationId: store.id, type: 'sale' });
    expect(movements.some((m) => m.refId === invoice.id && m.qty === -3)).toBe(true);
  });

  it('refuses to bill more than is available', async () => {
    const { repos, store, sku, actor, counterId } = await setup();
    const level = await repos.stock.levelFor(sku.id, store.id);
    await expect(
      repos.invoices.create({
        storeId: store.id,
        counterId,
        lines: [{ skuId: sku.id, qty: level.available + 1 }],
        createdBy: actor,
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('reserves stock on a confirmed order without changing on-hand', async () => {
    const { repos, store, sku, actor } = await setup();
    const before = await repos.stock.levelFor(sku.id, store.id);

    await repos.orders.create({
      storeId: store.id,
      lines: [{ skuId: sku.id, qty: 5 }],
      createdBy: actor,
    });

    const after = await repos.stock.levelFor(sku.id, store.id);
    expect(after.onHand).toBe(before.onHand);
    expect(after.reserved).toBe(5);
    expect(after.available).toBe(before.available - 5);
  });
});

describe('product & SKU creation', () => {
  it('creates a SKU with nothing but a code, and does not collide on the second', async () => {
    // Most stock in a hardware or spares shop carries no barcode at all, so a
    // second unbarcoded SKU must not read as a duplicate of the first. Storing
    // '' would do exactly that — the barcode index treats it as a value.
    const { repos, actor } = await setup();
    const category = (await repos.masters.categories())[0]!;
    const product = await repos.products.createProduct({
      name: 'Inner Tube',
      categoryId: category.id,
      createdBy: actor,
    });
    const uom = (await repos.masters.unitsOfMeasure())[0]!;
    const tax = (await repos.masters.taxes())[0]!;
    const bare = { productId: product.id, uomId: uom.id, taxId: tax.id, createdBy: actor };

    const first = await repos.products.createSku({ ...bare, code: 'TUBE-17' });
    const second = await repos.products.createSku({ ...bare, code: 'TUBE-18' });

    expect(first.barcode).toBeNull();
    expect(second.barcode).toBeNull();
    // A bill prints the SKU name, so it falls back rather than being blank.
    expect(first.name).toBe('Inner Tube');
    expect(first.purchasePrice).toBe(0);
    expect(first.sellingPrice).toBe(0);
  });

  it('never matches a barcode-less SKU when scanning', async () => {
    const { repos, actor } = await setup();
    const category = (await repos.masters.categories())[0]!;
    const product = await repos.products.createProduct({
      name: 'Valve Cap',
      categoryId: category.id,
      createdBy: actor,
    });
    const uom = (await repos.masters.unitsOfMeasure())[0]!;
    const tax = (await repos.masters.taxes())[0]!;
    await repos.products.createSku({
      productId: product.id,
      code: 'CAP-1',
      uomId: uom.id,
      taxId: tax.id,
      createdBy: actor,
    });

    expect(await repos.products.skuByBarcode('')).toBeUndefined();
    expect(await repos.products.skuByBarcode('   ')).toBeUndefined();
    // But it is still findable the way a counter actually looks for it.
    expect((await repos.products.searchSkus('CAP-1')).map((s) => s.code)).toContain('CAP-1');
  });

  it('creates a SKU and seeds opening stock as a ledger movement', async () => {
    const { repos, location, actor } = await setup();
    const category = (await repos.masters.categories())[0]!;
    const product = await repos.products.createProduct({
      name: 'Saffola Gold',
      categoryId: category.id,
      createdBy: actor,
    });
    const uom = (await repos.masters.unitsOfMeasure())[0]!;
    const tax = (await repos.masters.taxes())[0]!;

    const sku = await repos.products.createSku({
      productId: product.id,
      code: 'OIL-SAF-1L',
      name: 'Saffola Gold 1 L',
      barcode: '8901031999999',
      uomId: uom.id,
      taxId: tax.id,
      purchasePrice: 150,
      sellingPrice: 185,
      openingStock: { locationId: location.id, qty: 24 },
      createdBy: actor,
    });

    const level = await repos.stock.levelFor(sku.id, location.id);
    expect(level.onHand).toBe(24);
    expect(level.avgCost).toBe(150);

    const movements = await repos.stock.movements({ skuId: sku.id });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe('opening');

    // and it is immediately billable by barcode
    expect((await repos.products.skuByBarcode('8901031999999'))?.id).toBe(sku.id);
  });

  it('rejects a barcode that already exists', async () => {
    const { repos, actor } = await setup();
    const product = (await repos.products.listProducts())[0]!;
    const uom = (await repos.masters.unitsOfMeasure())[0]!;
    const tax = (await repos.masters.taxes())[0]!;

    await expect(
      repos.products.createSku({
        productId: product.id,
        code: 'DUPE-1',
        name: 'Duplicate',
        barcode: '8901030101010',
        uomId: uom.id,
        taxId: tax.id,
        purchasePrice: 10,
        sellingPrice: 12,
        createdBy: actor,
      }),
    ).rejects.toBeInstanceOf(DuplicateBarcodeError);
  });
});

describe('manual stock movements', () => {
  it('applies a negative stock-count correction', async () => {
    const { repos, location, sku, actor } = await setup();
    const before = await repos.stock.levelFor(sku.id, location.id);

    await repos.stock.post([
      {
        skuId: sku.id,
        locationId: location.id,
        type: 'adjustment',
        qty: -4,
        refType: 'stock_count',
        refId: 'count-1',
        createdBy: actor,
      },
    ]);

    expect((await repos.stock.levelFor(sku.id, location.id)).onHand).toBe(before.onHand - 4);
  });

  it('records damage against on-hand and the damaged tally', async () => {
    const { repos, location, sku, actor } = await setup();
    const before = await repos.stock.levelFor(sku.id, location.id);

    await repos.stock.post([
      {
        skuId: sku.id,
        locationId: location.id,
        type: 'damage',
        qty: 3,
        refType: 'adjustment',
        refId: 'damage-1',
        createdBy: actor,
      },
    ]);

    const after = await repos.stock.levelFor(sku.id, location.id);
    expect(after.onHand).toBe(before.onHand - 3);
    expect(after.damaged).toBe(3);
  });
});

describe('transfers between independent locations', () => {
  const transferSetup = async () => {
    const base = await setup();
    const warehouses = await base.repos.org.warehouses();
    const stores = await base.repos.org.stores();
    const central = warehouses.find((w) => w.code === 'WH-PEENYA')!;
    const depot = warehouses.find((w) => w.code === 'WH-HOSUR')!;
    const storeJyn = stores.find((l) => l.code === 'ST-JYN')!;
    const storeInd = stores.find((l) => l.code === 'ST-IND')!;
    return { ...base, central, depot, storeJyn, storeInd };
  };

  it('warehouse -> store: removes at source, adds at destination only on receipt', async () => {
    const { repos, central, storeInd, sku, actor } = await transferSetup();
    const sourceBefore = await repos.stock.levelFor(sku.id, central.id);
    const destBefore = await repos.stock.levelFor(sku.id, storeInd.id);

    const transfer = await repos.transfers.create({
      fromLocationId: central.id,
      toLocationId: storeInd.id,
      lines: [{ skuId: sku.id, qty: 10 }],
      createdBy: actor,
    });

    expect(transfer.status).toBe('in_transit');
    expect((await repos.stock.levelFor(sku.id, central.id)).onHand).toBe(sourceBefore.onHand - 10);
    expect((await repos.stock.levelFor(sku.id, storeInd.id)).onHand).toBe(destBefore.onHand);

    await repos.transfers.receive({ transferId: transfer.id, receivedBy: actor });

    expect((await repos.stock.levelFor(sku.id, storeInd.id)).onHand).toBe(destBefore.onHand + 10);
    expect((await repos.transfers.byId(transfer.id))?.status).toBe('received');
  });

  it('auto-receives in one step when the dispatcher opts in', async () => {
    const { repos, central, storeJyn, sku, actor } = await transferSetup();
    const destBefore = await repos.stock.levelFor(sku.id, storeJyn.id);

    const transfer = await repos.transfers.create({
      fromLocationId: central.id,
      toLocationId: storeJyn.id,
      lines: [{ skuId: sku.id, qty: 5 }],
      autoReceive: true,
      createdBy: actor,
    });

    expect(transfer.status).toBe('received');
    expect((await repos.stock.levelFor(sku.id, storeJyn.id)).onHand).toBe(destBefore.onHand + 5);
  });

  it('allows a store -> store rebalance', async () => {
    const { repos, storeJyn, storeInd, sku, actor } = await transferSetup();
    const destBefore = await repos.stock.levelFor(sku.id, storeInd.id);

    const transfer = await repos.transfers.create({
      fromLocationId: storeJyn.id,
      toLocationId: storeInd.id,
      lines: [{ skuId: sku.id, qty: 4 }],
      createdBy: actor,
    });
    await repos.transfers.receive({ transferId: transfer.id, receivedBy: actor });

    expect((await repos.stock.levelFor(sku.id, storeInd.id)).onHand).toBe(destBefore.onHand + 4);
  });

  it('refuses a transfer to the same location', async () => {
    const { repos, central, sku, actor } = await transferSetup();
    await expect(
      repos.transfers.create({
        fromLocationId: central.id,
        toLocationId: central.id,
        lines: [{ skuId: sku.id, qty: 1 }],
        createdBy: actor,
      }),
    ).rejects.toThrow(/must differ/i);
  });

  it('will not dispatch more than the source has available', async () => {
    const { repos, central, storeInd, sku, actor } = await transferSetup();
    const level = await repos.stock.levelFor(sku.id, central.id);
    await expect(
      repos.transfers.create({
        fromLocationId: central.id,
        toLocationId: storeInd.id,
        lines: [{ skuId: sku.id, qty: level.available + 1 }],
        createdBy: actor,
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it('raises a discrepancy when less arrives than was dispatched', async () => {
    const { repos, central, storeInd, sku, actor } = await transferSetup();
    const transfer = await repos.transfers.create({
      fromLocationId: central.id,
      toLocationId: storeInd.id,
      lines: [{ skuId: sku.id, qty: 10 }],
      createdBy: actor,
    });

    const destBefore = await repos.stock.levelFor(sku.id, storeInd.id);
    await repos.transfers.receive({
      transferId: transfer.id,
      lines: [{ skuId: sku.id, receivedQty: 8 }],
      receivedBy: actor,
    });

    expect((await repos.stock.levelFor(sku.id, storeInd.id)).onHand).toBe(destBefore.onHand + 8);

    const raised = (await repos.discrepancies.list()).filter((d) => d.refId === transfer.id);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ kind: 'stock', expected: 10, actual: 8, variance: -2 });
    // Raised against the receiving location, not the dispatching one.
    expect(raised[0]?.locationId).toBe(storeInd.id);
  });

  it('returns stock to the source when an in-transit transfer is cancelled', async () => {
    const { repos, central, storeInd, sku, actor } = await transferSetup();
    const before = await repos.stock.levelFor(sku.id, central.id);

    const transfer = await repos.transfers.create({
      fromLocationId: central.id,
      toLocationId: storeInd.id,
      lines: [{ skuId: sku.id, qty: 7 }],
      createdBy: actor,
    });
    expect((await repos.stock.levelFor(sku.id, central.id)).onHand).toBe(before.onHand - 7);

    const cancelled = await repos.transfers.cancel(transfer.id, actor);
    expect(cancelled.status).toBe('cancelled');
    expect((await repos.stock.levelFor(sku.id, central.id)).onHand).toBe(before.onHand);
    await expect(repos.transfers.receive({ transferId: transfer.id, receivedBy: actor })).rejects.toThrow();
  });

  it('exposes the seeded in-transit run as inbound to Indiranagar', async () => {
    const { repos } = await transferSetup();
    const inFlight = await repos.transfers.list({ status: 'in_transit' });
    expect(inFlight.length).toBeGreaterThan(0);
    expect(inFlight[0]?.lines[0]?.receivedQty).toBe(0);
  });
});

describe('onboarding', () => {
  it('creates independent locations and links a warehouse to a store', async () => {
    const { repos, actor } = await setup();

    const store = await repos.org.createLocation({
      kind: 'store',
      code: 'ST-KOR',
      name: 'Koramangala Store',
      createdBy: actor,
    });
    const warehouse = await repos.org.createLocation({
      kind: 'warehouse',
      code: 'WH-KOR',
      name: 'Koramangala Depot',
      createdBy: actor,
    });

    // Neither owns the other — the link is what relates them.
    expect(await repos.org.linkedWarehouses(store.id)).toHaveLength(0);

    await repos.org.linkWarehouse({
      storeId: store.id,
      warehouseId: warehouse.id,
      isPrimary: true,
      createdBy: actor,
    });

    expect((await repos.org.linkedWarehouses(store.id)).map((w) => w.id)).toEqual([warehouse.id]);
    expect((await repos.org.linkedStores(warehouse.id)).map((s) => s.id)).toEqual([store.id]);
  });

  it('keeps at most one primary warehouse per store', async () => {
    const { repos, store, actor } = await setup();
    const warehouses = await repos.org.warehouses();

    await repos.org.linkWarehouse({
      storeId: store.id,
      warehouseId: warehouses[1]!.id,
      isPrimary: true,
      createdBy: actor,
    });

    const primaries = (await repos.org.links()).filter((l) => l.storeId === store.id && l.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.warehouseId).toBe(warehouses[1]!.id);
  });

  it('rejects a duplicate location code and a duplicate supply link', async () => {
    const { repos, store, actor } = await setup();
    await expect(
      repos.org.createLocation({ kind: 'store', code: 'ST-JYN', name: 'Clash', createdBy: actor }),
    ).rejects.toThrow(/already exists/i);

    const existing = (await repos.org.links()).find((l) => l.storeId === store.id)!;
    await expect(
      repos.org.linkWarehouse({
        storeId: existing.storeId,
        warehouseId: existing.warehouseId,
        createdBy: actor,
      }),
    ).rejects.toThrow(/already supplies/i);
  });

  it('creates users and masters that are immediately usable', async () => {
    const { repos, store, actor } = await setup();
    const role = (await repos.users.roles())[0]!;

    const user = await repos.users.create({
      name: 'Anita Rao',
      email: 'Anita@Nandiretail.in',
      roleId: role.id,
      storeIds: [store.id],
      createdBy: actor,
    });
    // Email is normalised, so sign-in is case-insensitive.
    expect((await repos.users.authenticate('anita@nandiretail.in'))?.id).toBe(user.id);

    await repos.masters.createTax({ name: 'GST 28%', rate: 28, inclusive: true, createdBy: actor });
    expect((await repos.masters.taxes()).some((t) => t.name === 'GST 28%')).toBe(true);

    await repos.masters.createReasonCode({
      usage: 'damage',
      code: 'THEFT',
      name: 'Suspected theft',
      createdBy: actor,
    });
    expect((await repos.masters.reasonCodes('damage')).some((r) => r.code === 'THEFT')).toBe(true);
  });

  it('refuses a duplicate user email', async () => {
    const { repos, actor } = await setup();
    const role = (await repos.users.roles())[0]!;
    await expect(
      repos.users.create({
        name: 'Clash',
        email: 'owner@nandiretail.in',
        roleId: role.id,
        storeIds: [],
        createdBy: actor,
      }),
    ).rejects.toThrow(/already exists/i);
  });
});

describe('category master', () => {
  it('orders categories for merchandising, not alphabetically', async () => {
    const { repos } = await setup();
    const names = (await repos.masters.categories()).map((c) => c.name);
    expect(names[0]).toBe('Staples');
    expect(names).not.toEqual([...names].sort());
  });

  it('carries the default tax a new SKU in it should start on', async () => {
    const { repos } = await setup();
    const staples = (await repos.masters.categories()).find((c) => c.code === 'STAPLE')!;
    const snacks = (await repos.masters.categories()).find((c) => c.code === 'SNACK')!;
    const taxes = await repos.masters.taxes();

    expect(taxes.find((t) => t.id === staples.defaultTaxId)?.rate).toBe(5);
    expect(taxes.find((t) => t.id === snacks.defaultTaxId)?.rate).toBe(18);
  });

  it('refuses a duplicate code and refuses a product in an unknown category', async () => {
    const { repos, actor } = await setup();
    await expect(
      repos.masters.createCategory({ code: 'staple', name: 'Clash', createdBy: actor }),
    ).rejects.toThrow(/already exists/i);

    await expect(
      repos.products.createProduct({ name: 'Orphan', categoryId: 'cat_nope', createdBy: actor }),
    ).rejects.toThrow(/not found/i);
  });

  it('renames in one place, and every product follows', async () => {
    const { repos, actor } = await setup();
    const category = (await repos.masters.categories()).find((c) => c.code === 'DAIRY')!;
    const before = (await repos.products.listProducts()).filter((p) => p.categoryId === category.id);
    expect(before.length).toBeGreaterThan(0);

    await repos.masters.updateCategory(category.id, { name: 'Dairy & Chilled' }, actor);

    const renamed = (await repos.masters.categories()).find((c) => c.id === category.id)!;
    expect(renamed.name).toBe('Dairy & Chilled');
    // Products point at the id, so none of them needed touching.
    const after = (await repos.products.listProducts()).filter((p) => p.categoryId === category.id);
    expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
  });

  it('keeps a deactivated category resolvable for the products still in it', async () => {
    const { repos, actor } = await setup();
    const category = (await repos.masters.categories()).find((c) => c.code === 'HOME')!;
    await repos.masters.updateCategory(category.id, { active: false }, actor);

    expect((await repos.masters.categories()).some((c) => c.id === category.id)).toBe(false);
    expect((await repos.masters.categories(true)).some((c) => c.id === category.id)).toBe(true);
  });
});

describe('onboarding edits', () => {
  it('patches only the keys supplied and leaves the rest intact', async () => {
    const { repos, actor } = await setup();
    const tax = (await repos.masters.taxes())[0]!;

    const updated = await repos.masters.updateTax(tax.id, { name: 'GST 5% (revised)' }, actor);

    expect(updated.name).toBe('GST 5% (revised)');
    expect(updated.rate).toBe(tax.rate);
    expect(updated.inclusive).toBe(tax.inclusive);
  });

  it('deactivates rather than deletes, and hides inactive rows by default', async () => {
    const { repos, actor } = await setup();
    const method = (await repos.masters.paymentMethods()).find((m) => m.code === 'CARD')!;

    await repos.masters.updatePaymentMethod(method.id, { active: false }, actor);

    expect((await repos.masters.paymentMethods()).some((m) => m.id === method.id)).toBe(false);
    // Still there for onboarding, so it can be switched back on.
    expect((await repos.masters.paymentMethods(true)).some((m) => m.id === method.id)).toBe(true);

    await repos.masters.updatePaymentMethod(method.id, { active: true }, actor);
    expect((await repos.masters.paymentMethods()).some((m) => m.id === method.id)).toBe(true);
  });

  it('keeps SKU codes and barcodes unique on edit', async () => {
    const { repos, actor } = await setup();
    const [first, second] = await repos.products.listSkus();

    await expect(
      repos.products.updateSku(first!.id, { barcode: second!.barcode }, actor),
    ).rejects.toBeInstanceOf(DuplicateBarcodeError);

    // Re-saving its own barcode is not a clash.
    const same = await repos.products.updateSku(first!.id, { barcode: first!.barcode }, actor);
    expect(same.barcode).toBe(first!.barcode);
  });

  it('rejects a location code that collides with another location', async () => {
    const { repos, actor } = await setup();
    const [a, b] = await repos.org.locations();
    await expect(repos.org.updateLocation(a!.id, { code: b!.code }, actor)).rejects.toThrow(
      /already exists/i,
    );
  });

  it('moves the primary flag rather than adding a second one', async () => {
    const { repos, store, actor } = await setup();
    const warehouses = await repos.org.warehouses();
    const second = await repos.org.linkWarehouse({
      storeId: store.id,
      warehouseId: warehouses[1]!.id,
      createdBy: actor,
    });

    await repos.org.setPrimaryWarehouse(second.id, actor);

    const forStore = (await repos.org.links()).filter((l) => l.storeId === store.id);
    expect(forStore.filter((l) => l.isPrimary)).toHaveLength(1);
    expect(forStore.find((l) => l.isPrimary)?.id).toBe(second.id);
  });

  it('records every edit in the audit log', async () => {
    const { repos, actor } = await setup();
    const uom = (await repos.masters.unitsOfMeasure())[0]!;
    await repos.masters.updateUnitOfMeasure(uom.id, { name: 'Pieces (each)' }, actor);

    const log = await repos.audit.list(20);
    expect(log.some((l) => l.entity === 'unit_of_measure' && l.action === 'update')).toBe(true);
  });
});

describe('cancelling and deleting an invoice', () => {
  const billed = async () => {
    const base = await setup();
    const before = await base.repos.stock.levelFor(base.sku.id, base.store.id);
    const invoice = await base.repos.invoices.create({
      storeId: base.store.id,
      counterId: base.counterId,
      lines: [{ skuId: base.sku.id, qty: 4 }],
      createdBy: base.actor,
    });
    const cash = (await base.repos.masters.paymentMethods()).find((m) => m.code === 'CASH')!;
    await base.repos.payments.capture({
      invoiceId: invoice.id,
      paymentMethodId: cash.id,
      amount: invoice.totals.grandTotal,
      idempotencyKey: `pay:${invoice.id}`,
      createdBy: base.actor,
    });
    return { ...base, invoice, cash, onHandBefore: before.onHand };
  };

  it('returns the stock and reverses the payment, keeping the document', async () => {
    const { repos, sku, store, invoice, onHandBefore } = await billed();

    const cancelled = await repos.invoices.cancel(invoice.id, 'Billed to the wrong customer');

    expect(cancelled.status).toBe('cancelled');
    // The goods are back on the shelf, exactly where they started.
    expect((await repos.stock.levelFor(sku.id, store.id)).onHand).toBe(onHandBefore);
    // Cash nets to nothing rather than being erased, so day-end still balances.
    const payments = await repos.payments.listByInvoice(invoice.id);
    expect(payments.reduce((sum, p) => sum + p.amount, 0)).toBe(0);
    // And the number is still taken, so no later sale can be issued with it.
    expect((await repos.invoices.byId(invoice.id))?.number).toBe(invoice.number);
  });

  it('refuses to cancel the same invoice twice', async () => {
    const { repos, invoice } = await billed();
    await repos.invoices.cancel(invoice.id);
    await expect(repos.invoices.cancel(invoice.id)).rejects.toThrow(/already cancelled/i);
  });

  it('refuses to touch an invoice that has a return against it', async () => {
    // The return has already put goods back and refunded money; reversing the
    // whole invoice on top would do both a second time.
    const { repos, invoice, sku, actor } = await billed();
    const reason = (await repos.masters.reasonCodes('return'))[0]!;
    await repos.salesReturns.create({
      invoiceId: invoice.id,
      reasonCodeId: reason.id,
      lines: [{ skuId: sku.id, qty: 1 }],
      createdBy: actor,
    });

    await expect(repos.invoices.cancel(invoice.id)).rejects.toThrow(/has a return against it/i);
    await expect(repos.invoices.remove(invoice.id, invoice.number)).rejects.toThrow(
      /has a return against it/i,
    );
  });

  it('deletes only when the number is typed back exactly', async () => {
    const { repos, invoice } = await billed();
    await expect(repos.invoices.remove(invoice.id, 'not-the-number')).rejects.toThrow(/confirm/i);
    expect(await repos.invoices.byId(invoice.id)).toBeDefined();
  });

  it('takes the stock movements with it when deleting', async () => {
    // Movements reference the invoice by id rather than by a relation, so
    // nothing removes them automatically. Left behind, they would hold stock
    // down for goods the books no longer say were sold.
    const { repos, invoice, sku, store, onHandBefore } = await billed();

    await repos.invoices.remove(invoice.id, invoice.number);

    expect(await repos.invoices.byId(invoice.id)).toBeUndefined();
    expect((await repos.stock.levelFor(sku.id, store.id)).onHand).toBe(onHandBefore);
    expect(await repos.payments.listByInvoice(invoice.id)).toHaveLength(0);
  });
});

describe('sales returns', () => {
  const billed = async () => {
    const base = await setup();
    const invoice = await base.repos.invoices.create({
      storeId: base.store.id,
      counterId: base.counterId,
      lines: [{ skuId: base.sku.id, qty: 5 }],
      createdBy: base.actor,
    });
    const cash = (await base.repos.masters.paymentMethods()).find((m) => m.code === 'CASH')!;
    await base.repos.payments.capture({
      invoiceId: invoice.id,
      paymentMethodId: cash.id,
      amount: invoice.totals.grandTotal,
      idempotencyKey: `pay:${invoice.id}`,
      createdBy: base.actor,
    });
    return { ...base, invoice, cash };
  };

  it('puts stock back on the shelf and refunds as a negative payment', async () => {
    const { repos, store, sku, actor, invoice, cash } = await billed();
    const reason = (await repos.masters.reasonCodes('return'))[0]!;
    const afterSale = await repos.stock.levelFor(sku.id, store.id);

    const ret = await repos.salesReturns.create({
      invoiceId: invoice.id,
      reasonCodeId: reason.id,
      lines: [{ skuId: sku.id, qty: 2 }],
      refundMethodId: cash.id,
      createdBy: actor,
    });

    expect((await repos.stock.levelFor(sku.id, store.id)).onHand).toBe(afterSale.onHand + 2);
    expect(ret.refundTotal).toBeGreaterThan(0);

    const payments = await repos.payments.listByInvoice(invoice.id);
    const refund = payments.find((p) => p.amount < 0)!;
    expect(refund.amount).toBe(-ret.refundTotal);
  });

  it('nets the refund out of day-end sales by method', async () => {
    const { repos, store, sku, actor, counterId, invoice, cash } = await billed();
    const reason = (await repos.masters.reasonCodes('return'))[0]!;
    const before = await repos.closing.preview({
      storeId: store.id,
      counterId,
      businessDate: invoice.businessDate,
    });

    const ret = await repos.salesReturns.create({
      invoiceId: invoice.id,
      reasonCodeId: reason.id,
      lines: [{ skuId: sku.id, qty: 1 }],
      refundMethodId: cash.id,
      createdBy: actor,
    });

    const after = await repos.closing.preview({
      storeId: store.id,
      counterId,
      businessDate: invoice.businessDate,
    });
    expect(after.expectedCash).toBe(
      Math.round((before.expectedCash - ret.refundTotal) * 100) / 100,
    );
  });

  it('refuses to return more than was billed, across several returns', async () => {
    const { repos, sku, actor, invoice } = await billed();
    const reason = (await repos.masters.reasonCodes('return'))[0]!;

    await repos.salesReturns.create({
      invoiceId: invoice.id,
      reasonCodeId: reason.id,
      lines: [{ skuId: sku.id, qty: 3 }],
      createdBy: actor,
    });

    await expect(
      repos.salesReturns.create({
        invoiceId: invoice.id,
        reasonCodeId: reason.id,
        lines: [{ skuId: sku.id, qty: 3 }],
        createdBy: actor,
      }),
    ).rejects.toThrow(/may still be returned/i);
  });
});

describe('purchasing', () => {
  it('receives against a PO, moving stock in and the average cost with it', async () => {
    const { repos, sku, actor } = await setup();
    const supplier = (await repos.masters.suppliers())[0]!;
    const warehouse = (await repos.org.warehouses())[0]!;
    const before = await repos.stock.levelFor(sku.id, warehouse.id);

    const order = await repos.purchases.createOrder({
      supplierId: supplier.id,
      locationId: warehouse.id,
      lines: [{ skuId: sku.id, qty: 100, unitCost: 500 }],
      createdBy: actor,
    });

    await repos.purchases.receive({
      purchaseOrderId: order.id,
      lines: [{ skuId: sku.id, qty: 100, unitCost: 500, damagedQty: 4 }],
      createdBy: actor,
    });

    const after = await repos.stock.levelFor(sku.id, warehouse.id);
    // 100 in, 4 immediately written off as damaged.
    expect(after.onHand).toBe(before.onHand + 96);
    expect(after.damaged).toBe(4);
    expect(after.avgCost).toBeGreaterThan(before.avgCost);
    expect((await repos.purchases.listOrders()).find((p) => p.id === order.id)?.status).toBe('received');
  });

  it('refuses to receive more than was ordered', async () => {
    const { repos, sku, actor } = await setup();
    const supplier = (await repos.masters.suppliers())[0]!;
    const warehouse = (await repos.org.warehouses())[0]!;
    const order = await repos.purchases.createOrder({
      supplierId: supplier.id,
      locationId: warehouse.id,
      lines: [{ skuId: sku.id, qty: 10, unitCost: 100 }],
      createdBy: actor,
    });

    await expect(
      repos.purchases.receive({
        purchaseOrderId: order.id,
        lines: [{ skuId: sku.id, qty: 11, unitCost: 100 }],
        createdBy: actor,
      }),
    ).rejects.toThrow(/outstanding/i);
  });

  it('sends stock back to the supplier and out of the location', async () => {
    const { repos, sku, actor } = await setup();
    const supplier = (await repos.masters.suppliers())[0]!;
    const warehouse = (await repos.org.warehouses())[0]!;
    const reason = (await repos.masters.reasonCodes('return'))[0]!;

    const order = await repos.purchases.createOrder({
      supplierId: supplier.id,
      locationId: warehouse.id,
      lines: [{ skuId: sku.id, qty: 20, unitCost: 100 }],
      createdBy: actor,
    });
    const receipt = await repos.purchases.receive({
      purchaseOrderId: order.id,
      lines: [{ skuId: sku.id, qty: 20, unitCost: 100 }],
      createdBy: actor,
    });
    const afterReceipt = await repos.stock.levelFor(sku.id, warehouse.id);

    await repos.purchases.createReturn({
      goodsReceiptId: receipt.id,
      reasonCodeId: reason.id,
      lines: [{ skuId: sku.id, qty: 5 }],
      createdBy: actor,
    });

    expect((await repos.stock.levelFor(sku.id, warehouse.id)).onHand).toBe(afterReceipt.onHand - 5);
  });

  it('will not cancel a PO that has already been received against', async () => {
    const { repos, sku, actor } = await setup();
    const supplier = (await repos.masters.suppliers())[0]!;
    const warehouse = (await repos.org.warehouses())[0]!;
    const order = await repos.purchases.createOrder({
      supplierId: supplier.id,
      locationId: warehouse.id,
      lines: [{ skuId: sku.id, qty: 10, unitCost: 100 }],
      createdBy: actor,
    });
    await repos.purchases.receive({
      purchaseOrderId: order.id,
      lines: [{ skuId: sku.id, qty: 4, unitCost: 100 }],
      createdBy: actor,
    });

    await expect(repos.purchases.cancelOrder(order.id, actor)).rejects.toThrow(/partly received/i);
  });
});

describe('payment capture', () => {
  it('is idempotent and settles the invoice', async () => {
    const { repos, store, sku, actor, counterId } = await setup();
    const invoice = await repos.invoices.create({
      storeId: store.id,
      counterId,
      lines: [{ skuId: sku.id, qty: 1 }],
      createdBy: actor,
    });
    const cash = (await repos.masters.paymentMethods()).find((m) => m.code === 'CASH')!;

    const first = await repos.payments.capture({
      invoiceId: invoice.id,
      paymentMethodId: cash.id,
      amount: invoice.totals.grandTotal,
      idempotencyKey: 'retry-me',
      createdBy: actor,
    });
    const retry = await repos.payments.capture({
      invoiceId: invoice.id,
      paymentMethodId: cash.id,
      amount: invoice.totals.grandTotal,
      idempotencyKey: 'retry-me',
      createdBy: actor,
    });

    expect(retry.id).toBe(first.id);
    expect(await repos.payments.listByInvoice(invoice.id)).toHaveLength(1);
    expect((await repos.invoices.byId(invoice.id))?.status).toBe('paid');
  });
});

describe('day-end closing', () => {
  it('summarises the day and flags a short drawer', async () => {
    const { repos, store, sku, actor, counterId } = await setup();
    const invoice = await repos.invoices.create({
      storeId: store.id,
      counterId,
      lines: [{ skuId: sku.id, qty: 2 }],
      createdBy: actor,
    });
    const cash = (await repos.masters.paymentMethods()).find((m) => m.code === 'CASH')!;
    await repos.payments.capture({
      invoiceId: invoice.id,
      paymentMethodId: cash.id,
      amount: invoice.totals.grandTotal,
      idempotencyKey: `pay_${invoice.id}`,
      createdBy: actor,
    });

    const businessDate = invoice.businessDate;
    const preview = await repos.closing.preview({ storeId: store.id, counterId, businessDate });
    expect(preview.expectedCash).toBeGreaterThan(preview.openingCash);

    const closing = await repos.closing.submit({
      storeId: store.id,
      counterId,
      businessDate,
      openingCash: preview.openingCash,
      physicalCash: preview.expectedCash - 100,
      depositedAmount: 0,
      carriedForward: 0,
      submittedBy: actor,
    });

    expect(closing.variance).toBe(-100);
    expect(await repos.discrepancies.list(store.id)).toHaveLength(1);

    const approved = await repos.closing.approve(closing.id, actor);
    expect(approved.status).toBe('approved');
  });

  it('settles a parked invoice later and resolves the discrepancy it raised', async () => {
    const { repos, store, sku, actor, counterId } = await setup();

    // Billed but not tendered — parked as unpaid.
    const invoice = await repos.invoices.create({
      storeId: store.id,
      counterId,
      lines: [{ skuId: sku.id, qty: 1 }],
      createdBy: actor,
    });
    expect(invoice.status).toBe('unpaid');
    expect(invoice.amountDue).toBe(invoice.totals.grandTotal);

    const cash = (await repos.masters.paymentMethods()).find((m) => m.code === 'CASH')!;
    await repos.payments.capture({
      invoiceId: invoice.id,
      paymentMethodId: cash.id,
      amount: invoice.totals.grandTotal,
      idempotencyKey: `${invoice.id}:settle:0`,
      createdBy: actor,
    });

    const settled = await repos.invoices.byId(invoice.id);
    expect(settled?.status).toBe('paid');
    expect(settled?.amountDue).toBe(0);

    const closing = await repos.closing.submit({
      storeId: store.id,
      counterId,
      businessDate: invoice.businessDate,
      openingCash: 2000,
      physicalCash: 0,
      depositedAmount: 0,
      carriedForward: 0,
      submittedBy: actor,
    });
    expect(closing.variance).toBeLessThan(0);

    const [raised] = await repos.discrepancies.list(store.id);
    const resolved = await repos.discrepancies.resolve({
      discrepancyId: raised!.id,
      status: 'written_off',
      resolvedBy: actor,
    });

    expect(resolved.status).toBe('written_off');
    expect(resolved.resolvedBy).toBe(actor);
    expect(resolved.resolvedAt).toBeDefined();
  });
});
