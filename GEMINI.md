# Recall — Agent Instructions & Project Context

Recall is an Angular 22 web application with a NestJS API and PostgreSQL.

## Architecture

- Angular: standalone components, zoneless change detection, signals.
- NestJS: feature modules in server/src/auth, decks, cards and database.
- PostgreSQL: `pg` pool in DatabaseService, owner-scoped parameterized queries and foreign keys. Local services run with docker compose.
- Shared types and pure SM-2/Lightner calculations: shared/models.ts and shared/srs.ts.
- Styles: existing SCSS design tokens and keyboard interactions.

## Development standards

- Use inject() and signals in Angular; API requests belong in ApiService.
- Use typed DTOs, guards, services and thin controllers in NestJS.
- Follow .agents/rules/postgres-security.md for authorization and storage.
- The browser never accesses the database directly. Review updates are calculated and committed on the server.
- Preserve existing UI, SRS behavior, IDs and timestamps when changing persistence.
- Do not commit database files, personal data, password hashes or migration exports.

## Commands

- pnpm start: Angular on localhost:4333, proxying /api to NestJS.
- pnpm api:build / pnpm api:start: compile and run the API.
- pnpm build: production frontend.
- pnpm api:test: API, migration and shared SRS tests.
- pnpm db:up: start local Postgres and Redis (compose.yaml).
- pnpm db:backup: pg_dump of the local database into backups/.
- pnpm --dir server clone-user <from> <to>: copy a user's decks, cards and texts.
