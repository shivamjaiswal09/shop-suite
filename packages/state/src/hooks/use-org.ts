import type { LocationKind } from '@shop/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { qk } from '../query-keys';
import { STALE } from '../query-client';
import { useRepositories } from '../repositories-provider';
import { useSessionStore } from '../session';

/*
 * The shape of the organisation: which company, which stores and warehouses,
 * who works there. All of it is edited by an admin from an onboarding screen,
 * never by the till during a shift, so five minutes of staleness costs nothing
 * and saves a request on every screen that renders a store switcher.
 *
 * The audit log is the exception — it is read precisely to see what just
 * happened, so it stays live.
 */

export function useCompany() {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.company,
    queryFn: () => repos.org.company(),
    staleTime: STALE.ORG,
  });
}

export function useStores() {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.stores,
    queryFn: () => repos.org.stores(),
    staleTime: STALE.ORG,
  });
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
  return useQuery({
    queryKey: qk.warehouses,
    queryFn: () => repos.org.warehouses(),
    staleTime: STALE.ORG,
  });
}

/** Every stock location, stores and warehouses alike. */
export function useLocations(kind?: LocationKind, includeInactive = false) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.locations(kind), includeInactive],
    queryFn: () => repos.org.locations(kind, includeInactive),
    staleTime: STALE.ORG,
  });
}

/** Warehouses allowed to replenish a given store. */
export function useLinkedWarehouses(storeId: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: qk.linkedWarehouses(storeId ?? 'none'),
    queryFn: () => repos.org.linkedWarehouses(storeId!),
    enabled: Boolean(storeId),
    staleTime: STALE.ORG,
  });
}

export function useStoreWarehouseLinks() {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['store-warehouse-links'],
    queryFn: () => repos.org.links(),
    staleTime: STALE.ORG,
  });
}

export function useUsers() {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['users'],
    queryFn: () => repos.users.list(),
    staleTime: STALE.ORG,
  });
}

export function useRoles() {
  const repos = useRepositories();
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => repos.users.roles(),
    staleTime: STALE.ORG,
  });
}

/** Read to see what just happened, so it is never served from cache. */
export function useAuditLog(limit = 50) {
  const repos = useRepositories();
  return useQuery({
    queryKey: [...qk.audit, limit],
    queryFn: () => repos.audit.list(limit),
    staleTime: STALE.LIVE,
  });
}
