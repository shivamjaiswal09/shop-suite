import type { Category, ReasonCode, Tax } from '@shop/core';
import type { BillFieldPatch, BrandPatch, NewBillField, NewBrand } from '@shop/data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../query-keys';
import { STALE } from '../query-client';
import { useRepositories } from '../repositories-provider';

/*
 * Master data, and the only place in the app that should be cached for long.
 *
 * These were previously `staleTime: Infinity`, which reads like the strongest
 * possible caching and is in fact a correctness bug: a tax rate corrected by an
 * admin would never reach a till that already had the old one, for as long as
 * that app stayed open. STALE.REFERENCE is thirty minutes — long enough that a
 * shop on mobile data is not refetching the tax table all day, bounded enough
 * that a correction lands the same shift.
 */

/** The category master, ordered for merchandising. */
export function useCategories(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['masters', 'categories', includeInactive],
    queryFn: () => repos.masters.categories(includeInactive),
    staleTime: STALE.REFERENCE,
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
    staleTime: STALE.REFERENCE,
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
    staleTime: STALE.REFERENCE,
  });
}

/** Customers grow through the day at the till, so they are held less firmly. */
export function useCustomers(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.customers, includeInactive],
    queryFn: () => repos.masters.customers(includeInactive),
    staleTime: STALE.ORG,
  });
}

export function useSuppliers(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.suppliers, includeInactive],
    queryFn: () => repos.masters.suppliers(includeInactive),
    staleTime: STALE.ORG,
  });
}

export function usePaymentMethods(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.paymentMethods, includeInactive],
    queryFn: () => repos.masters.paymentMethods(includeInactive),
    staleTime: STALE.REFERENCE,
  });
}

export function useReasonCodes(usage?: ReasonCode['usage'], includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.reasonCodes(usage), includeInactive],
    queryFn: () => repos.masters.reasonCodes(usage, includeInactive),
    staleTime: STALE.REFERENCE,
  });
}

/**
 * The customer details this company asks for at the till.
 *
 * Reference data in that it changes rarely, but it decides what a cashier is
 * forced to type, so a correction has to reach the counter promptly rather than
 * at the end of a thirty-minute window.
 */
export function useBillFields(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['masters', 'bill-fields', includeInactive],
    queryFn: () => repos.masters.billFields(includeInactive),
    staleTime: STALE.ORG,
  });
}

export function useCreateBillField() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBillField) => repos.masters.createBillField(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['masters', 'bill-fields'] });
    },
  });
}

export function useUpdateBillField() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: { id: string; patch: BillFieldPatch; actorId: string }) =>
      repos.masters.updateBillField(id, patch, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['masters', 'bill-fields'] });
    },
  });
}

/**
 * Looks a walk-in up by phone. Held back until the number looks complete, so
 * the counter is not queried on every keystroke.
 */
export function useCustomerByPhone(phone: string | undefined) {
  const repos = useRepositories();
  const needle = (phone ?? '').trim();
  return useQuery({
    queryKey: ['masters', 'customer-by-phone', needle],
    queryFn: () => repos.masters.customerByPhone(needle),
    enabled: needle.length >= 10,
    staleTime: STALE.LIVE,
  });
}

/**
 * Brands and their sub-brands, flat. The caller splits the tree with
 * `topLevelBrands` / `subBrandsOf` from `@shop/core` rather than the server
 * sending it twice.
 */
export function useBrands(includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['masters', 'brands', includeInactive],
    queryFn: () => repos.masters.brands(includeInactive),
    staleTime: STALE.ORG,
  });
}

export function useCreateBrand() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewBrand) => repos.masters.createBrand(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['masters', 'brands'] });
      // A product's displayed brand is composed from these names.
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateBrand() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: { id: string; patch: BrandPatch; actorId: string }) =>
      repos.masters.updateBrand(id, patch, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['masters', 'brands'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
