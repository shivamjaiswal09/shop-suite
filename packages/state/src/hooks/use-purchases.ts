import type { NewGoodsReceipt, NewPurchaseOrder, NewPurchaseReturn, NewSalesReturn } from '@shop/data';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';

const invalidatePurchases = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: ['purchases'] });
  void queryClient.invalidateQueries({ queryKey: qk.stock });
  void queryClient.invalidateQueries({ queryKey: qk.audit });
};

export function usePurchaseOrders() {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.purchaseOrders, queryFn: () => repos.purchases.listOrders() });
}

export function useGoodsReceipts() {
  const repos = useRepositories();
  return useQuery({ queryKey: ['purchases', 'receipts'], queryFn: () => repos.purchases.listReceipts() });
}

export function usePurchaseReturns() {
  const repos = useRepositories();
  return useQuery({ queryKey: ['purchases', 'returns'], queryFn: () => repos.purchases.listReturns() });
}

export function useCreatePurchaseOrder() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewPurchaseOrder) => repos.purchases.createOrder(input),
    onSuccess: () => invalidatePurchases(queryClient),
  });
}

export function useReceiveGoods() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewGoodsReceipt) => repos.purchases.receive(input),
    onSuccess: () => invalidatePurchases(queryClient),
  });
}

export function useCreatePurchaseReturn() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewPurchaseReturn) => repos.purchases.createReturn(input),
    onSuccess: () => invalidatePurchases(queryClient),
  });
}

export function useCancelPurchaseOrder() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actorId }: { id: string; actorId: string }) =>
      repos.purchases.cancelOrder(id, actorId),
    onSuccess: () => invalidatePurchases(queryClient),
  });
}

/* ---------------------------------------------------------- sales returns */

export function useSalesReturns(filter: { storeId?: string; invoiceId?: string } = {}) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['sales-returns', filter],
    queryFn: () => repos.salesReturns.list(filter),
  });
}

export function useCreateSalesReturn() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSalesReturn) => repos.salesReturns.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: qk.closing });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}
