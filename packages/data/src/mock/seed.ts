import {
  calcTotals,
  priceLine,
  signedQty,
  type Brand,
  type Invoice,
  type Payment,
  type Product,
  type SaleLine,
  type Sku,
  type StockMovement,
  type StockTransfer,
} from '@shop/core';
import { InMemoryStore } from './store';

interface SeedSku {
  code: string;
  name: string;
  barcode: string;
  uom: 'PCS' | 'KG' | 'LTR';
  tax: 'GST0' | 'GST5' | 'GST12' | 'GST18';
  purchasePrice: number;
  sellingPrice: number;
  minStock: number;
  reorderLevel: number;
  openingA: number;
  openingB: number;
}

interface SeedProduct {
  name: string;
  category: string;
  brand: string;
  skus: SeedSku[];
}

const CATALOG: SeedProduct[] = [
  {
    name: 'Aashirvaad Atta',
    category: 'Staples',
    brand: 'Aashirvaad',
    skus: [
      { code: 'ATT-5KG', name: 'Aashirvaad Atta 5 kg', barcode: '8901030101010', uom: 'PCS', tax: 'GST5', purchasePrice: 230, sellingPrice: 265, minStock: 10, reorderLevel: 20, openingA: 60, openingB: 35 },
      { code: 'ATT-10KG', name: 'Aashirvaad Atta 10 kg', barcode: '8901030101027', uom: 'PCS', tax: 'GST5', purchasePrice: 445, sellingPrice: 505, minStock: 6, reorderLevel: 12, openingA: 28, openingB: 14 },
    ],
  },
  {
    name: 'Tata Salt',
    category: 'Staples',
    brand: 'Tata',
    skus: [
      { code: 'SLT-1KG', name: 'Tata Salt 1 kg', barcode: '8901030202020', uom: 'PCS', tax: 'GST0', purchasePrice: 22, sellingPrice: 28, minStock: 24, reorderLevel: 48, openingA: 140, openingB: 90 },
    ],
  },
  {
    name: 'Fortune Sunflower Oil',
    category: 'Staples',
    brand: 'Fortune',
    skus: [
      { code: 'OIL-1L', name: 'Fortune Sunflower Oil 1 L', barcode: '8901030303030', uom: 'PCS', tax: 'GST5', purchasePrice: 128, sellingPrice: 149, minStock: 20, reorderLevel: 40, openingA: 96, openingB: 52 },
      { code: 'OIL-5L', name: 'Fortune Sunflower Oil 5 L', barcode: '8901030303047', uom: 'PCS', tax: 'GST5', purchasePrice: 610, sellingPrice: 689, minStock: 6, reorderLevel: 10, openingA: 18, openingB: 8 },
    ],
  },
  {
    name: 'Basmati Rice',
    category: 'Staples',
    brand: 'India Gate',
    skus: [
      { code: 'RIC-1KG', name: 'India Gate Basmati 1 kg', barcode: '8901030404040', uom: 'KG', tax: 'GST5', purchasePrice: 118, sellingPrice: 139, minStock: 15, reorderLevel: 30, openingA: 72, openingB: 44 },
    ],
  },
  {
    name: 'Amul Butter',
    category: 'Dairy',
    brand: 'Amul',
    skus: [
      { code: 'BUT-100G', name: 'Amul Butter 100 g', barcode: '8901030505050', uom: 'PCS', tax: 'GST12', purchasePrice: 52, sellingPrice: 58, minStock: 20, reorderLevel: 36, openingA: 84, openingB: 46 },
      { code: 'BUT-500G', name: 'Amul Butter 500 g', barcode: '8901030505067', uom: 'PCS', tax: 'GST12', purchasePrice: 245, sellingPrice: 275, minStock: 8, reorderLevel: 16, openingA: 26, openingB: 12 },
    ],
  },
  {
    name: 'Amul Taaza Milk',
    category: 'Dairy',
    brand: 'Amul',
    skus: [
      { code: 'MLK-1L', name: 'Amul Taaza Milk 1 L', barcode: '8901030606060', uom: 'LTR', tax: 'GST0', purchasePrice: 62, sellingPrice: 70, minStock: 30, reorderLevel: 60, openingA: 110, openingB: 64 },
    ],
  },
  {
    name: 'Britannia Good Day',
    category: 'Snacks',
    brand: 'Britannia',
    skus: [
      { code: 'BIS-GD-100', name: 'Good Day Cashew 100 g', barcode: '8901030707070', uom: 'PCS', tax: 'GST18', purchasePrice: 24, sellingPrice: 30, minStock: 36, reorderLevel: 72, openingA: 180, openingB: 120 },
      { code: 'BIS-GD-250', name: 'Good Day Cashew 250 g', barcode: '8901030707087', uom: 'PCS', tax: 'GST18', purchasePrice: 58, sellingPrice: 70, minStock: 18, reorderLevel: 36, openingA: 64, openingB: 38 },
    ],
  },
  {
    name: 'Lays Classic',
    category: 'Snacks',
    brand: 'Lays',
    skus: [
      { code: 'CHP-52G', name: 'Lays Classic Salted 52 g', barcode: '8901030808080', uom: 'PCS', tax: 'GST18', purchasePrice: 16, sellingPrice: 20, minStock: 48, reorderLevel: 96, openingA: 240, openingB: 150 },
    ],
  },
  {
    name: 'Coca-Cola',
    category: 'Beverages',
    brand: 'Coca-Cola',
    skus: [
      { code: 'COK-750', name: 'Coca-Cola 750 ml', barcode: '8901030909090', uom: 'PCS', tax: 'GST18', purchasePrice: 32, sellingPrice: 40, minStock: 36, reorderLevel: 72, openingA: 132, openingB: 88 },
      { code: 'COK-2L', name: 'Coca-Cola 2 L', barcode: '8901030909106', uom: 'PCS', tax: 'GST18', purchasePrice: 76, sellingPrice: 95, minStock: 18, reorderLevel: 36, openingA: 54, openingB: 30 },
    ],
  },
  {
    name: 'Red Label Tea',
    category: 'Beverages',
    brand: 'Brooke Bond',
    skus: [
      { code: 'TEA-500G', name: 'Red Label Tea 500 g', barcode: '8901031010101', uom: 'PCS', tax: 'GST5', purchasePrice: 245, sellingPrice: 285, minStock: 10, reorderLevel: 20, openingA: 42, openingB: 22 },
    ],
  },
  {
    name: 'Nescafe Classic',
    category: 'Beverages',
    brand: 'Nescafe',
    skus: [
      { code: 'COF-50G', name: 'Nescafe Classic 50 g', barcode: '8901031111111', uom: 'PCS', tax: 'GST18', purchasePrice: 165, sellingPrice: 195, minStock: 8, reorderLevel: 16, openingA: 30, openingB: 4 },
    ],
  },
  {
    name: 'Colgate Strong Teeth',
    category: 'Personal Care',
    brand: 'Colgate',
    skus: [
      { code: 'TPS-200G', name: 'Colgate Strong Teeth 200 g', barcode: '8901031212121', uom: 'PCS', tax: 'GST18', purchasePrice: 92, sellingPrice: 112, minStock: 15, reorderLevel: 30, openingA: 68, openingB: 36 },
    ],
  },
  {
    name: 'Dove Soap',
    category: 'Personal Care',
    brand: 'Dove',
    skus: [
      { code: 'SOP-100G', name: 'Dove Beauty Bar 100 g', barcode: '8901031313131', uom: 'PCS', tax: 'GST18', purchasePrice: 48, sellingPrice: 62, minStock: 24, reorderLevel: 48, openingA: 96, openingB: 58 },
    ],
  },
  {
    name: 'Head & Shoulders Shampoo',
    category: 'Personal Care',
    brand: 'Head & Shoulders',
    skus: [
      { code: 'SHM-340', name: 'H&S Anti-Dandruff 340 ml', barcode: '8901031414141', uom: 'PCS', tax: 'GST18', purchasePrice: 285, sellingPrice: 345, minStock: 8, reorderLevel: 16, openingA: 24, openingB: 6 },
    ],
  },
  {
    name: 'Surf Excel Easy Wash',
    category: 'Household',
    brand: 'Surf Excel',
    skus: [
      { code: 'DET-1KG', name: 'Surf Excel Easy Wash 1 kg', barcode: '8901031515151', uom: 'PCS', tax: 'GST18', purchasePrice: 105, sellingPrice: 128, minStock: 12, reorderLevel: 24, openingA: 58, openingB: 30 },
    ],
  },
  {
    name: 'Vim Dishwash Bar',
    category: 'Household',
    brand: 'Vim',
    skus: [
      { code: 'DSH-200G', name: 'Vim Dishwash Bar 200 g', barcode: '8901031616161', uom: 'PCS', tax: 'GST18', purchasePrice: 18, sellingPrice: 24, minStock: 36, reorderLevel: 72, openingA: 150, openingB: 96 },
    ],
  },
  {
    name: 'Harpic Toilet Cleaner',
    category: 'Household',
    brand: 'Harpic',
    skus: [
      { code: 'CLN-500', name: 'Harpic Power Plus 500 ml', barcode: '8901031717171', uom: 'PCS', tax: 'GST18', purchasePrice: 88, sellingPrice: 108, minStock: 12, reorderLevel: 24, openingA: 40, openingB: 3 },
    ],
  },
  {
    name: 'Maggi Noodles',
    category: 'Snacks',
    brand: 'Maggi',
    skus: [
      { code: 'NDL-70G', name: 'Maggi Masala Noodles 70 g', barcode: '8901031818181', uom: 'PCS', tax: 'GST12', purchasePrice: 11, sellingPrice: 14, minStock: 60, reorderLevel: 120, openingA: 320, openingB: 210 },
    ],
  },
];

const SEED_ACTOR = 'usr_0001';
const SEED_AT = '2026-08-01T04:00:00.000Z';

/**
 * Builds a fully populated dataset: 1 company, 2 stores and 2 independent
 * warehouses linked many-to-many,
 * masters, ~20 SKUs with barcodes, opening stock, and a couple of already-billed
 * invoices for today so Day-End Closing has something to reconcile.
 */
export function createSeededStore(): InMemoryStore {
  const store = new InMemoryStore();

  /* --------------------------------------------------------------- org */
  const companyId = store.nextId('cmp');
  store.company = {
    id: companyId,
    name: 'Nandi Retail',
    legalName: 'Nandi Retail Pvt Ltd',
    gstin: '29AABCN1234R1ZQ',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    active: true,
    createdAt: SEED_AT,
  };

  const storeA = { id: store.nextId('loc'), companyId, kind: 'store' as const, code: 'ST-JYN', name: 'Jayanagar Store', city: 'Bengaluru', state: 'Karnataka', phone: '+91 80 4000 1001', active: true };
  const storeB = { id: store.nextId('loc'), companyId, kind: 'store' as const, code: 'ST-IND', name: 'Indiranagar Store', city: 'Bengaluru', state: 'Karnataka', phone: '+91 80 4000 1002', active: true };

  // Warehouses are independent of stores — each can supply several of them.
  const whCentral = { id: store.nextId('loc'), companyId, kind: 'warehouse' as const, code: 'WH-PEENYA', name: 'Peenya Central Warehouse', city: 'Bengaluru', state: 'Karnataka', active: true };
  const whSouth = { id: store.nextId('loc'), companyId, kind: 'warehouse' as const, code: 'WH-HOSUR', name: 'Hosur Road Depot', city: 'Bengaluru', state: 'Karnataka', active: true };

  store.locations = [storeA, storeB, whCentral, whSouth];

  // Peenya supplies both stores; Hosur Road is a secondary source for Indiranagar.
  store.storeWarehouseLinks = [
    { id: store.nextId('lnk'), storeId: storeA.id, warehouseId: whCentral.id, isPrimary: true },
    { id: store.nextId('lnk'), storeId: storeB.id, warehouseId: whCentral.id, isPrimary: true },
    { id: store.nextId('lnk'), storeId: storeB.id, warehouseId: whSouth.id, isPrimary: false },
  ];

  /* ------------------------------------------------------- users & roles */
  const ownerRole = { id: store.nextId('rol'), companyId, name: 'Owner', system: true, permissions: ['sales.bill', 'sales.refund', 'inventory.view', 'inventory.adjust', 'purchase.manage', 'closing.perform', 'closing.approve', 'admin.manage'] as const };
  const cashierRole = { id: store.nextId('rol'), companyId, name: 'Cashier', system: true, permissions: ['sales.bill', 'inventory.view', 'closing.perform'] as const };
  store.roles = [
    { ...ownerRole, permissions: [...ownerRole.permissions] },
    { ...cashierRole, permissions: [...cashierRole.permissions] },
  ];

  store.users = [
    { id: store.nextId('usr'), companyId, name: 'Ravi Kumar', email: 'owner@nandiretail.in', phone: '+91 98450 11111', roleId: ownerRole.id, storeIds: [], locationIds: [], active: true, isSuperAdmin: false, createdAt: SEED_AT },
    { id: store.nextId('usr'), companyId, name: 'Priya Nair', email: 'cashier@nandiretail.in', phone: '+91 98450 22222', roleId: cashierRole.id, storeIds: [storeA.id], locationIds: [storeA.id], active: true, isSuperAdmin: false, createdAt: SEED_AT },
  ];

  /* ------------------------------------------------------------- masters */
  const uoms = {
    PCS: { id: store.nextId('uom'), code: 'PCS', name: 'Pieces', precision: 0, active: true },
    KG: { id: store.nextId('uom'), code: 'KG', name: 'Kilogram', precision: 3, active: true },
    LTR: { id: store.nextId('uom'), code: 'LTR', name: 'Litre', precision: 3, active: true },
  };
  store.unitsOfMeasure = Object.values(uoms);

  const taxes = {
    GST0: { id: store.nextId('tax'), name: 'GST 0%', rate: 0, inclusive: true, active: true },
    GST5: { id: store.nextId('tax'), name: 'GST 5%', rate: 5, inclusive: true, active: true },
    GST12: { id: store.nextId('tax'), name: 'GST 12%', rate: 12, inclusive: true, active: true },
    GST18: { id: store.nextId('tax'), name: 'GST 18%', rate: 18, inclusive: true, active: true },
  };
  store.taxes = Object.values(taxes);

  store.customers = [
    { id: store.nextId('cus'), companyId, name: 'Walk-in Customer', creditLimit: 0, active: true },
    { id: store.nextId('cus'), companyId, name: 'Lakshmi Iyer', phone: '+91 99000 12345', creditLimit: 5000, active: true },
    { id: store.nextId('cus'), companyId, name: 'Sunrise Cafe', phone: '+91 99000 54321', gstin: '29AAACS9876Q1ZL', creditLimit: 50000, active: true },
  ];

  store.suppliers = [
    { id: store.nextId('sup'), companyId, name: 'Metro Wholesale', phone: '+91 80 2222 3333', gstin: '29AAACM1111P1ZR', paymentTermsDays: 15, active: true },
    { id: store.nextId('sup'), companyId, name: 'Karnataka FMCG Distributors', phone: '+91 80 4444 5555', paymentTermsDays: 30, active: true },
  ];

  const cash = { id: store.nextId('pmt'), code: 'CASH', name: 'Cash', kind: 'cash' as const, countedInDrawer: true, active: true };
  const upi = { id: store.nextId('pmt'), code: 'UPI', name: 'UPI', kind: 'upi' as const, countedInDrawer: false, active: true };
  const card = { id: store.nextId('pmt'), code: 'CARD', name: 'Card', kind: 'card' as const, countedInDrawer: false, active: true };
  const credit = { id: store.nextId('pmt'), code: 'CREDIT', name: 'Store Credit', kind: 'credit' as const, countedInDrawer: false, active: true };
  store.paymentMethods = [cash, upi, card, credit];

  // Categories carry the tax a new SKU in them starts on — in Indian retail the
  // rate is decided by category far more than by individual product.
  const categoryDefs = [
    { code: 'STAPLE', name: 'Staples', sortOrder: 10, tax: taxes.GST5.id },
    { code: 'DAIRY', name: 'Dairy', sortOrder: 20, tax: taxes.GST12.id },
    { code: 'BEV', name: 'Beverages', sortOrder: 30, tax: taxes.GST18.id },
    { code: 'SNACK', name: 'Snacks', sortOrder: 40, tax: taxes.GST18.id },
    { code: 'PCARE', name: 'Personal Care', sortOrder: 50, tax: taxes.GST18.id },
    { code: 'HOME', name: 'Household', sortOrder: 60, tax: taxes.GST18.id },
  ];
  const categoryByName = new Map<string, string>();
  store.categories = categoryDefs.map((def) => {
    const id = store.nextId('cat');
    categoryByName.set(def.name, id);
    return {
      id,
      companyId,
      code: def.code,
      name: def.name,
      sortOrder: def.sortOrder,
      defaultTaxId: def.tax,
      active: true,
    };
  });

  // One entity mapped to both stores, matching how production was seeded from
  // each company's own legal name. Without it the mock would show no supplier
  // on a bill while the real API shows one.
  store.billFromEntities = [
    {
      id: store.nextId('bfr'),
      companyId,
      legalName: 'Nandi Retail Pvt Ltd',
      gstin: '29AABCN1234R1ZQ',
      pan: 'AABCN1234R',
      phones: ['+91 80 4000 1001'],
      locationIds: [storeA.id, storeB.id],
      active: true,
    },
  ];

  store.reasonCodes = [
    { id: store.nextId('rsn'), usage: 'return', code: 'DMG', name: 'Damaged in transit', active: true },
    { id: store.nextId('rsn'), usage: 'return', code: 'WRONG', name: 'Wrong item billed', active: true },
    { id: store.nextId('rsn'), usage: 'cancellation', code: 'CUST', name: 'Customer cancelled', active: true },
    { id: store.nextId('rsn'), usage: 'adjustment', code: 'COUNT', name: 'Physical count correction', active: true },
    { id: store.nextId('rsn'), usage: 'damage', code: 'EXPIRY', name: 'Expired stock', active: true },
    { id: store.nextId('rsn'), usage: 'discrepancy', code: 'SHORT', name: 'Cash short at counter', active: true },
  ];

  /* -------------------------------------------------- products, skus, stock */
  const products: Product[] = [];
  const skus: Sku[] = [];
  const openingMovements: StockMovement[] = [];

  // Brands are a master now, so the seed creates the rows rather than writing
  // the name onto the product — `Product.brand` is composed on read and a
  // string written there would have nothing behind it.
  const brandByName = new Map<string, string>();
  for (const name of new Set(CATALOG.map((e) => e.brand))) {
    const brand: Brand = {
      id: store.nextId('brd'),
      companyId,
      name,
      active: true,
    };
    store.brands.push(brand);
    brandByName.set(name, brand.id);
  }

  for (const entry of CATALOG) {
    const product: Product = {
      id: store.nextId('prd'),
      companyId,
      name: entry.name,
      categoryId: categoryByName.get(entry.category)!,
      brandId: brandByName.get(entry.brand),
      active: true,
      createdAt: SEED_AT,
    };
    products.push(product);

    for (const s of entry.skus) {
      const sku: Sku = {
        id: store.nextId('sku'),
        productId: product.id,
        code: s.code,
        name: s.name,
        barcode: s.barcode,
        uomId: uoms[s.uom].id,
        taxId: taxes[s.tax].id,
        purchasePrice: s.purchasePrice,
        sellingPrice: s.sellingPrice,
        mrp: s.sellingPrice,
        minStock: s.minStock,
        reorderLevel: s.reorderLevel,
        active: true,
      };
      skus.push(sku);

      // Stores hold shelf stock; warehouses hold the bulk behind them.
      const bulkCentral = Math.ceil((s.openingA + s.openingB) * 0.8);
      const bulkSouth = s.openingB >= 30 ? Math.floor(s.openingB * 0.5) : 0;

      for (const [location, qty] of [
        [storeA, s.openingA],
        [storeB, s.openingB],
        [whCentral, bulkCentral],
        [whSouth, bulkSouth],
      ] as const) {
        if (qty <= 0) continue;
        openingMovements.push({
          id: store.nextId('mov'),
          skuId: sku.id,
          locationId: location.id,
          type: 'opening',
          qty: signedQty('opening', qty),
          refType: 'opening',
          refId: 'opening-balance',
          unitCost: s.purchasePrice,
          createdBy: SEED_ACTOR,
          createdAt: SEED_AT,
        });
      }
    }
  }

  store.products = products;
  store.skus = skus;
  store.movements = openingMovements;

  /* ------------------------------------------------ purchases (light seed) */
  const restockSkus = skus.slice(0, 3);
  const po: (typeof store.purchaseOrders)[number] = {
    id: store.nextId('po'),
    number: store.nextNumber('PO', whCentral.code),
    supplierId: store.suppliers[0]!.id,
    locationId: whCentral.id,
    status: 'sent',
    lines: restockSkus.map((sku) => ({ skuId: sku.id, qty: 24, receivedQty: 0, unitCost: sku.purchasePrice })),
    expectedAt: '2026-08-20T04:00:00.000Z',
    createdBy: SEED_ACTOR,
    createdAt: SEED_AT,
  };
  store.purchaseOrders = [po];

  /* ------------------- one replenishment run still in transit (WH -> store) */
  const inTransitSku = skus.find((s) => s.code === 'TEA-500G')!;
  const inTransitQty = 10;
  const transfer: StockTransfer = {
    id: store.nextId('trf'),
    number: store.nextNumber('TRF', storeA.code),
    fromLocationId: whCentral.id,
    toLocationId: storeB.id,
    lines: [{ skuId: inTransitSku.id, qty: inTransitQty, receivedQty: 0 }],
    status: 'in_transit',
    note: 'Weekly replenishment run',
    dispatchedBy: SEED_ACTOR,
    dispatchedAt: SEED_AT,
  };
  store.transfers = [transfer];
  store.movements.push({
    id: store.nextId('mov'),
    skuId: inTransitSku.id,
    locationId: storeA.id,
    type: 'transfer_out',
    qty: signedQty('transfer_out', inTransitQty),
    refType: 'transfer',
    refId: transfer.id,
    createdBy: SEED_ACTOR,
    createdAt: SEED_AT,
  });

  /* ------------------------------- a few of today's invoices for day-end */
  const today = store.businessDate();
  const counterId = 'counter-1';
  const findSku = (code: string) => skus.find((s) => s.code === code)!;
  const taxFor = (sku: Sku) => store.taxes.find((t) => t.id === sku.taxId)!;

  const buildInvoice = (
    lines: { sku: Sku; qty: number }[],
    tender: { methodId: string; at: string },
    customerName: string,
  ): { invoice: Invoice; payment: Payment; movements: StockMovement[] } => {
    const priced: SaleLine[] = lines.map((l, i) =>
      priceLine({ id: `line_${i + 1}`, sku: l.sku, tax: taxFor(l.sku), qty: l.qty }),
    );
    const totals = calcTotals(priced);
    const invoiceId = store.nextId('inv');
    const invoice: Invoice = {
      id: invoiceId,
      number: store.nextNumber('INV', storeA.code),
      storeId: storeA.id,
      counterId,
      customerName,
      businessDate: today,
      status: 'paid',
      lines: priced,
      totals,
      amountPaid: totals.grandTotal,
      amountDue: 0,
      createdBy: SEED_ACTOR,
      createdAt: `${today}T${tender.at}.000Z`,
    };
    const payment: Payment = {
      id: store.nextId('pay'),
      invoiceId,
      storeId: storeA.id,
      counterId,
      businessDate: today,
      paymentMethodId: tender.methodId,
      amount: totals.grandTotal,
      status: 'success',
      idempotencyKey: `seed_${invoiceId}`,
      createdBy: SEED_ACTOR,
      createdAt: `${today}T${tender.at}.000Z`,
    };
    const movements = priced.map<StockMovement>((line) => ({
      id: store.nextId('mov'),
      skuId: line.skuId,
      locationId: storeA.id,
      type: 'sale',
      qty: signedQty('sale', line.qty),
      refType: 'invoice',
      refId: invoiceId,
      createdBy: SEED_ACTOR,
      createdAt: `${today}T${tender.at}.000Z`,
    }));
    return { invoice, payment, movements };
  };

  const seededSales = [
    buildInvoice([{ sku: findSku('ATT-5KG'), qty: 1 }, { sku: findSku('MLK-1L'), qty: 2 }], { methodId: cash.id, at: '04:12:00' }, 'Walk-in Customer'),
    buildInvoice([{ sku: findSku('CHP-52G'), qty: 4 }, { sku: findSku('COK-750'), qty: 2 }], { methodId: upi.id, at: '05:40:00' }, 'Walk-in Customer'),
    buildInvoice([{ sku: findSku('TPS-200G'), qty: 1 }, { sku: findSku('SOP-100G'), qty: 3 }], { methodId: cash.id, at: '06:55:00' }, 'Lakshmi Iyer'),
  ];

  for (const sale of seededSales) {
    store.invoices.push(sale.invoice);
    store.payments.push(sale.payment);
    store.movements.push(...sale.movements);
  }

  store.bumpAudit({
    entity: 'company',
    entityId: companyId,
    action: 'create',
    summary: 'Seeded mock dataset',
    actorId: SEED_ACTOR,
  });

  return store;
}
