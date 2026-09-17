import type { Company, NewRole, Role, RolePatch, StockLocation, StoreWarehouseLink, User } from '@shop/core';
import type {
  AuthRepository,
  CompanyPatch,
  DeletedCompanyCounts,
  NewCompany,
  PlatformCompany,
  PlatformRepository,
  AuthSession,
  LocationPatch,
  NewLocation,
  NewStoreWarehouseLink,
  NewUser,
  OrgRepository,
  UserPatch,
  UserRepository,
} from '../repositories.ts';
import type { Fetcher } from './fetcher.ts';

/**
 * Company, locations, supply links, users and roles.
 *
 * `stores()`, `warehouses()` and the two `linked*` helpers are derived here
 * rather than given their own endpoints — they are filters over data the server
 * already returns, and an extra round trip per filter would buy nothing.
 */
export function createIdentityRepositories(fetcher: Fetcher): {
  auth: AuthRepository;
  platform: PlatformRepository;
  org: OrgRepository;
  users: UserRepository;
} {
  const auth: AuthRepository = {
    // The response body is incidental; what matters is the httpOnly Set-Cookie
    // the browser stores and replays. No token is ever handled here.
    signIn: async (email, password) => {
      await fetcher.post('/auth/login', { email, password });
      const session = await fetcher.get<AuthSession | { user: null }>('/auth/me');
      if (!('user' in session) || session.user === null) {
        throw new Error('Signed in but the session could not be read back');
      }
      return session as AuthSession;
    },

    signOut: async () => {
      await fetcher.post('/auth/logout');
    },

    me: async () => {
      const session = await fetcher.get<AuthSession | { user: null }>('/auth/me');
      return 'user' in session && session.user !== null ? (session as AuthSession) : null;
    },

    changePassword: async (currentPassword, newPassword) => {
      await fetcher.post('/auth/change-password', { currentPassword, newPassword });
    },
  };

  const locations = (kind?: 'store' | 'warehouse', includeInactive?: boolean) =>
    fetcher.get<StockLocation[]>('/locations', { kind, includeInactive });

  const links = () => fetcher.get<StoreWarehouseLink[]>('/links');

  const org: OrgRepository = {
    company: () => fetcher.get<Company>('/company'),
    locations: (kind, includeInactive) => locations(kind, includeInactive),
    stores: () => locations('store'),
    warehouses: () => locations('warehouse'),

    linkedWarehouses: async (storeId) => {
      const [all, linked] = await Promise.all([locations('warehouse'), links()]);
      const ids = new Set(linked.filter((l) => l.storeId === storeId).map((l) => l.warehouseId));
      return all.filter((w) => ids.has(w.id));
    },

    linkedStores: async (warehouseId) => {
      const [all, linked] = await Promise.all([locations('store'), links()]);
      const ids = new Set(linked.filter((l) => l.warehouseId === warehouseId).map((l) => l.storeId));
      return all.filter((s) => ids.has(s.id));
    },

    links,

    // `createdBy` / `actorId` are dropped on every write below: the server takes
    // the actor from the session cookie. A client-supplied author is a claim.
    createLocation: ({ createdBy: _createdBy, ...input }: NewLocation) =>
      fetcher.post<StockLocation>('/locations', input),

    updateLocation: (id, patch: LocationPatch) =>
      fetcher.patch<StockLocation>(`/locations/${id}`, patch),

    linkWarehouse: ({ createdBy: _createdBy, ...input }: NewStoreWarehouseLink) =>
      fetcher.post<StoreWarehouseLink>('/links', input),

    unlinkWarehouse: async (linkId) => {
      await fetcher.del(`/links/${linkId}`);
    },

    setPrimaryWarehouse: (linkId) =>
      fetcher.post<StoreWarehouseLink>(`/links/${linkId}/primary`),
  };

  const users: UserRepository = {
    list: () => fetcher.get<User[]>('/users'),

    byId: async (id) => {
      const all = await fetcher.get<User[]>('/users');
      return all.find((u) => u.id === id);
    },

    roles: () => fetcher.get<Role[]>('/roles'),

    roleUserCounts: () => fetcher.get<Record<string, number>>('/roles/user-counts'),

    // As everywhere else in this layer, the actor comes from the session cookie
    // — a client-supplied one is a claim, not a fact.
    createRole: (input: NewRole) => fetcher.post<Role>('/roles', input),

    updateRole: (id, patch: RolePatch) => fetcher.patch<Role>(`/roles/${id}`, patch),

    signOutRole: (id) => fetcher.post<{ signedOut: number }>(`/roles/${id}/sign-out`),

    deleteRole: async (id, reassignToRoleId) => {
      // Sent as a body rather than a query string: it is not a filter, it is
      // where every user holding this role ends up, and the server refuses
      // without it rather than orphaning them.
      await fetcher.request('DELETE', `/roles/${id}`, { reassignToRoleId });
    },

    /**
     * Deliberately unsupported. This existed only because the prototype logged
     * in on an email with no password; against a real server, authenticating
     * without a credential is not something this layer should be able to offer.
     * Sign-in goes through POST /auth/login, which sets the session cookie.
     */
    authenticate: () => {
      throw new Error(
        'Password sign-in goes through the API login endpoint, not the repository layer',
      );
    },

    create: ({ createdBy: _createdBy, ...input }: NewUser) => fetcher.post<User>('/users', input),

    update: (id, patch: UserPatch) => fetcher.patch<User>(`/users/${id}`, patch),
  };

  const platform: PlatformRepository = {
    companies: () => fetcher.get<PlatformCompany[]>('/companies'),
    createCompany: (input: NewCompany) => fetcher.post('/companies', input),
    updateCompany: (id, patch: CompanyPatch) => fetcher.patch(`/companies/${id}`, patch),

    deleteCompany: async (id, confirmName) => {
      const result = await fetcher.request<{ deleted: DeletedCompanyCounts }>(
        'DELETE',
        `/companies/${id}`,
        { confirmName },
      );
      return result.deleted;
    },

    // Every call below names the company explicitly, which only a super admin
    // may do — a tenant's session pins them to their own.
    usersIn: (companyId) => fetcher.get<User[]>('/users', { companyId }),
    rolesIn: (companyId) => fetcher.get<Role[]>('/roles', { companyId }),

    createUserIn: (companyId, input) => fetcher.post<User>('/users', { ...input, companyId }),

    setPassword: async (userId, password) => {
      await fetcher.post(`/users/${userId}/password`, { password });
    },

    deleteUser: async (userId) => {
      await fetcher.request('DELETE', `/users/${userId}`);
    },
  };

  return { auth, platform, org, users };
}
