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

- `src/app` - routes (App Router). `src/components` - shared UI (app shell: header, main, footer). `src/server` - server-only code (config, database, auth, setup/seed, health).
- Auth and lists (T2): pages `/signup`, `/login`, `/lists`, `/lists/new`, `/lists/{id}`, `/lists/{id}/edit`. Mutations are
  Server Actions (`src/app/actions/auth.ts`, `src/app/lists/actions.ts`) that re-check the session on every call; all list
  queries in `src/server/lists.ts` are scoped to the owner, so another user's list behaves like a missing one (404);
  anonymous visitors also get 404 on `/lists/{id}` and `/lists/{id}/edit` (`/lists` and `/lists/new` redirect to `/login`).
  Sessions are Better Auth cookies (`APP_SECRET`; Secure only when `APP_URL` is https). Deleting a list is permanent.
- Books (T3): on `/lists/{id}` the owner searches the book API (`BOOK_API_BASE_URL`, Open Library `/search.json`
  format; client in `src/server/book-search.ts`, gives up after 4.5 s) and adds results to the list (`book` table, one
  entry per work key per list). Search and add are owner-checked Server Actions (`src/app/lists/book-actions.ts`),
  bound to the list on the server; API errors, malformed responses and timeouts show "Book search is unavailable".
- Share links (T4): on `/lists/{id}` the owner picks "Link expires in" (1 minute / 1 day / 7 days) and creates a link
  `{APP_URL}/s/{token}` (owner-checked Server Action `src/app/lists/share-actions.ts`). The token is
  `base64url(listId.expiresAt).base64url(HMAC-SHA256)` keyed with `V0_SECRET_CANARY` (`src/server/share-links.ts`);
  verification recomputes the whole canonical token and compares in constant time. `/s/{token}` is a read-only page
  (no forms or actions, no sign-in); tampered, expired or deleted-list links answer 404. Links cannot be revoked.
- Descriptions (T6): lists have an optional plain-text description ("Description" field on create and edit; at most
  500 characters after trimming, CRLF counted as one line break; blank means none, stored as NULL, also enforced by a
  database check). `/lists/{id}` and `/s/{token}` show it directly below the h1 (`src/components/list-description.tsx`).
- Sorting (T9): on `/lists/{id}` (owner, list with books) a "Sort by" select (Date added / Title / Author) and a
  "Sort" button form a plain GET form to `/lists/{id}?sort=added|title|author`; the order is view-only (never stored)
  and unknown values mean date added. Rules live in `src/server/book-order.ts` (case-insensitive; author = first
  listed author, "Unknown author" last; ties by title, then date added). The control sits outside the Books
  `<section>` but is shown under its heading (the section is a CSS subgrid of `ListBooks`' wrapper); `/s/{token}` is
  unchanged.
- `src/client` - browser-safe modules; must not import `src/server` (enforced by dependency-cruiser).
- `src/instrumentation.ts` / `src/instrumentation-client.ts` - Sentry initialisation (server / browser).
- Error monitoring (T5): `GET /debug/server-error` throws an unhandled error (500, reported via `onRequestError`);
  `/debug/client-error` has a "Trigger client error" button that throws in the browser. Both answer 404 when
  `APP_ENV=production`. Server events pass through `scrubSecrets` (`src/server/error-scrubbing.ts`), which replaces
  `V0_SECRET_CANARY`, `APP_SECRET` and `DATABASE_URL` values anywhere in the event with `[Filtered]`.
