import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function databasePath() {
  return resolve(process.env['DATABASE_PATH'] ?? '../data/recall.sqlite');
}
export function openDatabase(path = databasePath()) {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL, banned_until TEXT, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'amber',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(id, user_id)
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY, deck_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      front TEXT NOT NULL, back TEXT NOT NULL, ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0, repetitions INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
      suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN (0,1)), suspensions INTEGER NOT NULL DEFAULT 0,
      due_at TEXT NOT NULL, last_reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(deck_id, user_id) REFERENCES decks(id, user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS decks_owner ON decks(user_id, created_at);
    CREATE INDEX IF NOT EXISTS cards_owner_deck ON cards(user_id, deck_id, due_at);
    CREATE TABLE IF NOT EXISTS texts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS texts_owner ON texts(user_id, created_at);
    CREATE TABLE IF NOT EXISTS migration_archive (
      table_name TEXT NOT NULL, row_index INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(table_name, row_index)
    );
    CREATE TABLE IF NOT EXISTS migration_manifest (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
  `);
  const columns = db.prepare('PRAGMA table_info(cards)').all();
  for (const name of ['unit', 'examples']) {
    if (!columns.some((column) => column['name'] === name)) {
      db.exec(`ALTER TABLE cards ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
    }
  }
  db.exec('PRAGMA user_version = 2');
  return db;
}
