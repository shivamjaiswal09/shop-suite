import type { Company, StockLocation, User } from '@shop/core';
import { create } from 'zustand';

export interface SessionState {
  user: User | null;
  company: Company | null;
  /**
   * The store being sold from — billing, invoices and closing key to this.
   * Inventory screens scope themselves; the session holds no stock location.
   */
  store: StockLocation | null;
  /** Billing counter within the store. Single counter in Phase 1. */
  counterId: string;
  theme: 'light' | 'dark';

  signIn: (payload: { user: User; company: Company | null; store: StockLocation | null }) => void;
  signOut: () => void;
  setStore: (store: StockLocation) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

/**
 * Client/session state — identical on web and native. Deliberately holds no
 * server data: anything fetched lives in TanStack Query.
 */
export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  company: null,
  store: null,
  counterId: 'counter-1',
  theme: 'light',

  signIn: ({ user, company, store }) => set({ user, company, store }),
  signOut: () => set({ user: null, company: null, store: null }),
  setStore: (store) => set({ store }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  setTheme: (theme) => set({ theme }),
}));

export const useIsAuthenticated = () => useSessionStore((s) => s.user !== null);

/** A super admin administers the platform; they never sell, so they have no store. */
export const useIsSuperAdmin = () => useSessionStore((s) => s.user?.isSuperAdmin === true);

/** Throws if called before sign-in — use inside authenticated screens only. */
export function useActiveContext() {
  const store = useSessionStore((s) => s.store);
  const user = useSessionStore((s) => s.user);
  const counterId = useSessionStore((s) => s.counterId);
  if (!store || !user) throw new Error('No active session');
  return { store, user, counterId };
}
