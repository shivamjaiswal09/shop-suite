import type { Category, ReasonCode, Tax } from '@shop/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';

/** The category master, ordered for merchandising. */
export function useCategories(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['masters', 'categories', includeInactive],
    queryFn: () => repos.masters.categories(includeInactive),
    staleTime: 60_000,
  });
}

/** Category lookup by id — what the product screens join against. */
export function useCategoryMap(): Map<string, Category> {
  const { data } = useCategories(true);
  return useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data]);
}

export function useTaxes(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.taxes, includeInactive],
    queryFn: () => repos.masters.taxes(includeInactive),
    staleTime: Infinity,
  });
}

/** Tax lookup by id — the shape pricing helpers want. */
export function useTaxMap(): Map<string, Tax> {
  const { data } = useTaxes();
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t])), [data]);
}

export function useUnitsOfMeasure(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.uoms, includeInactive],
    queryFn: () => repos.masters.unitsOfMeasure(includeInactive),
    staleTime: Infinity,
  });
}

export function useCustomers(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.customers, includeInactive],
    queryFn: () => repos.masters.customers(includeInactive),
  });
}

export function useSuppliers(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.suppliers, includeInactive],
    queryFn: () => repos.masters.suppliers(includeInactive),
  });
}

export function usePaymentMethods(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.paymentMethods, includeInactive],
    queryFn: () => repos.masters.paymentMethods(includeInactive),
    staleTime: Infinity,
  });
}

export function useReasonCodes(usage?: ReasonCode['usage'], includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.reasonCodes(usage), includeInactive],
    queryFn: () => repos.masters.reasonCodes(usage, includeInactive),
  });
}
