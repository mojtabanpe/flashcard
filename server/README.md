# Recall NestJS API

See [the project README](../README.md) for startup, migration, backup and deployment instructions.

Run commands from the project root:

```bash
pnpm api:build
pnpm api:start
pnpm api:test
pnpm db:backup
```

The API listens on 127.0.0.1:3000 by default. DATABASE_PATH is resolved relative to the server working directory; use an absolute path outside development. Keep database files and migration exports outside the static file root.
