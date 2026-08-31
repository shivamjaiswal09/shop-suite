import type { ClosingRequest, ResolveDiscrepancy, SubmitClosing } from '@shop/data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';

export function useClosingPreview(request: ClosingRequest | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.closingPreview(request ?? { storeId: 'none', counterId: 'none', businessDate: 'none' }),
    queryFn: () => repos.closing.preview(request!),
    enabled: Boolean(request),
  });
}

export function useClosings(storeId?: string) {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.closings(storeId), queryFn: () => repos.closing.list(storeId) });
}

export function useSubmitClosing() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitClosing) => repos.closing.submit(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.closing });
      void queryClient.invalidateQueries({ queryKey: ['discrepancies'] });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useApproveClosing() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ closingId, approvedBy }: { closingId: string; approvedBy: string }) =>
      repos.closing.approve(closingId, approvedBy),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.closing });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useDiscrepancies(storeId?: string) {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.discrepancies(storeId), queryFn: () => repos.discrepancies.list(storeId) });
}

export function useResolveDiscrepancy() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveDiscrepancy) => repos.discrepancies.resolve(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['discrepancies'] });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}
