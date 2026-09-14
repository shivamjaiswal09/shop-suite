import { resolveSignInLanding } from '@shop/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
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

/**
 * Restores a session on reload — the cookie outlives the page.
 *
 * A query rather than a mutation: it reads, it is idempotent, and React Query
 * then owns the deduplication. As a mutation the per-call callbacks were lost
 * whenever StrictMode tore the observer down between its two development
 * mounts, so `settled` never flipped and the app sat on its loading screen
 * forever.
 *
 * Returns `settled` rather than the session, because the only thing the caller
 * needs is whether the question has been answered yet — the answer itself goes
 * into the session store.
 */
export function useRestoreSession(): { settled: boolean } {
  const repos = useRepositories();
  const signIn = useSessionStore((s) => s.signIn);

  const { data, isPending } = useQuery({
    queryKey: ['session', 'restore'],
    queryFn: async () => {
      const session = await repos.auth.me();
      if (!session) return null;
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
      // Restoring has to agree with signing in. Refusing a store-less admin
      // here would sign them out on every refresh, which reads as the login
      // having silently failed rather than as a rule being applied.
      if (!landing.ok) return null;
      return { user: session.user, company, store: landing.store };
    },
    // Asked once per page load. Refetching it would re-run sign-in against a
    // cookie that has not changed.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    // A failure here means "not signed in"; retrying holds the whole app on a
    // loading screen while it does.
    retry: false,
  });

  useEffect(() => {
    if (data) signIn(data);
  }, [data, signIn]);

  return { settled: !isPending };
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
