import type { CompanyPatch, NewCompany } from '@shop/data';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '../repositories-provider.tsx';

/** Platform administration. Every call here is super-admin only, server-side. */
export function useCompanies() {
  const repos = useRepositories();
  return useQuery({ queryKey: ['platform', 'companies'], queryFn: () => repos.platform.companies() });
}

export function useCreateCompany() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCompany) => repos.platform.createCompany(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform'] }),
  });
}

export function useUpdateCompany() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CompanyPatch }) =>
      repos.platform.updateCompany(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform'] }),
  });
}

export function useDeleteCompany() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) =>
      repos.platform.deleteCompany(id, confirmName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform'] }),
  });
}

/** Users of any company. Super admin only — the server enforces it. */
export function useCompanyUsers(companyId: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['platform', 'users', companyId],
    queryFn: () => repos.platform.usersIn(companyId!),
    enabled: Boolean(companyId),
  });
}

export function useCompanyRoles(companyId: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['platform', 'roles', companyId],
    queryFn: () => repos.platform.rolesIn(companyId!),
    enabled: Boolean(companyId),
  });
}

export function useCreateUserInCompany() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      companyId,
      ...input
    }: {
      companyId: string;
      name: string;
      email: string;
      phone?: string;
      roleId: string;
      password: string;
      storeIds: string[];
      locationIds: string[];
    }) => repos.platform.createUserIn(companyId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform'] }),
  });
}

/**
 * Resets someone's password to a known value. This is the closest thing to
 * "viewing" a password that can exist: hashes are one-way, so restoring access
 * means replacing the credential, never reading it.
 */
export function useSetUserPassword() {
  const repos = useRepositories();
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      repos.platform.setPassword(userId, password),
  });
}

export function useDeleteUser() {
  const repos = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => repos.platform.deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform'] }),
  });
}
