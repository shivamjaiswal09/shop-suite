# @shop/api

Fastify 5 + Prisma 6. Runs as a long-lived listener locally and as a single
Vercel serverless function in production, from the same code.

## Layout

| File | Role |
| --- | --- |
| `src/app.ts` | `buildApp()` — plugins, error handler, routes. The only place the app is defined. |
| `src/server.ts` | Local listener. Builds the app and binds a port. |
| `../../api/[...path].ts` | Vercel function. Builds the app once per warm container and feeds it one request at a time. Lives at the repo root because Vercel only discovers functions under `<project root>/api`. |
| `src/db.ts` | The Prisma client singleton. |
| `src/auth.ts` | argon2 hashing, opaque session ids, tenancy guards. |
| `src/routes.ts` | Every route, registered at the root (no `/api` prefix). |

Routes are registered without a prefix so `localhost:4000/health` and
`https://<app>/api/health` are the same route table; the function strips the
`/api` that Vercel matched on before handing the request to Fastify.

## Local development

```sh
cp .env.example .env     # then fill in the Supabase values
pnpm --filter @shop/api dev
curl -s localhost:4000/health   # {"ok":true}
```

Prisma's CLI reads `apps/api/.env`, which is why the example lives here as well
as at the repo root.

## Database URLs — REQUIRED schema change

Supabase gives two connection strings and the deployment needs both:

- **`DATABASE_URL`** — the transaction pooler on port **6543**, with
  `?pgbouncer=true&connection_limit=1`. Every serverless invocation may open its
  own pool; without PgBouncer in front, a modest traffic spike exhausts
  Postgres' connection limit and requests start failing to *connect*, not to
  query. `connection_limit=1` keeps each function to a single pooled connection,
  and `pgbouncer=true` tells Prisma to stop using prepared statements, which
  transaction-mode pooling cannot keep across statements.
- **`DIRECT_URL`** — the direct connection on port **5432**. `prisma migrate`
  and `prisma db push` take advisory locks and run DDL over a session that
  PgBouncer's transaction mode will not hold. Schema work bypasses the pooler
  entirely; nothing serving a request uses this URL.

**`prisma/schema.prisma` must declare both.** That file is owned elsewhere, so
it is not changed here. It needs:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Until `directUrl` is added, migrations will be attempted through PgBouncer and
either hang on the advisory lock or fail outright.

## Session cookie

`createSession` sets an httpOnly cookie with:

- `sameSite: 'lax'` — the SPA and `/api` are one origin in both environments, so
  nothing legitimate is cross-site. `'none'` would only be needed if the API
  were served from a different domain than the app, and would then require
  `secure` unconditionally.
- `secure` on whenever `NODE_ENV=production` **or** `VERCEL=1`. Both are checked
  because a `Secure` cookie is dropped silently over plain http (so it cannot be
  on for localhost) and because a deploy with `NODE_ENV` unset would otherwise
  ship session cookies in the clear.

Auth is unchanged otherwise: argon2id hashes, opaque random session ids stored
in the `Session` table. No Supabase Auth, no RLS.

## Deploying

`vercel.json` at the repo root drives everything:

- `buildCommand` runs `prisma generate` before the web build. The function
  imports `@prisma/client`, and on a clean CI checkout the generated client does
  not exist until `generate` runs.
- `outputDirectory` is `apps/web/dist`; the SPA is the static half of the deploy.
- A rewrite sends everything that is not `/api/*` and not an existing file to
  `index.html`, so react-router deep links survive a hard refresh.

Set these in the Vercel project (Production **and** Preview):
`DATABASE_URL`, `DIRECT_URL`, `SESSION_COOKIE`, `WEB_ORIGIN`. `NODE_ENV` is set
to `production` by Vercel; do not override it. Pick a function region close to
the Supabase project — a cross-continent hop is paid on every query.
