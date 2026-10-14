const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { hashSync, compareSync } = require('bcryptjs');
const { openDatabase } = require('../dist/server/src/database/schema');
const { importSnapshot, verifyImport } = require('../dist/server/src/import');
const { AuthService } = require('../dist/server/src/auth/auth.service');

function fixture() {
  const user = randomUUID(),
    deck = randomUUID(),
    now = '2026-01-01T00:00:00+00:00';
  return {
    format: 1,
    project: 'test',
    exportedAt: now,
    tables: {
      'auth.users': [
        {
          id: user,
          email: 'existing@example.com',
          encrypted_password: hashSync('existing-password', 4),
          created_at: now,
          raw_user_meta_data: { theme: 'dark' },
        },
      ],
      'public.decks': [
        {
          id: deck,
          user_id: user,
          name: 'دسته',
          description: '',
          color: 'sky',
          created_at: now,
          updated_at: now,
        },
      ],
      'public.cards': [
        {
          id: randomUUID(),
          deck_id: deck,
          user_id: user,
          front: 'سلام',
          back: 'Hello',
          ease_factor: 1.3,
          interval_days: 6,
          repetitions: 2,
          lapses: 8,
          suspended: true,
          suspensions: 1,
          due_at: now,
          last_reviewed_at: null,
          created_at: now,
          updated_at: now,
        },
      ],
      'auth.identities': [
        { id: randomUUID(), provider: 'email', user_id: user },
      ],
      'auth.sessions': [{ id: randomUUID(), user_id: user }],
      'storage.objects': [],
    },
  };
}
test('migration preserves every application field, password and archive row', async () => {
  const db = openDatabase(':memory:'),
    source = fixture();
  try {
    assert.deepEqual(importSnapshot(db, source), {
      users: 1,
      decks: 1,
      cards: 1,
      archivedTables: 6,
    });
    assert.deepEqual(verifyImport(db, source), {
      users: 1,
      decks: 1,
      cards: 1,
      archivedTables: 6,
    });
    const user = db.prepare('SELECT * FROM users').get();
    assert.ok(compareSync('existing-password', user.password_hash));
    const auth = new AuthService({ db });
    const signedIn = await auth.signIn(
      'existing@example.com',
      'existing-password',
    );
    assert.equal(auth.session(signedIn.token).id, user.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
    assert.throws(() => importSnapshot(db, source), /empty database/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 1);
  } finally {
    db.close();
  }
});
test('failed migration rolls back users and all inserted records', () => {
  const db = openDatabase(':memory:'),
    source = fixture();
  source.tables['public.cards'][0].deck_id = randomUUID();
  try {
    assert.throws(() => importSnapshot(db, source), /FOREIGN KEY/);
    for (const table of [
      'users',
      'decks',
      'cards',
      'migration_archive',
      'migration_manifest',
    ])
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n, 0);
  } finally {
    db.close();
  }
});
test('migration rejects storage files and unmapped source columns', () => {
  const db = openDatabase(':memory:'),
    source = fixture();
  try {
    source.tables['storage.objects'] = [{ id: 'file' }];
    assert.throws(() => importSnapshot(db, source), /Storage/);
    source.tables['storage.objects'] = [];
    source.tables['public.cards'][0].new_column = 'preserve me';
    assert.throws(() => importSnapshot(db, source), /Unmapped/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  } finally {
    db.close();
  }
});
