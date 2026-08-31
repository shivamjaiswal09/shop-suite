import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from './auth.ts';
import { registerInventoryRoutes } from './routes/inventory.ts';
import { registerRoutes } from './routes.ts';
import { registerSalesRoutes } from './routes/sales.ts';
import { registerCatalogueRoutes } from './routes/catalogue.ts';

/**
 * The whole application, minus the decision of how it gets listened to. The
 * local `server.ts` binds it to a port; the Vercel function hands it one
 * request at a time. Neither may own the wiring, or the two deployments drift
 * apart and a route only breaks in the environment nobody tests.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { transport: undefined, level: 'info' },
    // Deployed, every request arrives through Vercel's edge, so the socket
    // address is the proxy's and only X-Forwarded-* carries the real client.
    // Locally those headers are attacker-controlled, so we do not trust them.
    trustProxy: process.env.VERCEL === '1',
  });

  await app.register(cors, {
    // Credentials mean the origin must be exact — no wildcard.
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5273').split(','),
    credentials: true,
  });
  await app.register(cookie);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    app.log.error(error);
    // Never leak an internal message to the client.
    return reply.code(500).send({ error: 'Something went wrong' });
  });

  app.get('/health', async () => ({ ok: true }));

  await registerRoutes(app);
  await registerSalesRoutes(app);
  registerInventoryRoutes(app);
  await app.register(registerCatalogueRoutes);

  return app;
}
