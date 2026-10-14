const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createApp } = require('../dist/server/src/bootstrap');
const {
  DatabaseService,
} = require('../dist/server/src/database/database.service');
const { randomUUID } = require('node:crypto');

test('SQLite API: sessions, ownership, CRUD, scheduling and validation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-api-'));
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
  process.env.NODE_ENV = 'test';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const url = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const db = app.get(DatabaseService).db;
  const call = async (method, path, body, cookie, headers = {}) => {
    const r = await fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Recall-Client': 'web',
        Origin: 'http://localhost:4333',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get('set-cookie'),
    };
  };
  try {
    const a = await call('POST', '/auth/signup', {
      email: 'a@example.com',
      password: 'test-password',
    });
    const b = await call('POST', '/auth/signup', {
      email: 'b@example.com',
      password: 'test-password',
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const ca = a.cookie.split(';')[0],
      cb = b.cookie.split(';')[0];
    await t.test('authentication and session persistence', async () => {
      assert.match(a.cookie, /HttpOnly/);
      assert.match(a.cookie, /SameSite=Lax/);
      assert.equal(a.body.user.password_hash, undefined);
      assert.equal(
        (await call('GET', '/auth/session', undefined, ca)).body.user.id,
        a.body.user.id,
      );
      assert.equal((await call('GET', '/decks')).status, 401);
      assert.equal(
        (
          await call('POST', '/auth/signin', {
            email: 'a@example.com',
            password: 'wrong-password',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await call('POST', '/auth/signin', {
            email: 'A@example.com',
            password: 'test-password',
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await call('POST', '/auth/signup', {
            email: 'A@example.com',
            password: 'test-password',
          })
        ).status,
        409,
      );
    });
    const deck = (
      await call(
        'POST',
        '/decks',
        { name: 'Words', description: 'Test', color: 'sky' },
        ca,
      )
    ).body;
    const card = (
      await call(
        'POST',
        '/cards',
        { deck_id: deck.id, front: 'سلام', back: 'Hello', unit: 'U19', examples: 'Hello, Sam.' },
        ca,
      )
    ).body;
    await t.test('decks, Unicode cards and due counts', async () => {
      assert.equal(card.user_id, a.body.user.id);
      assert.equal(card.front, 'سلام');
      assert.equal(card.suspended, false);
      assert.equal(card.unit, 'u19');
      assert.equal(card.examples, 'Hello, Sam.');
      const stats = (await call('GET', '/decks', undefined, ca)).body;
      assert.equal(stats[0].total, 1);
      assert.equal(stats[0].due, 1);
      assert.equal(
        (
          await call(
            'GET',
            '/cards?deck_id=' + deck.id + '&due=true',
            undefined,
            ca,
          )
        ).body.length,
        1,
      );
      assert.equal(
        (await call('PATCH', '/decks/' + deck.id, { name: 'Updated' }, ca)).body
          .name,
        'Updated',
      );
      assert.equal(
        (await call('PATCH', '/cards/' + card.id, { back: 'Hello world' }, ca))
          .body.back,
        'Hello world',
      );
      const persisted = (await call('GET', '/cards?deck_id=' + deck.id, undefined, ca)).body[0];
      assert.equal(persisted.unit, 'u19');
      assert.equal(persisted.examples, 'Hello, Sam.');
      const cleared = (await call('PATCH', '/cards/' + card.id, { unit: '', examples: '' }, ca)).body;
      assert.equal(cleared.unit, '');
      assert.equal(cleared.examples, '');
      assert.equal((await call('PATCH', '/cards/' + card.id, { unit: 'Unit 19 — Relationships' }, ca)).status, 400);
      assert.equal((await call('PATCH', '/cards/' + card.id, { examples: [] }, ca)).status, 400);
    });
    await t.test(
      'cross-user reads, writes, reviews and deletes are rejected',
      async () => {
        assert.deepEqual((await call('GET', '/decks', undefined, cb)).body, []);
        for (const [method, path, body] of [
          ['GET', '/decks/' + deck.id],
          ['PATCH', '/decks/' + deck.id, { name: 'Stolen' }],
          ['DELETE', '/decks/' + deck.id],
          ['GET', '/cards?deck_id=' + deck.id],
          ['POST', '/cards', { deck_id: deck.id, front: 'x', back: 'y' }],
          ['PATCH', '/cards/' + card.id, { front: 'Stolen' }],
          ['PATCH', '/cards/' + card.id, { unit: 'u1', examples: 'Stolen' }],
          ['DELETE', '/cards/' + card.id],
          ['POST', '/cards/' + card.id + '/review', { rating: 'easy' }],
          ['POST', '/cards/' + card.id + '/unsuspend', {}],
        ])
          assert.equal((await call(method, path, body, cb)).status, 404, path);
      },
    );
    await t.test(
      'server computes SM-2, leech suspension and unsuspend',
      async () => {
        const good = (
          await call(
            'POST',
            '/cards/' + card.id + '/review',
            { rating: 'good' },
            ca,
          )
        ).body;
        assert.equal(good.repetitions, 1);
        assert.equal(good.interval_days, 1);
        assert.equal(
          (
            await call(
              'GET',
              '/cards?deck_id=' + deck.id + '&due=true',
              undefined,
              ca,
            )
          ).body.length,
          0,
        );
        db.prepare('UPDATE cards SET lapses=7,ease_factor=1.3 WHERE id=?').run(
          card.id,
        );
        const leech = (
          await call(
            'POST',
            '/cards/' + card.id + '/review',
            { rating: 'again' },
            ca,
          )
        ).body;
        assert.equal(leech.suspended, true);
        assert.equal(leech.suspensions, 1);
        assert.equal(leech.lapses, 8);
        const restored = (
          await call('POST', '/cards/' + card.id + '/unsuspend', {}, ca)
        ).body;
        assert.equal(restored.suspended, false);
        assert.equal(restored.lapses, 0);
        assert.equal(restored.suspensions, 1);
      },
    );
    await t.test(
      'malformed requests, owner injection and CSRF are rejected',
      async () => {
        assert.equal(
          (
            await call(
              'POST',
              '/cards/' + card.id + '/review',
              { rating: 'invalid' },
              ca,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              'POST',
              '/decks',
              { name: 'x', color: 'sky', user_id: b.body.user.id },
              ca,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              'POST',
              '/cards',
              { deck_id: deck.id, front: '', back: 'x' },
              ca,
            )
          ).status,
          400,
        );
        assert.equal(
          (await call('PATCH', '/decks/not-a-uuid', { name: 'x' }, ca)).status,
          400,
        );
        assert.equal(
          (
            await call('POST', '/auth/signout', {}, ca, {
              Origin: 'https://attacker.example',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call('POST', '/auth/signout', {}, ca, {
              'X-Recall-Client': '',
            })
          ).status,
          403,
        );
        assert.equal(
          (await call('GET', '/decks/' + randomUUID(), undefined, ca)).status,
          404,
        );
      },
    );
    await t.test('cascade deletion and session revocation', async () => {
      assert.equal(
        (await call('DELETE', '/decks/' + deck.id, undefined, ca)).status,
        200,
      );
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 0);
      assert.equal((await call('POST', '/auth/signout', {}, ca)).status, 201);
      assert.equal((await call('GET', '/decks', undefined, ca)).status, 401);
    });
    await t.test('expired sessions and sign-in rate limit', async () => {
      db.prepare('UPDATE sessions SET expires_at=0').run();
      assert.equal((await call('GET', '/decks', undefined, cb)).status, 401);
      let last;
      for (let i = 0; i < 12; i++)
        last = await call('POST', '/auth/signin', {
          email: 'none@example.com',
          password: 'wrong-password',
        });
      assert.equal(last.status, 429);
    });
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
