/**
 * The function imports a build artefact (`apps/api/dist/app.js`, produced by
 * esbuild) rather than TypeScript source, because nothing on Vercel can execute
 * a `.ts` file at runtime. esbuild emits no declarations, so describe the one
 * export the function actually uses instead of letting it degrade to `any`.
 */
declare module '*/apps/api/dist/app.js' {
  import type { FastifyInstance } from 'fastify';
  export function buildApp(): Promise<FastifyInstance>;
}
