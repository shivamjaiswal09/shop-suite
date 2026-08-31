import { deriveInboundInTransit } from '@shop/core';
import type { NewTransfer, ReceiveTransfer, TransferFilter } from '@shop/data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';

export function useTransfers(filter: TransferFilter = {}) {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.transfers(filter), queryFn: () => repos.transfers.list(filter) });
}

/** Quantity per SKU dispatched towards this location but not yet received. */
export function useInboundInTransit(locationId: string | undefined) {
  const transfers = useTransfers({ status: 'in_transit' });
  return useMemo(
    () => (locationId ? deriveInboundInTransit(transfers.data ?? [], locationId) : new Map<string, number>()),
    [transfers.data, locationId],
  );
}

const invalidateTransferViews = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: qk.stock });
  void queryClient.invalidateQueries({ queryKey: ['transfers'] });
  void queryClient.invalidateQueries({ queryKey: ['discrepancies'] });
  void queryClient.invalidateQueries({ queryKey: qk.audit });
};

export function useCreateTransfer() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTransfer) => repos.transfers.create(input),
    onSuccess: () => invalidateTransferViews(queryClient),
  });
}

export function useReceiveTransfer() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiveTransfer) => repos.transfers.receive(input),
    onSuccess: () => invalidateTransferViews(queryClient),
  });
}

export function useCancelTransfer() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transferId, cancelledBy }: { transferId: string; cancelledBy: string }) =>
      repos.transfers.cancel(transferId, cancelledBy),
    onSuccess: () => invalidateTransferViews(queryClient),
  });
}
