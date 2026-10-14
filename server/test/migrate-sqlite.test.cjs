const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { useTestDatabase } = require('./db.cjs');
const database = useTestDatabase();
const { createPool } = require('../dist/server/src/database/schema');
const { migrateSqlite } = require('../dist/server/src/migrate-sqlite');
const { cloneUser } = require('../dist/server/src/clone-user');

// The SQLite schema the app used before moving to Postgres (texts table omitted, as in production).
const legacy = `
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, banned_until TEXT, deleted_at TEXT);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE decks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'amber', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(id, user_id));
  CREATE TABLE cards (id TEXT PRIMARY KEY, deck_id TEXT NOT NULL, user_id TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, ease_factor REAL NOT NULL DEFAULT 2.5, interval_days INTEGER NOT NULL DEFAULT 0, repetitions INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, suspended INTEGER NOT NULL DEFAULT 0, suspensions INTEGER NOT NULL DEFAULT 0, due_at TEXT NOT NULL, last_reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', examples TEXT NOT NULL DEFAULT '');
  CREATE TABLE migration_archive (table_name TEXT NOT NULL, row_index INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(table_name, row_index));
  CREATE TABLE migration_manifest (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
  INSERT INTO users VALUES ('u1','Admin@Example.com','$2b$12$hash','2026-06-28 10:00:00.123+00',NULL,NULL), ('u2','other@example.com','$2b$12$other','2026-06-29T00:00:00Z',NULL,NULL);
  INSERT INTO sessions VALUES ('tok', 'u1', 9999999999999);
  INSERT INTO decks VALUES ('d1','u1','Words','desc','sky','2026-06-28T10:00:00.000Z','2026-06-28T10:00:00.000Z'), ('d2','u2','Other','','amber','2026-06-29T00:00:00Z','2026-06-29T00:00:00Z');
  INSERT INTO cards VALUES ('c1','d1','u1','bond','a link',2.36,6,3,1,0,0,'2026-07-01T00:00:00.000Z','2026-06-30T00:00:00.000Z','2026-06-28T10:00:00.000Z','2026-06-30T00:00:00.000Z','u19','- A bond.'),
    ('c2','d1','u1','leech','x',1.3,0,0,8,1,1,'2026-07-01T00:00:00.000Z',NULL,'2026-06-28T10:00:00.000Z','2026-06-28T10:00:00.000Z','',''),
    ('c3','d2','u2','other','y',2.5,0,0,0,0,0,'2026-07-01T00:00:00.000Z',NULL,'2026-06-29T00:00:00Z','2026-06-29T00:00:00Z','','');
  INSERT INTO migration_archive VALUES ('public.decks', 0, '{"id":"d1"}');
  INSERT INTO migration_manifest VALUES (1, '{"format":1}');`;

test('SQLite data moves to Postgres verified, once; users can be copied', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-migrate-'));
  const path = join(dir, 'legacy.sqlite');
  const source = new DatabaseSync(path);
  source.exec(legacy);
  source.close();
  const pool = createPool();
  try {
    await t.test('imports every table and verifies it', async () => {
      const result = await migrateSqlite(path, pool);
      assert.deepEqual(result, { skipped: false, users: 2, sessions: 1, decks: 2, cards: 3, texts: 0, migration_archive: 1, migration_manifest: 1 });
      const card = (await pool.query("SELECT * FROM cards WHERE id='c2'")).rows[0];
      assert.equal(card.suspended, true);
      assert.equal(card.ease_factor, 1.3);
      assert.equal(card.last_reviewed_at, null);
      assert.equal((await pool.query("SELECT created_at FROM users WHERE id='u1'")).rows[0].created_at, '2026-06-28T10:00:00.123Z');
      assert.equal((await pool.query('SELECT expires_at FROM sessions')).rows[0].expires_at, 9999999999999);
    });
    await t.test('running again is a no-op', async () => {
      const again = await migrateSqlite(path, pool);
      assert.equal(again.skipped, true);
      assert.equal(Number((await pool.query('SELECT count(*) AS n FROM cards')).rows[0].n), 3);
    });
    await t.test('a user copy gets every deck, card and review state under new ids', async () => {
      const copy = await cloneUser(pool, 'admin@example.com', ' New@Example.com ', 'same');
      assert.deepEqual(copy, { email: 'new@example.com', decks: 1, cards: 2, texts: 0 });
      const user = (await pool.query("SELECT * FROM users WHERE email='new@example.com'")).rows[0];
      assert.equal(user.password_hash, '$2b$12$hash');
      const cards = (await pool.query('SELECT * FROM cards WHERE user_id=$1 ORDER BY front', [user.id])).rows;
      assert.deepEqual(cards.map((c) => [c.front, c.unit, c.examples, c.ease_factor, c.repetitions, c.lapses, c.suspended, c.due_at]),
        [['bond', 'u19', '- A bond.', 2.36, 3, 1, false, '2026-07-01T00:00:00.000Z'], ['leech', '', '', 1.3, 0, 8, true, '2026-07-01T00:00:00.000Z']]);
      assert.ok(cards.every((c) => !['c1', 'c2'].includes(c.id) && c.deck_id !== 'd1'));
      assert.equal(Number((await pool.query("SELECT count(*) AS n FROM cards WHERE user_id='u1'")).rows[0].n), 2);
      await assert.rejects(cloneUser(pool, 'admin@example.com', 'new@example.com', 'same'), /already exists/);
      await assert.rejects(cloneUser(pool, 'missing@example.com', 'x@example.com', 'same'), /not found/);
    });
    await t.test('refuses to import into a non-empty database without a record', async () => {
      await pool.query("DELETE FROM data_imports");
      await assert.rejects(migrateSqlite(path, pool), /not empty/);
    });
  } finally {
    await pool.end();
    await database.drop();
    rmSync(dir, { recursive: true, force: true });
  }
});
