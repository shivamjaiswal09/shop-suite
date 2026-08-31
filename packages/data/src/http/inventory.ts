import type {
  InventoryLevel,
  StockMovement,
  StockTransfer,
  TransferLine,
} from '@shop/core';
import type {
  MovementFilter,
  NewMovement,
  NewTransfer,
  ReceiveTransfer,
  StockRepository,
  TransferFilter,
  TransferRepository,
} from '../repositories';
import { ApiError, num, type Fetcher } from './fetcher';

/**
 * The inventory slice over HTTP.
 *
 * Nothing here folds anything. The ledger fold lives in @shop/core and runs on
 * the server against Postgres; this file's whole job is to move the already
 * derived projection across the wire without corrupting it — which mostly means
 * putting every Decimal through `num()`, because Postgres serialises them as
 * strings and `level.onHand + 1` on a string is a silent bug that reads fine.
 */

/** Decimal fields arrive as strings, so nothing numeric may be trusted raw. */
interface WireLevel {
  skuId: string;
  locationId: string;
  onHand: unknown;
  reserved: unknown;
  available: unknown;
  damaged: unknown;
  avgCost: unknown;
  value: unknown;
  lastMovementAt?: string;
}

interface WireMovement {
  id: string;
  skuId: string;
  locationId: string;
  type: StockMovement['type'];
  qty: unknown;
  refType: StockMovement['refType'];
  refId: string;
  reasonCodeId?: string;
  unitCost?: unknown;
  note?: string;
  createdBy: string;
  createdAt: string;
}

interface WireTransfer {
  id: string;
  number: string;
  fromLocationId: string;
  toLocationId: string;
  lines: { skuId: string; qty: unknown; receivedQty: unknown }[];
  status: StockTransfer['status'];
  note?: string;
  dispatchedBy: string;
  dispatchedAt: string;
  receivedBy?: string;
  receivedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
}

const toLevel = (wire: WireLevel): InventoryLevel => ({
  skuId: wire.skuId,
  locationId: wire.locationId,
  onHand: num(wire.onHand),
  reserved: num(wire.reserved),
  available: num(wire.available),
  damaged: num(wire.damaged),
  avgCost: num(wire.avgCost),
  value: num(wire.value),
  lastMovementAt: wire.lastMovementAt,
});

const toMovement = (wire: WireMovement): StockMovement => ({
  id: wire.id,
  skuId: wire.skuId,
  locationId: wire.locationId,
  type: wire.type,
  qty: num(wire.qty),
  refType: wire.refType,
  refId: wire.refId,
  reasonCodeId: wire.reasonCodeId,
  // Absent is not zero here: a movement with no cost must not restate avgCost.
  unitCost: wire.unitCost === undefined || wire.unitCost === null ? undefined : num(wire.unitCost),
  note: wire.note,
  createdBy: wire.createdBy,
  createdAt: wire.createdAt,
});

const toLine = (wire: WireTransfer['lines'][number]): TransferLine => ({
  skuId: wire.skuId,
  qty: num(wire.qty),
  receivedQty: num(wire.receivedQty),
});

const toTransfer = (wire: WireTransfer): StockTransfer => ({
  id: wire.id,
  number: wire.number,
  fromLocationId: wire.fromLocationId,
  toLocationId: wire.toLocationId,
  lines: wire.lines.map(toLine),
  status: wire.status,
  note: wire.note,
  dispatchedBy: wire.dispatchedBy,
  dispatchedAt: wire.dispatchedAt,
  receivedBy: wire.receivedBy,
  receivedAt: wire.receivedAt,
  cancelledBy: wire.cancelledBy,
  cancelledAt: wire.cancelledAt,
});

export function createInventoryRepositories(fetcher: Fetcher): {
  stock: StockRepository;
  transfers: TransferRepository;
} {
  const stock: StockRepository = {
    levelFor: async (skuId, locationId) =>
      toLevel(await fetcher.get<WireLevel>('/stock/level', { skuId, locationId })),

    levels: async (locationId) =>
      (await fetcher.get<WireLevel[]>('/stock/levels', { locationId })).map(toLevel),

    movements: async (filter: MovementFilter = {}) =>
      (
        await fetcher.get<WireMovement[]>('/stock/movements', {
          skuId: filter.skuId,
          locationId: filter.locationId,
          type: filter.type,
          limit: filter.limit,
        })
      ).map(toMovement),

    // `createdBy` rides along for interface parity; the server takes the actor
    // from the session cookie, which is the only claim it can actually verify.
    post: async (movements: NewMovement[]) =>
      (await fetcher.post<WireMovement[]>('/stock/movements', { movements })).map(toMovement),
  };

  const transfers: TransferRepository = {
    create: async (input: NewTransfer) =>
      toTransfer(
        await fetcher.post<WireTransfer>('/transfers', {
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          lines: input.lines,
          note: input.note,
          autoReceive: input.autoReceive ?? false,
        }),
      ),

    list: async (filter: TransferFilter = {}) =>
      (
        await fetcher.get<WireTransfer[]>('/transfers', {
          locationId: filter.locationId,
          status: filter.status,
        })
      ).map(toTransfer),

    byId: async (id) => {
      try {
        return toTransfer(await fetcher.get<WireTransfer>(`/transfers/${id}`));
      } catch (error) {
        // The contract is `undefined` for a miss; every other failure is real.
        if (error instanceof ApiError && error.status === 404) return undefined;
        throw error;
      }
    },

    receive: async (input: ReceiveTransfer) =>
      toTransfer(
        await fetcher.post<WireTransfer>(`/transfers/${input.transferId}/receive`, {
          lines: input.lines,
          note: input.note,
        }),
      ),

    cancel: async (transferId) =>
      toTransfer(await fetcher.post<WireTransfer>(`/transfers/${transferId}/cancel`, {})),
  };

  return { stock, transfers };
}
