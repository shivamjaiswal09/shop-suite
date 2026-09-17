/**
 * The transport every HTTP repository slice shares.
 *
 * `credentials: 'include'` is the whole point: authentication is an httpOnly
 * session cookie, so the browser must be allowed to attach it. Nothing here
 * ever sees or stores a token.
 */
export interface HttpConfig {
  baseUrl: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | undefined>;

const withQuery = (path: string, query?: Query) => {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

export function createFetcher(config: HttpConfig) {
  async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const response = await fetch(`${config.baseUrl}${withQuery(path, query)}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      // The API answers with { error } — surface that, not a bare status code,
      // because these messages are written to be shown to a cashier.
      const detail = await response.json().catch(() => null);
      throw new ApiError(response.status, detail?.error ?? `Request failed (${response.status})`);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    /** Escape hatch for verbs that need a body, such as a confirmed DELETE. */
    request,
    get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
    /**
     * A binary GET — a PDF, not JSON.
     *
     * It repeats the request shape rather than reusing `request` because the
     * success path must not parse the body, while the failure path still has to
     * read the API's `{ error }` so the cashier sees a sentence.
     */
    blob: async (path: string, query?: Query): Promise<Blob> => {
      const response = await fetch(`${config.baseUrl}${withQuery(path, query)}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new ApiError(response.status, detail?.error ?? `Request failed (${response.status})`);
      }
      return response.blob();
    },
  };
}

export type Fetcher = ReturnType<typeof createFetcher>;

/**
 * Postgres returns Decimal columns as strings to avoid precision loss in JSON.
 * Every money and quantity field crossing this boundary must go through here —
 * `Number()` on a whole payload would be easy and wrong.
 */
export const num = (value: unknown): number =>
  typeof value === 'number' ? value : Number(value ?? 0);
