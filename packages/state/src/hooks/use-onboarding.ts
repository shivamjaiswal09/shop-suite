import type {
  CategoryPatch,
  CustomerPatch,
  LocationPatch,
  NewCategory,
  NewCustomer,
  NewLocation,
  NewPaymentMethod,
  NewReasonCode,
  NewStoreWarehouseLink,
  NewSupplier,
  NewTax,
  NewUnitOfMeasure,
  NewUser,
  PaymentMethodPatch,
  ProductPatch,
  ReasonCodePatch,
  SkuPatch,
  SupplierPatch,
  TaxPatch,
  UnitOfMeasurePatch,
  UserPatch,
} from '@shop/data';
import type { NewRole, RolePatch } from '@shop/core';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';
import { STALE } from '../query-client';

interface Patch<T> {
  id: string;
  patch: T;
  actorId: string;
}

/** Masters are read almost everywhere, so a create invalidates broadly. */
const invalidateMasters = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: ['masters'] });
  void queryClient.invalidateQueries({ queryKey: qk.audit });
};

const invalidateOrg = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: ['locations'] });
  void queryClient.invalidateQueries({ queryKey: qk.stores });
  void queryClient.invalidateQueries({ queryKey: ['store-warehouse-links'] });
  void queryClient.invalidateQueries({ queryKey: qk.stock });
  void queryClient.invalidateQueries({ queryKey: qk.audit });
};

export function useCreateLocation() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewLocation) => repos.org.createLocation(input),
    onSuccess: () => invalidateOrg(queryClient),
  });
}

export function useLinkWarehouse() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewStoreWarehouseLink) => repos.org.linkWarehouse(input),
    onSuccess: () => invalidateOrg(queryClient),
  });
}

export function useUnlinkWarehouse() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, actorId }: { linkId: string; actorId: string }) =>
      repos.org.unlinkWarehouse(linkId, actorId),
    onSuccess: () => invalidateOrg(queryClient),
  });
}

export function useCreateUser() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewUser) => repos.users.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useCreateCategory() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCategory) => repos.masters.createCategory(input),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useUpdateCategory() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<CategoryPatch>) =>
      repos.masters.updateCategory(id, patch, actorId),
    onSuccess: () => {
      invalidateMasters(queryClient);
      void queryClient.invalidateQueries({ queryKey: qk.products });
    },
  });
}

export function useCreateUnitOfMeasure() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewUnitOfMeasure) => repos.masters.createUnitOfMeasure(input),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useCreateTax() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTax) => repos.masters.createTax(input),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useCreateCustomer() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCustomer) => repos.masters.createCustomer(input),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useCreateSupplier() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSupplier) => repos.masters.createSupplier(input),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useCreatePaymentMethod() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewPaymentMethod) => repos.masters.createPaymentMethod(input),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useCreateReasonCode() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewReasonCode) => repos.masters.createReasonCode(input),
    onSuccess: () => invalidateMasters(queryClient),
  });
}


/* --------------------------------------------------------------- updates */

export function useUpdateLocation() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<LocationPatch>) =>
      repos.org.updateLocation(id, patch, actorId),
    onSuccess: () => invalidateOrg(queryClient),
  });
}

export function useSetPrimaryWarehouse() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, actorId }: { linkId: string; actorId: string }) =>
      repos.org.setPrimaryWarehouse(linkId, actorId),
    onSuccess: () => invalidateOrg(queryClient),
  });
}

export function useUpdateUser() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<UserPatch>) => repos.users.update(id, patch, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useUpdateUnitOfMeasure() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<UnitOfMeasurePatch>) =>
      repos.masters.updateUnitOfMeasure(id, patch, actorId),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useUpdateTax() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<TaxPatch>) => repos.masters.updateTax(id, patch, actorId),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useUpdateCustomer() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<CustomerPatch>) =>
      repos.masters.updateCustomer(id, patch, actorId),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useUpdateSupplier() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<SupplierPatch>) =>
      repos.masters.updateSupplier(id, patch, actorId),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useUpdatePaymentMethod() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<PaymentMethodPatch>) =>
      repos.masters.updatePaymentMethod(id, patch, actorId),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useUpdateReasonCode() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<ReasonCodePatch>) =>
      repos.masters.updateReasonCode(id, patch, actorId),
    onSuccess: () => invalidateMasters(queryClient),
  });
}

export function useUpdateProduct() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<ProductPatch>) =>
      repos.products.updateProduct(id, patch, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.products });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

export function useUpdateSku() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<SkuPatch>) => repos.products.updateSku(id, patch, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.skus });
      void queryClient.invalidateQueries({ queryKey: qk.stock });
      void queryClient.invalidateQueries({ queryKey: qk.audit });
    },
  });
}

/* -------------------------------------------------------------------- roles */

/**
 * Role administration. Every one of these invalidates `roles` *and* the
 * permission-bearing queries, because changing a role changes what the person
 * looking at the screen may see — including, when they edit their own role, the
 * sidebar they are standing in.
 */
const invalidateRoles = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: ['roles'] });
  void queryClient.invalidateQueries({ queryKey: ['role-user-counts'] });
  void queryClient.invalidateQueries({ queryKey: ['users'] });
  void queryClient.invalidateQueries({ queryKey: qk.audit });
};

export function useRoleUserCounts() {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['role-user-counts'],
    queryFn: () => repos.users.roleUserCounts(),
    staleTime: STALE.ORG,
  });
}

export function useCreateRole() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, actorId }: { input: NewRole; actorId: string }) =>
      repos.users.createRole(input, actorId),
    onSuccess: () => invalidateRoles(queryClient),
  });
}

export function useUpdateRole() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch, actorId }: Patch<RolePatch>) =>
      repos.users.updateRole(id, patch, actorId),
    onSuccess: () => invalidateRoles(queryClient),
  });
}

export function useDeleteRole() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reassignToRoleId,
      actorId,
    }: {
      id: string;
      reassignToRoleId: string;
      actorId: string;
    }) => repos.users.deleteRole(id, reassignToRoleId, actorId),
    onSuccess: () => invalidateRoles(queryClient),
  });
}
