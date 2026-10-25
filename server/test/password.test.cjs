const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/server/src/bootstrap');
const { useTestDatabase } = require('./db.cjs');
const { MailService } = require('../dist/server/src/mail/mail.service');
const {
  DatabaseService,
} = require('../dist/server/src/database/database.service');

test('password change, reset by email and notices', async (t) => {
  const database = useTestDatabase();
  process.env.NODE_ENV = 'test';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const url = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const mail = app.get(MailService);
  const db = app.get(DatabaseService);
  const call = async (method, path, body, cookie) => {
    const r = await fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Recall-Client': 'web',
        Origin: 'http://localhost:4333',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const cookieHeader = r.headers.get('set-cookie');
    return {
      status: r.status,
      body: await r.json(),
      cookie: cookieHeader?.split(';')[0],
    };
  };
  const signIn = (password) =>
    call('POST', '/auth/signin', { email: 'p@example.com', password });
  const session = async (cookie) =>
    (await call('GET', '/auth/session', undefined, cookie)).body.user;
  // The reset email is sent in the background after the response.
  const nextMail = async (count) => {
    for (let i = 0; i < 100 && mail.outbox.length < count; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(mail.outbox.length, count);
    return mail.outbox[count - 1];
  };
  try {
    const first = (
      await call('POST', '/auth/signup', {
        email: 'p@example.com',
        password: 'first-password',
      })
    ).cookie;
    const second = (await signIn('first-password')).cookie;

    await t.test('change password keeps this session only', async () => {
      assert.equal(
        (await call('POST', '/auth/password', {
          current_password: 'x',
          new_password: 'second-password',
        })).status,
        401,
      );
      const wrong = await call(
        'POST',
        '/auth/password',
        { current_password: 'nope-nope', new_password: 'second-password' },
        first,
      );
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.message, 'Current password is incorrect.');
      assert.equal(
        (await call('POST', '/auth/password', {
          current_password: 'first-password',
          new_password: '123',
        }, first)).status,
        400,
      );
      const ok = await call(
        'POST',
        '/auth/password',
        { current_password: 'first-password', new_password: 'second-password' },
        first,
      );
      assert.equal(ok.status, 201);
      assert.ok(await session(first));
      assert.equal(await session(second), null);
      assert.equal((await signIn('first-password')).status, 401);
      assert.equal((await signIn('second-password')).status, 201);
      const notice = await nextMail(1);
      assert.equal(notice.to, 'p@example.com');
      assert.match(notice.subject, /password was changed/);
    });

    await t.test('forgot password does not reveal accounts', async () => {
      const unknown = await call('POST', '/auth/forgot-password', {
        email: 'nobody@example.com',
      });
      assert.equal(unknown.status, 201);
      assert.deepEqual(unknown.body, { ok: true });
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(mail.outbox.length, 1);
      assert.equal(
        (await call('POST', '/auth/forgot-password', { email: 'nope' })).status,
        400,
      );
    });

    await t.test('reset link works once and signs out everywhere', async () => {
      const active = (await signIn('second-password')).cookie;
      const request = await call('POST', '/auth/forgot-password', {
        email: 'P@example.com',
      });
      assert.deepEqual(request.body, { ok: true });
      const email = await nextMail(2);
      assert.equal(email.to, 'p@example.com');
      const link = new URL(email.text.match(/https?:\/\/\S+/)[0]);
      assert.equal(link.origin, 'http://localhost:4333');
      assert.equal(link.pathname, '/reset-password');
      const token = link.searchParams.get('token');
      const stored = await db.one('SELECT token_hash FROM password_resets');
      assert.notEqual(stored.token_hash, token);

      assert.equal(
        (await call('POST', '/auth/reset-password', {
          token: 'A'.repeat(43),
          password: 'third-password',
        })).status,
        400,
      );
      assert.equal(
        (await call('POST', '/auth/reset-password', {
          token,
          password: '123',
        })).status,
        400,
      );
      const reset = await call('POST', '/auth/reset-password', {
        token,
        password: 'third-password',
      });
      assert.equal(reset.status, 201);
      assert.equal(await session(active), null);
      assert.equal((await signIn('second-password')).status, 401);
      assert.equal((await signIn('third-password')).status, 201);
      assert.match((await nextMail(3)).subject, /password was reset/);
      const again = await call('POST', '/auth/reset-password', {
        token,
        password: 'fourth-password',
      });
      assert.equal(again.status, 400);
      assert.equal(again.body.message, 'This reset link is invalid or has expired.');
    });

    await t.test('expired reset links are rejected', async () => {
      await call('POST', '/auth/forgot-password', { email: 'p@example.com' });
      const token = new URL(
        (await nextMail(4)).text.match(/https?:\/\/\S+/)[0],
      ).searchParams.get('token');
      await db.run('UPDATE password_resets SET expires_at=$1', [Date.now() - 1]);
      assert.equal(
        (await call('POST', '/auth/reset-password', {
          token,
          password: 'fifth-password',
        })).status,
        400,
      );
      assert.equal((await signIn('third-password')).status, 201);
    });
  } finally {
    await app.close();
    await database.drop();
  }
});
