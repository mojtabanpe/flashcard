# Recall NestJS API

See [the project README](../README.md) for startup, migration, backup and deployment instructions.

Run commands from the project root:

```bash
pnpm api:build
pnpm api:start
pnpm api:test
pnpm db:backup
```

The API listens on 127.0.0.1:3000 by default and connects to Postgres through `DATABASE_URL` (see `.env.example`; start it with `docker compose up -d` from the project root). `DATABASE_SCHEMA` selects a schema, which the tests use for isolation. Keep backups and migration exports outside the static file root.
