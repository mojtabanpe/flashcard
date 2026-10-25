const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/server/src/bootstrap');
const { useTestDatabase } = require('./db.cjs');
const { MailService } = require('../dist/server/src/mail/mail.service');

test('sign up requires a confirmed email', async () => {
  const database = useTestDatabase();
  process.env.NODE_ENV = 'test';
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const url = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const mail = app.get(MailService);
  const call = async (path, body) => {
    const r = await fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Recall-Client': 'web', Origin: 'http://localhost:4333' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie') };
  };
  const nextMail = async (count) => {
    for (let i = 0; i < 100 && mail.outbox.length < count; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(mail.outbox.length, count);
    return mail.outbox[count - 1];
  };
  const tokenOf = (message) => new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  const credentials = { email: 'v@example.com', password: 'first-password' };
  try {
    const signup = await call('/auth/signup', credentials);
    assert.equal(signup.status, 201);
    assert.equal(signup.cookie, null);
    assert.equal(signup.body.verify, true);
    const first = await nextMail(1);
    assert.match(first.subject, /Confirm/);

    const blocked = await call('/auth/signin', credentials);
    assert.equal(blocked.status, 403);

    await call('/auth/resend-verification', { email: credentials.email });
    const second = await nextMail(2);
    assert.equal((await call('/auth/verify-email', { token: tokenOf(first) })).status, 400);

    assert.equal((await call('/auth/verify-email', { token: tokenOf(second) })).status, 201);
    assert.equal((await call('/auth/verify-email', { token: tokenOf(second) })).status, 400);
    assert.equal((await call('/auth/signin', credentials)).status, 201);

    await call('/auth/resend-verification', { email: credentials.email });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(mail.outbox.length, 2, 'no link for a confirmed account');
  } finally {
    await app.close();
    await database.drop();
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
  }
});
