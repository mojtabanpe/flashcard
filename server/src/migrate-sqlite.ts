import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import { createPool, migrate, transaction } from './database/schema';

type Row = Record<string, unknown>;
const importName = 'sqlite';
/** Parent tables first so foreign keys hold during the copy. */
const tables: Record<string, { key: string[]; timestamps: string[]; booleans?: string[] }> = {
  users: { key: ['id'], timestamps: ['created_at', 'banned_until', 'deleted_at', 'email_verified_at'] },
  sessions: { key: ['token_hash'], timestamps: [] },
  decks: { key: ['id'], timestamps: ['created_at', 'updated_at'] },
  cards: {
    key: ['id'],
    timestamps: ['due_at', 'last_reviewed_at', 'created_at', 'updated_at'],
    booleans: ['suspended'],
  },
  texts: { key: ['id'], timestamps: ['created_at', 'updated_at'] },
  migration_archive: { key: ['table_name', 'row_index'], timestamps: [] },
  migration_manifest: { key: ['id'], timestamps: [] },
};

function readSource(db: DatabaseSync, table: string): Row[] {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  if (!exists) return [];
  const { key } = tables[table];
  return db
    .prepare(`SELECT * FROM ${table} ORDER BY ${key.join(',')}`)
    .all()
    // Accounts from before email confirmation existed count as confirmed.
    .map((row) => (table === 'users' ? { ...row, email_verified_at: row['created_at'] } : { ...row }));
}

/** Convert a SQLite row to the values Postgres stores and returns. */
function normalize(table: string, row: Row): Row {
  const { timestamps, booleans = [] } = tables[table];
  const result: Row = { ...row };
  for (const column of timestamps) {
    const value = result[column];
    if (value === null || value === undefined || value === '') {
      result[column] = null;
      continue;
    }
    const time = Date.parse(String(value));
    if (Number.isNaN(time))
      throw new Error(`Invalid ${table}.${column} timestamp: ${String(value)}`);
    result[column] = new Date(time).toISOString();
  }
  for (const column of booleans) result[column] = Boolean(result[column]);
  for (const [column, value] of Object.entries(result))
    if (typeof value === 'bigint') result[column] = Number(value);
  return result;
}

async function insert(client: PoolClient, table: string, rows: Row[]) {
  for (let start = 0; start < rows.length; start += 200) {
    const batch = rows.slice(start, start + 200);
    const columns = Object.keys(batch[0]);
    const params: unknown[] = [];
    const values = batch.map(
      (row) =>
        '(' +
        columns.map((column) => '$' + params.push(row[column])).join(',') +
        ')',
    );
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')}`,
      params,
    );
  }
}

async function readTarget(client: Pool | PoolClient, table: string) {
  const { key } = tables[table];
  return (await client.query<Row>(`SELECT * FROM ${table} ORDER BY ${key.join(',')}`)).rows;
}

/**
 * Copy every row of a Recall SQLite database into an empty Postgres schema in
 * one transaction, then verify that each table matches field by field.
 * Recorded in `data_imports`, so running it again is a no-op.
 */
export async function migrateSqlite(sourcePath: string, pool: Pool) {
  if (!existsSync(sourcePath)) throw new Error('SQLite database not found: ' + sourcePath);
  await migrate(pool);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    const integrity = source.prepare('PRAGMA integrity_check').get();
    if (integrity?.['integrity_check'] !== 'ok') throw new Error('SQLite integrity check failed.');
    const expected = Object.fromEntries(
      Object.keys(tables).map((table) => [
        table,
        readSource(source, table).map((row) => normalize(table, row)),
      ]),
    );
    return await transaction(pool, async (client) => {
      // Serialize concurrent runs; the second one sees the recorded import.
      await client.query('SELECT pg_advisory_xact_lock(4318731)');
      const done = await client.query('SELECT summary FROM data_imports WHERE name=$1', [importName]);
      if (done.rows[0]) return { skipped: true, ...JSON.parse(String(done.rows[0]['summary'])) };
      for (const table of Object.keys(tables)) {
        const count = await client.query(`SELECT count(*) AS n FROM ${table}`);
        if (Number(count.rows[0]['n']) > 0)
          throw new Error(`Target table ${table} is not empty; refusing to import.`);
      }
      const summary: Record<string, number> = {};
      for (const [table, rows] of Object.entries(expected)) {
        if (rows.length) await insert(client, table, rows);
        const actual = await readTarget(client, table);
        if (!isDeepStrictEqual(actual, rows))
          throw new Error(`Verification failed for ${table}.`);
        summary[table] = rows.length;
      }
      await client.query(
        'INSERT INTO data_imports (name, completed_at, summary) VALUES ($1, now(), $2)',
        [importName, JSON.stringify(summary)],
      );
      return { skipped: false, ...summary };
    });
  } finally {
    source.close();
  }
}

if (require.main === module) {
  const path = resolve(process.argv[2] ?? process.env['DATABASE_PATH'] ?? '../data/recall.sqlite');
  const pool = createPool();
  migrateSqlite(path, pool)
    .then((result) => console.log('SQLite import:', JSON.stringify(result)))
    .catch((error: Error) => {
      console.error('SQLite import failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => void pool.end());
}
