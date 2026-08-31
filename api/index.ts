import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/dist/app.js';

/**
 * The Fastify app as a single Vercel function. Nothing about the API is
 * declared here — this file only adapts a serverless invocation into the shape
 * `server.ts` gets from `app.listen()`.
 *
 * The promise is module-scoped so a warm container reuses the app it already
 * booted: rebuilding it per request would re-register every plugin and, worse,
 * re-open the database pool on every call.
 */
let app: Promise<FastifyInstance> | undefined;

function getApp(): Promise<FastifyInstance> {
  app ??= buildApp().then(async (instance) => {
    // Fastify only finishes wiring plugins and routes on ready(); without it
    // the first emitted request would race the boot and 404.
    await instance.ready();
    return instance;
  });
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // The catch-all still carries the /api prefix that Vercel matched on, but the
  // route table is registered at the root so the local listener and the
  // deployed function serve byte-identical paths. Strip it here rather than
  // forking the routes on an environment check.
  const url = req.url ?? '/';
  if (url === '/api') {
    req.url = '/';
  } else if (url.startsWith('/api/')) {
    req.url = url.slice('/api'.length);
  }

  const instance = await getApp();
  // Fastify's own request pipeline is a plain Node 'request' listener, so we
  // can feed it the invocation's req/res directly instead of shimming.
  instance.server.emit('request', req, res);
}
