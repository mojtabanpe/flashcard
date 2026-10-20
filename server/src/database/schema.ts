import { Pool, PoolClient, types } from 'pg';
// Keep the API's JSON shape: timestamps as ISO strings, counts as numbers.
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) =>
  new Date(value).toISOString(),
);
types.setTypeParser(types.builtins.INT8, Number);
export type Queryable = Pick<Pool | PoolClient, 'query'>;
export function databaseUrl() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required.');
  return url;
}
/** Schema for one test run (or `public`); validated because it is interpolated. */
export function databaseSchema() {
  const schema = process.env['DATABASE_SCHEMA'] ?? 'public';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error('Invalid DATABASE_SCHEMA.');
  return schema;
}
export function createPool(url = databaseUrl(), schema = databaseSchema()) {
  return new Pool({
    connectionString: url,
    max: Number(process.env['DATABASE_POOL_SIZE'] ?? 10),
    options: `-c search_path=${schema}`,
  });
}
export const schemaVersion = 1;
export async function migrate(db: Queryable, schema = databaseSchema()) {
  await db.query(`
    CREATE SCHEMA IF NOT EXISTS ${schema};
    SET search_path TO ${schema};
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL, banned_until TIMESTAMPTZ, deleted_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (lower(email));
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS mcp_keys (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes TEXT[] NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mcp_keys_owner ON mcp_keys(user_id);
    CREATE TABLE IF NOT EXISTS mcp_clients (id TEXT PRIMARY KEY, metadata JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS mcp_pending (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES mcp_clients(id) ON DELETE CASCADE,
      params JSONB NOT NULL, csrf_hash TEXT NOT NULL, expires_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_codes (
      code_hash TEXT PRIMARY KEY, key_id TEXT NOT NULL REFERENCES mcp_keys(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES mcp_clients(id) ON DELETE CASCADE, params JSONB NOT NULL, expires_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_credentials (
      token_hash TEXT PRIMARY KEY, refresh_hash TEXT NOT NULL UNIQUE,
      key_id TEXT NOT NULL REFERENCES mcp_keys(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES mcp_clients(id) ON DELETE CASCADE, scopes TEXT[] NOT NULL,
      access_expires BIGINT NOT NULL, refresh_expires BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mcp_credentials_key ON mcp_credentials(key_id);
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'amber',
      created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, UNIQUE(id, user_id)
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY, deck_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      front TEXT NOT NULL, back TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', examples TEXT NOT NULL DEFAULT '',
      ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5, interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
      suspended BOOLEAN NOT NULL DEFAULT FALSE, suspensions INTEGER NOT NULL DEFAULT 0,
      due_at TIMESTAMPTZ NOT NULL, last_reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(deck_id, user_id) REFERENCES decks(id, user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS decks_owner ON decks(user_id, created_at);
    CREATE INDEX IF NOT EXISTS cards_owner_deck ON cards(user_id, deck_id, due_at);
    CREATE TABLE IF NOT EXISTS texts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS texts_owner ON texts(user_id, created_at);
    -- Raw rows from the original Supabase export, kept for audit.
    CREATE TABLE IF NOT EXISTS migration_archive (
      table_name TEXT NOT NULL, row_index INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(table_name, row_index)
    );
    CREATE TABLE IF NOT EXISTS migration_manifest (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
    -- One-off data imports (e.g. from SQLite), so they never run twice.
    CREATE TABLE IF NOT EXISTS data_imports (
      name TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL, summary TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL);
    INSERT INTO schema_meta VALUES (1, ${schemaVersion}) ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version;
  `);
}
/** Run `work` in one transaction on a dedicated connection. */
export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
