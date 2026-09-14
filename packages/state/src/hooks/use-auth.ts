import { resolveSignInLanding } from '@shop/core';
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
      const landing = resolveSignInLanding({
        isSuperAdmin: session.user.isSuperAdmin,
        permissions: session.permissions,
        locationIds: session.locationIds,
        stores: await repos.org.stores(),
      });
      if (!landing.ok) throw new AuthError(landing.reason);

      return { user: session.user, company, store: landing.store };
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
      const landing = resolveSignInLanding({
        isSuperAdmin: session.user.isSuperAdmin,
        permissions: session.permissions,
        locationIds: session.locationIds,
        stores: await repos.org.stores(),
      });
      // Restoring has to agree with signing in. Returning null for a store-less
      // admin would sign them out on every refresh, which reads as the login
      // silently failing rather than as a rule being applied.
      if (!landing.ok) return null;
      return { user: session.user, company, store: landing.store };
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
