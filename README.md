# bakeoff-c1 - Shared Reading Lists (pre-V0 stack bake-off, candidate 1)

Candidate 1: Next.js 16 (App Router) + TypeScript. Built by the Builder agent; every change reaches main only through a pull request that passes the shared `gate` check and is approved by the owner.

## Stack

Next.js 16 (App Router, React Server Components, standalone output) + TypeScript (`strict`), Node 24 LTS, npm, Tailwind CSS,
PostgreSQL via Drizzle ORM / drizzle-kit, Better Auth (email + password), Sentry (`@sentry/nextjs`), Vitest, ESLint +
Prettier, dependency-cruiser. Agent tooling (`next-devtools-mcp`, see `.mcp.json`) is a development dependency only.

## Development

```sh
npm ci
export DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB APP_SECRET=... APP_ENV=development
npm run db:migrate          # migrations + seed users (idempotent)
npm run dev
```

- `npm run check` - lint (ESLint, Prettier, dependency-cruiser), type-check and tests. Tests need `APP_ENV=test` and
  `DATABASE_URL` pointing at a disposable database (they reset its schema).
- `npm run db:generate` - generate a migration in `drizzle/` after changing `src/server/db/schema.ts`.

## Container (shared preview interface, `tasks/T0/contract.json`)

- `docker build --target check .` runs `npm run check` (needs `DATABASE_URL` of an empty database and `APP_ENV=test`).
- `docker build .` builds the preview image. On start it runs `dist/migrate.mjs` (migrations + seed), then serves on
  `0.0.0.0:$PORT`. `GET /healthz` returns `{"status":"ok","env":APP_ENV,"users":N}`.
- Error monitoring is configured at runtime from `SENTRY_DSN` (server) and `PUBLIC_SENTRY_DSN` (browser; rendered into
  `<meta>` tags by the root layout) with `release = APP_RELEASE` and `environment = APP_ENV`; empty DSNs disable it.

## Layout

- `src/app` - routes (App Router). `src/server` - server-only code (config, database, auth, setup/seed, health).
- `src/client` - browser-safe modules; must not import `src/server` (enforced by dependency-cruiser).
- `src/instrumentation.ts` / `src/instrumentation-client.ts` - Sentry initialisation (server / browser).
