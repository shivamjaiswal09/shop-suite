import { describe, expect, it } from 'vitest';
import type {
  StockMovement,
  StockMovementType,
  StockReservation,
  StockTransfer,
} from '../entities/stock.ts';
import {
  aggregateInventoryLevels,
  deriveInboundInTransit,
  deriveInventoryLevel,
  signedQty,
  stockAlertFor,
} from './inventory.ts';

let seq = 0;
const movement = (
  type: StockMovementType,
  qty: number,
  extra: Partial<StockMovement> = {},
): StockMovement => ({
  id: `mov_${++seq}`,
  skuId: 'sku_1',
  locationId: 'wh_1',
  type,
  qty: signedQty(type, qty),
  refType: 'opening',
  refId: 'ref_1',
  createdBy: 'usr_1',
  createdAt: `2026-08-16T00:00:${String(seq).padStart(2, '0')}.000Z`,
  ...extra,
});

const derive = (movements: StockMovement[], reservations: StockReservation[] = []) =>
  deriveInventoryLevel({ skuId: 'sku_1', locationId: 'wh_1', movements, reservations });

describe('deriveInventoryLevel', () => {
  it('folds opening stock into on-hand and available', () => {
    const level = derive([movement('opening', 100, { unitCost: 40 })]);
    expect(level.onHand).toBe(100);
    expect(level.available).toBe(100);
    expect(level.value).toBe(4000);
  });

  it('reduces available when a sale is billed', () => {
    const level = derive([movement('opening', 100), movement('sale', 7, { refType: 'invoice' })]);
    expect(level.onHand).toBe(93);
    expect(level.available).toBe(93);
  });

  it('restores stock on a sale return', () => {
    const level = derive([
      movement('opening', 100),
      movement('sale', 7, { refType: 'invoice' }),
      movement('sale_return', 3, { refType: 'sales_return' }),
    ]);
    expect(level.onHand).toBe(96);
    expect(level.available).toBe(96);
  });

  it('reservations reduce available but not on-hand', () => {
    const reservation: StockReservation = {
      id: 'res_1',
      skuId: 'sku_1',
      locationId: 'wh_1',
      qty: 10,
      refType: 'order',
      refId: 'ord_1',
      status: 'active',
      createdAt: '2026-08-16T01:00:00.000Z',
    };
    const level = derive([movement('opening', 50)], [reservation]);
    expect(level.onHand).toBe(50);
    expect(level.reserved).toBe(10);
    expect(level.available).toBe(40);
  });

  it('ignores released reservations', () => {
    const released: StockReservation = {
      id: 'res_2',
      skuId: 'sku_1',
      locationId: 'wh_1',
      qty: 10,
      refType: 'order',
      refId: 'ord_2',
      status: 'released',
      createdAt: '2026-08-16T01:00:00.000Z',
    };
    expect(derive([movement('opening', 50)], [released]).available).toBe(50);
  });

  it('ignores movements from other locations and skus', () => {
    const level = derive([
      movement('opening', 50),
      movement('opening', 999, { locationId: 'wh_2' }),
      movement('opening', 999, { skuId: 'sku_2' }),
    ]);
    expect(level.onHand).toBe(50);
  });

  it('tracks damaged quantity separately while removing it from on-hand', () => {
    const level = derive([movement('opening', 20), movement('damage', 2, { refType: 'adjustment' })]);
    expect(level.onHand).toBe(18);
    expect(level.damaged).toBe(2);
  });

  it('honours the sign supplied on an adjustment', () => {
    const down = derive([movement('opening', 20), movement('adjustment', -5, { refType: 'stock_count' })]);
    const up = derive([movement('opening', 20), movement('adjustment', 5, { refType: 'stock_count' })]);
    expect(down.onHand).toBe(15);
    expect(up.onHand).toBe(25);
  });

  it('computes weighted-average cost across receipts', () => {
    const level = derive([
      movement('opening', 10, { unitCost: 100 }),
      movement('receipt', 10, { unitCost: 200, refType: 'goods_receipt' }),
    ]);
    expect(level.avgCost).toBe(150);
    expect(level.value).toBe(3000);
  });

  it('is order-independent for a shuffled ledger', () => {
    const ledger = [
      movement('opening', 100),
      movement('sale', 20, { refType: 'invoice' }),
      movement('sale_return', 5, { refType: 'sales_return' }),
    ];
    expect(derive([...ledger].reverse()).onHand).toBe(derive(ledger).onHand);
  });
});

describe('aggregateInventoryLevels', () => {
  const level = (locationId: string, onHand: number, reserved: number, avgCost: number) => ({
    skuId: 'sku_1',
    locationId,
    onHand,
    reserved,
    available: onHand - reserved,
    damaged: 0,
    avgCost,
    value: onHand * avgCost,
    lastMovementAt: `2026-08-1${locationId.length}T00:00:00.000Z`,
  });

  it('sums quantities across locations and re-derives a true weighted cost', () => {
    const rolled = aggregateInventoryLevels(
      [level('wh_1', 40, 5, 100), level('wh_2', 60, 0, 200)],
      'br_1',
    );
    expect(rolled.onHand).toBe(100);
    expect(rolled.reserved).toBe(5);
    expect(rolled.available).toBe(95);
    expect(rolled.value).toBe(16000);
    // Not the mean of 100 and 200 — weighted by quantity.
    expect(rolled.avgCost).toBe(160);
    expect(rolled.locationId).toBe('br_1');
  });

  it('returns an empty projection when there is nothing to roll up', () => {
    expect(aggregateInventoryLevels([], 'br_1').onHand).toBe(0);
  });
});

describe('deriveInboundInTransit', () => {
  const transfer = (
    id: string,
    toLocationId: string,
    status: StockTransfer['status'],
    qty: number,
  ): StockTransfer => ({
    id,
    number: `TRF-${id}`,
    fromLocationId: 'wh_src',
    toLocationId,
    lines: [{ skuId: 'sku_1', qty, receivedQty: 0 }],
    status,
    dispatchedBy: 'usr_1',
    dispatchedAt: '2026-08-16T00:00:00.000Z',
  });

  it('counts only in-transit transfers headed for the given location', () => {
    const inbound = deriveInboundInTransit(
      [
        transfer('a', 'wh_1', 'in_transit', 10),
        transfer('b', 'wh_1', 'in_transit', 5),
        transfer('c', 'wh_1', 'received', 100),
        transfer('d', 'wh_1', 'cancelled', 100),
        transfer('e', 'wh_2', 'in_transit', 100),
      ],
      'wh_1',
    );
    expect(inbound.get('sku_1')).toBe(15);
  });

  it('is empty when nothing is moving', () => {
    expect(deriveInboundInTransit([], 'wh_1').size).toBe(0);
  });
});

describe('stockAlertFor', () => {
  const level = (available: number) => ({
    skuId: 'sku_1',
    locationId: 'wh_1',
    onHand: available,
    reserved: 0,
    available,
    damaged: 0,
    avgCost: 0,
    value: 0,
  });

  it('flags out of stock, below min, and reorder bands', () => {
    expect(stockAlertFor(level(0), 5, 10)).toBe('out_of_stock');
    expect(stockAlertFor(level(3), 5, 10)).toBe('below_min');
    expect(stockAlertFor(level(9), 5, 10)).toBe('reorder');
    expect(stockAlertFor(level(50), 5, 10)).toBe('ok');
  });
});
