# Recall — spaced-repetition flashcards

Recall uses Angular 22 (an installable PWA), a NestJS API and PostgreSQL. Users can sign in from multiple devices; the API restricts every deck, card and text operation to the signed-in owner.

## Run locally

Requires Node.js 24 LTS (or 22.23.2+), pnpm 10.15.0 and Docker.

```bash
pnpm install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
cp server/.env.example server/.env   # then fill in the 9Router key
pnpm db:up                           # Postgres on 127.0.0.1:5433, Redis on 127.0.0.1:16379
pnpm api:build
```

In two terminals:

```bash
pnpm api:start
```

```bash
pnpm start
```

Open http://localhost:4333. Angular proxies `/api` to http://127.0.0.1:3000. The API creates and upgrades its tables on start.

## Environments

- `src/environments/environment.ts`: local development (`pnpm start`, `ng build --configuration development`). No service worker.
- `src/environments/environment.prod.ts`: production (`pnpm build`, the default configuration). It replaces the development file and enables the service worker.
- `server/.env`: local API settings (see `server/.env.example`). Production settings live in `/opt/recall/shared/.env` on the server (see `deploy/.env.example`).

## Data

- `pnpm db:migrate-sqlite [path]`: one-time copy of a legacy SQLite database (default `data/recall.sqlite`) into an empty Postgres database. It runs in one transaction, verifies every table field by field, and is recorded in `data_imports`, so running it again does nothing. Timestamps keep millisecond precision.
- `pnpm --dir server clone-user <from-email> <new-email> [--same-password]`: creates a user with copies of every deck, card (including review state) and text. Without `--same-password` it asks for the new password without echoing it.
- `pnpm --dir server set-password <email>`: sets a password and signs out the user's sessions.
- `pnpm db:backup`: `pg_dump` (custom format) into `backups/`. Restore with `pg_restore --clean -d recall`.

Database volumes, `data/` and `backups/` contain personal data and password hashes and are excluded from Git and Docker builds.

## PWA

The production build ships `ngsw-worker.js`, `manifest.webmanifest` and icons in `public/icons` (sources in `design-system/icons`). The service worker prefetches the hashed JS/CSS and lazily caches icons and fonts. `index.html` is deliberately not in `ngsw.json`: navigations always go to the network (`navigationRequestStrategy: freshness`), so a deployment is visible immediately, but the app cannot start without a connection. The app shows an install button where the browser supports it, an offline banner, and a "new version" bar with a reload action. The API sends `immutable` caching for hashed files and `no-cache` for `index.html`, `ngsw.json`, the worker and the manifest.

## Architecture

```text
src/app/core/          HTTP client, auth, decks/cards/texts, TTS, AI, PWA services
src/app/pages/         login, library, deck, study, reading list and reader
shared/                shared domain types and pure SM-2/Lightner functions
server/src/auth/       bcrypt passwords, HttpOnly sessions, authentication guard
server/src/decks/      owner-scoped deck CRUD and study counts
server/src/cards/      owner-scoped card CRUD and transactional review scheduling
server/src/texts/      owner-scoped reading texts
server/src/ai/         card answers through the 9Router chat endpoint
server/src/database/   Postgres pool, schema and transactions
server/src/migrate-sqlite.ts  verified SQLite → Postgres import
```

Review calculations run on the server against the persisted card, locked with `SELECT … FOR UPDATE`. Sessions contain random tokens in HttpOnly/SameSite cookies; only token hashes are stored. Request validation rejects client-supplied ownership fields. All mutations require a custom client header and an allowed Origin. Sign-in and signup are rate-limited.

## Build and test

```bash
pnpm build
pnpm test --watch=false
pnpm db:up && pnpm api:test
```

API tests run against Postgres (`DATABASE_TEST_URL`, default the local compose database), each file in its own temporary schema. Set `REDIS_TEST_URL=redis://127.0.0.1:16379` to include the Redis cache tests.

## Deployment

`deploy/compose.yml` runs the app, Postgres and Redis on the server, all bound to 127.0.0.1 behind Nginx. `deploy/release.sh` backs up the database (`pg_dump`), starts Postgres, runs the one-time SQLite import while the old app is stopped, then starts the new release and rolls back if the health check fails. `POSTGRES_PASSWORD` must be set (hex) in `/opt/recall/shared/.env`. See `deploy/README.fa.md`.
