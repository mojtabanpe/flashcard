const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createApp } = require('../dist/server/src/bootstrap');

test('reading texts are private to their owner', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-texts-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
  delete process.env.FRONTEND_PATH;
  delete process.env.SIGNUP_ENABLED;
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
  const call = (method, path, body, cookie) => fetch(base + '/api' + path, { method, headers: {
    'Content-Type': 'application/json', 'X-Recall-Client': 'web', ...(cookie ? { Cookie: cookie } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  const signup = async email => (await call('POST', '/auth/signup', { email, password: 'test-password' })).headers.get('set-cookie').split(';')[0];
  try {
    assert.equal((await call('GET', '/texts')).status, 401);
    const alice = await signup('alice-texts@example.com'), bob = await signup('bob-texts@example.com');
    const created = await call('POST', '/texts', { title: ' Morning ', body: ' The sun rose.\n\nBirds sang. ' }, alice);
    assert.equal(created.status, 201);
    const text = await created.json();
    assert.equal(text.title, 'Morning');
    assert.equal(text.body, 'The sun rose.\n\nBirds sang.');
    assert.equal((await (await call('GET', '/texts', undefined, alice)).json()).length, 1);
    assert.deepEqual(await (await call('GET', '/texts', undefined, bob)).json(), []);
    assert.equal((await call('GET', '/texts/' + text.id, undefined, bob)).status, 404);
    assert.equal((await call('DELETE', '/texts/' + text.id, undefined, bob)).status, 404);
    assert.equal((await call('POST', '/texts', { title: 'x', body: ' ' }, alice)).status, 400);
    assert.equal((await call('POST', '/texts', { title: 'x', body: 'y'.repeat(50001) }, alice)).status, 400);
    assert.equal((await call('DELETE', '/texts/' + text.id, undefined, alice)).status, 200);
    assert.equal((await call('GET', '/texts/' + text.id, undefined, alice)).status, 404);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
