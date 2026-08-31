import { createHttpRepositories, createMockRepositories, type Repositories } from '@shop/data';

/**
 * The single data-access binding for the web app.
 *
 * `VITE_API_URL` decides: set it (deployed, or `/api` locally with the server
 * running) and every screen reads Postgres through the API. Leave it unset and
 * the app falls back to the in-memory store, which keeps UI work possible
 * without a database — the fallback is explicit so nobody can mistake mock data
 * for real data by accident.
 */
const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

export const usingMockData = !apiUrl;

// A production build that quietly falls back to the mock is the worst outcome:
// it looks like a working app and every number in it is fiction. This turned a
// silent "incorrect email or password" into an obvious build misconfiguration.
if (!apiUrl && import.meta.env.PROD) {
  throw new Error(
    'VITE_API_URL is not set for this production build — refusing to start on mock data.',
  );
}

export const repositories: Repositories = apiUrl
  ? createHttpRepositories({ baseUrl: apiUrl })
  : createMockRepositories();
