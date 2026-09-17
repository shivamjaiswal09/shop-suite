import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpRepositories } from './client.ts';

/**
 * What the client asks the API for.
 *
 * These assert URLs rather than behaviour because the bug they guard was a URL:
 * the printed sheet came back with only its top half, because this side sent a
 * default the API had no way to tell apart from a deliberate choice.
 */
const repos = () => createHttpRepositories({ baseUrl: '/api' });

const captureFetch = () => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, blob: async () => new Blob(['%PDF']) } as unknown as Response;
    }),
  );
  return calls;
};

afterEach(() => vi.unstubAllGlobals());

describe('the printable bill', () => {
  it('names no copy when none was asked for, so the API decides the sheet', async () => {
    const calls = captureFetch();
    await repos().invoices.pdf('inv_1');
    expect(calls[0]).toBe('/api/invoices/inv_1/pdf');
    expect(calls[0]).not.toContain('copy');
  });

  it('names the copy when one was asked for', async () => {
    const calls = captureFetch();
    await repos().invoices.pdf('inv_1', 'triplicate');
    expect(calls[0]).toBe('/api/invoices/inv_1/pdf?copy=triplicate');
  });
});
