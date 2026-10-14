const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { openDatabase } = require('../dist/server/src/database/schema');

test('upgrading an existing database preserves cards and adds empty metadata idempotently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-metadata-'));
  const path = join(dir, 'old.sqlite');
  let db;
  try {
    db = openDatabase(path);
    db.exec(`ALTER TABLE cards DROP COLUMN unit;
      ALTER TABLE cards DROP COLUMN examples;
      PRAGMA user_version = 1;
      INSERT INTO users (id,email,password_hash,created_at) VALUES ('owner','test@example.com','test','2026-01-01');
      INSERT INTO decks (id,user_id,name,created_at,updated_at) VALUES ('deck','owner','Legacy','2026-01-01','2026-01-01');
      INSERT INTO cards (id,deck_id,user_id,front,back,repetitions,due_at,created_at,updated_at)
      VALUES ('card','deck','owner','word','U1 definition',3,'2026-01-02','2026-01-01','2026-01-01');`);
    db.close();
    db = openDatabase(path);
    const row = db.prepare('SELECT * FROM cards WHERE id=?').get('card');
    assert.equal(row.back, 'U1 definition');
    assert.equal(row.unit, '');
    assert.equal(row.examples, '');
    assert.equal(row.repetitions, 3);
    assert.equal(row.created_at, '2026-01-01');
    db.close();
    db = openDatabase(path);
    assert.equal(db.prepare('SELECT count(*) AS n FROM cards').get().n, 1);
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
