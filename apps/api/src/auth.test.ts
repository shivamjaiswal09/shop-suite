import { describe, expect, it } from 'vitest';
import { mayProceedWithStalePassword } from './auth.ts';

/**
 * A password an administrator chose is a handover, and the gate that forces it
 * to be replaced has to live here rather than in a screen: a screen stops an
 * honest user of the current build and nobody else — not an older build that
 * has never heard of the flag, not curl.
 *
 * So what is worth testing is the policy itself, and particularly that it fails
 * closed. A list of what is *allowed* only stays correct if the default for
 * everything not on it is "no".
 */
describe('mayProceedWithStalePassword', () => {
  it('lets them find out who they are', () => {
    // Without this the client cannot discover it must show the change screen.
    expect(mayProceedWithStalePassword('/auth/me')).toBe(true);
  });

  it('lets them change the password', () => {
    expect(mayProceedWithStalePassword('/auth/change-password')).toBe(true);
  });

  it('lets them sign in and out', () => {
    // Trapping someone signed in with no way to leave is its own bug.
    expect(mayProceedWithStalePassword('/auth/login')).toBe(true);
    expect(mayProceedWithStalePassword('/auth/logout')).toBe(true);
  });

  it('keeps the health check open', () => {
    // Uptime monitoring must not depend on any user's password state.
    expect(mayProceedWithStalePassword('/health')).toBe(true);
  });

  it('refuses the rest of the application', () => {
    for (const route of [
      '/invoices',
      '/orders',
      '/roles',
      '/users',
      '/stock/movements',
      '/closings',
      '/companies',
    ]) {
      expect(mayProceedWithStalePassword(route)).toBe(false);
    }
  });

  it('refuses a parameterised route', () => {
    // Matched on the registered pattern, so no URL shape slips past the list.
    expect(mayProceedWithStalePassword('/users/:id')).toBe(false);
    expect(mayProceedWithStalePassword('/roles/:id')).toBe(false);
    expect(mayProceedWithStalePassword('/users/:id/password')).toBe(false);
  });

  it('fails closed on an unknown route', () => {
    // If Fastify cannot tell us what was matched, we cannot reason about it,
    // and the safe answer to "may this stale-password caller proceed" is no.
    expect(mayProceedWithStalePassword(undefined)).toBe(false);
    expect(mayProceedWithStalePassword('')).toBe(false);
  });

  it('does not open a route merely because it starts with an allowed one', () => {
    // Set membership, not prefix matching — /auth/me-something is not /auth/me.
    expect(mayProceedWithStalePassword('/auth/change-password/confirm')).toBe(false);
    expect(mayProceedWithStalePassword('/auth/mefoo')).toBe(false);
  });
});
