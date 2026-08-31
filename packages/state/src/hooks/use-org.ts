import type { LocationKind } from '@shop/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../query-keys';
import { useRepositories } from '../repositories-provider';
import { useSessionStore } from '../session';

export function useCompany() {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.company, queryFn: () => repos.org.company() });
}

export function useStores() {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.stores, queryFn: () => repos.org.stores() });
}

/**
 * Stores the signed-in user may actually work in. An empty `storeIds` on the
 * user means company-wide access.
 */
export function useAccessibleStores() {
  const query = useStores();
  const user = useSessionStore((s) => s.user);

  const data = useMemo(() => {
    const all = query.data ?? [];
    // Treat a missing list the same as an empty one. A server that forgets the
    // field should narrow nobody's access, not take the whole app down.
    const scoped = user?.storeIds ?? [];
    if (!user || scoped.length === 0) return all;
    return all.filter((store) => scoped.includes(store.id));
  }, [query.data, user]);

  return { ...query, data };
}

/** Every warehouse in the company — warehouses are not owned by a store. */
export function useWarehouses() {
  const repos = useRepositories();
  return useQuery({ queryKey: qk.warehouses, queryFn: () => repos.org.warehouses() });
}

/** Every stock location, stores and warehouses alike. */
export function useLocations(kind?: LocationKind, includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.locations(kind), includeInactive],
    queryFn: () => repos.org.locations(kind, includeInactive),
  });
}

/** Warehouses allowed to replenish a given store. */
export function useLinkedWarehouses(storeId: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.linkedWarehouses(storeId ?? 'none'),
    queryFn: () => repos.org.linkedWarehouses(storeId!),
    enabled: Boolean(storeId),
  });
}

export function useStoreWarehouseLinks() {
  const repos = useRepositories();
  return useQuery({ queryKey: ['store-warehouse-links'], queryFn: () => repos.org.links() });
}

export function useUsers() {
  const repos = useRepositories();
  return useQuery({ queryKey: ['users'], queryFn: () => repos.users.list() });
}

export function useRoles() {
  const repos = useRepositories();
  return useQuery({ queryKey: ['roles'], queryFn: () => repos.users.roles() });
}

export function useAuditLog(limit = 50) {
  const repos = useRepositories();
  return useQuery({ queryKey: [...qk.audit, limit], queryFn: () => repos.audit.list(limit) });
}
