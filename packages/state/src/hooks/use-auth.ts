import { useMutation } from '@tanstack/react-query';
import { useCartStore } from '../cart';
import { useRepositories } from '../repositories-provider';
import { useSessionStore } from '../session';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Sign-in. Against the API this exchanges a real credential for an httpOnly
 * session cookie; against the mock it resolves a seeded user. Either way the
 * session store ends up holding the same shape, so no screen knows which.
 */
export function useLogin() {
  const repos = useRepositories();
  const signIn = useSessionStore((s) => s.signIn);

  return useMutation({
    mutationFn: async ({ email, password }: Credentials) => {
      const session = await repos.auth.signIn(email, password);

      // A super admin belongs to no company, so asking for one — or for its
      // stores — is a 400 by design. They land on the platform console instead.
      if (session.user.isSuperAdmin) {
        return { user: session.user, company: null, store: null };
      }

      const company = session.company ?? (await repos.org.company());
      const allStores = await repos.org.stores();
      // An empty access list means every store in the company.
      const permitted = session.locationIds.length
        ? allStores.filter((s) => session.locationIds.includes(s.id))
        : allStores;
      const store = permitted[0] ?? allStores[0];

      // A super admin has no company and no stores — they administer, not sell.
      if (!store && !session.user.isSuperAdmin) {
        throw new AuthError('This user has no store access yet');
      }

      return { user: session.user, company, store: store ?? null };
    },
    onSuccess: (payload) => signIn(payload),
  });
}

/** Restores a session on reload — the cookie outlives the page. */
export function useRestoreSession() {
  const repos = useRepositories();
  const signIn = useSessionStore((s) => s.signIn);

  return useMutation({
    mutationFn: async () => {
      const session = await repos.auth.me();
      if (!session) return null;
      if (session.user.isSuperAdmin) return { user: session.user, company: null, store: null };
      const company = session.company ?? (await repos.org.company());
      const stores = await repos.org.stores();
      const store = session.locationIds.length
        ? stores.find((s) => session.locationIds.includes(s.id))
        : stores[0];
      return store ? { user: session.user, company, store } : null;
    },
    onSuccess: (payload) => {
      if (payload) signIn(payload);
    },
  });
}

export function useLogout() {
  const repos = useRepositories();
  const signOut = useSessionStore((s) => s.signOut);
  const clearCart = useCartStore((s) => s.clear);
  return () => {
    // Drop the server session too, or the cookie would sign us straight back in.
    void repos.auth.signOut().catch(() => {});
    clearCart();
    signOut();
  };
}
