import type { NewOrder, OrderFilter } from '@shop/data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';

export function useOrders(filter: OrderFilter = {}) {
  const repos = useRepositories();
  return useQuery({ queryKey: [...qk.orders, filter], queryFn: () => repos.orders.list(filter) });
}

/** Confirming an order reserves stock — available drops, on-hand does not. */
export function useCreateOrder() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewOrder) => repos.orders.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.orders });
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

/** Consumes the reservation and writes the sale movements. */
export function useConvertOrderToInvoice() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, counterId, createdBy }: { orderId: string; counterId: string; createdBy: string }) =>
      repos.orders.convertToInvoice(orderId, counterId, createdBy),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.orders });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}
