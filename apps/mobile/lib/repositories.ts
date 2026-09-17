import { createHttpRepositories, createMockRepositories, type Repositories } from '@shop/data';

/**
 * The mobile app's data-access swap point.
 *
 * Unlike the web app there is no same-origin `/api` to fall back on — a phone
 * has no origin — so the URL must be absolute and baked in at build time.
 * `EXPO_PUBLIC_*` is inlined by Metro, so this is a constant in the bundle
 * rather than something read at runtime.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export const usingMockData = !apiUrl;

/**
 * A release build that quietly falls back to the mock is the worst outcome
 * available: it looks like a working app and every number in it is fiction —
 * fake stock, fake takings, at a real counter. The web app refuses to start in
 * that state and this must too.
 *
 * It matters more here than there. `EXPO_PUBLIC_*` is inlined by Metro at
 * bundle time, so an over-the-air update published without the variable set
 * ships a bundle hard-coded to the mock, straight onto phones that were working
 * a minute earlier. Nothing about that failure is visible: the app opens, signs
 * in, and sells imaginary stock.
 *
 * `__DEV__` keeps `pnpm mobile` on the mock, which is the whole point of the
 * fallback.
 */
if (!apiUrl && !__DEV__) {
  throw new Error(
    'EXPO_PUBLIC_API_URL was not set for this build — refusing to start on mock data.',
  );
}

export const repositories: Repositories = apiUrl
  ? createHttpRepositories({ baseUrl: apiUrl })
  : createMockRepositories();
