# Recall — spaced-repetition flashcards

Recall uses Angular 22, a NestJS API and a persistent SQLite database. Users can sign in from multiple devices; the API restricts every deck and card operation to the signed-in owner.

## Run locally

Requires Node.js **22.23.2 or newer in the 22 LTS line**, or Node.js 24 LTS, and pnpm 10.15.0. The API uses the built-in `node:sqlite` driver, which Node 22 currently labels experimental.

```bash
pnpm install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
pnpm api:build
```

The migrated database is already in `data/recall.sqlite` on this machine. In two terminals:

```bash
pnpm api:start
```

```bash
pnpm start
```

Open http://localhost:4333. Angular proxies `/api` to http://127.0.0.1:3000. Existing users can sign in with their previous email/password. Old sessions require a fresh sign-in.

## Data and migration

The import preserves user IDs, password hashes, every deck/card field, Unicode content, timestamps and SM-2/Lightner review state. All source-table rows, including provider metadata and historical authentication records, are retained as JSON in the private `migration_archive` table. Provider sessions are archival records; new NestJS sessions are issued on sign-in.

- `data/recall.sqlite`: the live database.
- `backups/supabase-export.json`: private, consistent source snapshot from the old database.
- `migration_manifest`: source project, export/import times and verified row counts.

These files contain personal data and password hashes, are excluded from Git, and must stay outside the frontend/static document root.

For a **new, empty** destination database:

```bash
pnpm db:import
```

Import runs in one transaction and verifies every application field, password hash and archive row, plus SQLite integrity and foreign keys. It refuses to overwrite an existing database or ignore unrecognized application columns or storage files.

To import at a different path:

```bash
DATABASE_PATH=/absolute/path/recall.sqlite pnpm db:import
```

Create a consistent backup while the API is running:

```bash
pnpm db:backup
```

To restore, stop the API, preserve the current database and its WAL/SHM files, replace the database with a verified SQLite backup, then restart. Do not overwrite a running database or copy only the main file while WAL writes are active.

## Architecture

```text
src/app/core/        Angular HTTP client, authentication, deck/card services
src/app/pages/       login, dashboard, deck management, study
shared/              shared domain types and pure SM-2/Lightner functions
server/src/auth/     bcrypt passwords, HttpOnly sessions, authentication guard
server/src/decks/    owner-scoped deck CRUD and study counts
server/src/cards/    owner-scoped card CRUD and transactional review scheduling
server/src/database/ SQLite schema, indexes and lifecycle
server/src/import.ts transactional source-data import and full verification
```

Review calculations run on the server against the persisted card; Angular uses the same shared functions for interval previews. Sessions contain random tokens in HttpOnly/SameSite cookies; only token hashes are stored in SQLite. Sign-out revokes the session. Request validation rejects client-supplied ownership fields. All mutations require a custom client header and an allowed Origin. Sign-in and signup are rate-limited.

## Build and test

```bash
pnpm build
pnpm api:build
pnpm api:test
```

The API tests cover authentication, legacy password migration, session revocation/expiry, isolation between users, CRUD, Unicode, cascade deletion, request validation, CSRF rejection, rate limiting, transactional rollback and SM-2/Lightner scheduling.

## Future server deployment

Serve the Angular output at `dist/flashcard/browser` and proxy `/api` to NestJS on the **same HTTPS origin**. Provide a durable, local disk for SQLite; one API instance owns the database. A static-only hosting service cannot run this backend.

Set these server environment variables:

```text
NODE_ENV=production
APP_ORIGINS=https://your-domain.example
DATABASE_PATH=/absolute/persistent/path/recall.sqlite
HOST=127.0.0.1
PORT=3000
```

Production cookies use Secure. Configure any reverse proxy to forward the real client address before relying on per-client rate limiting. Back up the persistent disk regularly.

Before a live cutover, stop writes to the old application, take a fresh consistent export, import into an empty destination, verify it, and route users to the new API. The old cloud project remains available as a recovery source; this change removes it from the application and does not delete the cloud project.
