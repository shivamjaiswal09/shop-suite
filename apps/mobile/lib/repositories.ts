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

export const repositories: Repositories = apiUrl
  ? createHttpRepositories({ baseUrl: apiUrl })
  : createMockRepositories();
