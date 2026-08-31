import type { NewProduct, NewSku } from '@shop/data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';

export function useProducts(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.products, includeInactive],
    queryFn: () => repos.products.listProducts(includeInactive),
  });
}

export function useSkus(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.skus, includeInactive],
    queryFn: () => repos.products.listSkus(includeInactive),
    staleTime: 60_000,
  });
}

/** Type-ahead over code / name, with an exact barcode match ranked first. */
export function useSkuSearch(term: string) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.skuSearch(term),
    queryFn: () => repos.products.searchSkus(term),
    enabled: term.trim().length > 0,
  });
}

/** Imperative barcode lookup — what a scanner's Enter keystroke calls. */
export function useScanLookup() {
  const repos = useRepositories();
  return (barcode: string) => repos.products.skuByBarcode(barcode);
}

export function useCreateProduct() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProduct) => repos.products.createProduct(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

/** Creating a SKU with opening stock also appends its `opening` movement. */
export function useCreateSku() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSku) => repos.products.createSku(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.skus });
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}
