const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createApp } = require('../dist/server/src/bootstrap');
const { useTestDatabase } = require('./db.cjs');

test('production routing and authenticated speech proxy', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-speech-'));
  process.env.NODE_ENV = 'test';
  const database = useTestDatabase();
  process.env.FRONTEND_PATH = join(dir, 'public');
  process.env.TTS_API_KEY = 'test-server-key';
  process.env.TTS_MODEL = 'test-model';
  mkdirSync(process.env.FRONTEND_PATH);
  writeFileSync(join(process.env.FRONTEND_PATH, 'index.html'), '<html>Recall frontend fixture</html>');
  let seen = [], fail = false;
  const upstream = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    seen.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(text) });
    if (fail) { res.writeHead(503); res.end('private upstream error'); }
    else { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); res.end('ID3-audio-fixture'); }
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  process.env.TTS_URL = 'http://127.0.0.1:' + upstream.address().port + '/v1/audio/speech';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
  const call = (path, body, cookie) => fetch(base + '/api' + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Recall-Client': 'web', ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body) });
  try {
    await t.test('health is public, SPA fallback preserves deep links and unknown API routes stay 404', async () => {
      assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok' });
      assert.match(await (await fetch(base + '/deck/example/study')).text(), /Recall frontend fixture/);
      assert.equal((await fetch(base + '/api/not-found')).status, 404);
    });
    assert.equal((await call('/pronunciation', { text: 'bond' })).status, 401);
    assert.equal(seen.length, 0);
    const signup = await call('/auth/signup', { email: 'speech@example.com', password: 'test-password' });
    const cookie = signup.headers.get('set-cookie').split(';')[0];
    await t.test('speech is binary and the provider key/model stay on the server', async () => {
      const response = await call('/pronunciation', { text: ' bond ' }, cookie);
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('content-type').split(';')[0], 'audio/mpeg');
      assert.equal(await response.text(), 'ID3-audio-fixture');
      assert.deepEqual(seen[0], { path: '/v1/audio/speech', authorization: 'Bearer test-server-key', body: { input: 'bond', model: 'test-model' } });
      assert.equal((await call('/pronunciation', { text: ' ', model: 'injected' }, cookie)).status, 400);
      assert.equal((await call('/pronunciation', { text: 'x'.repeat(2001) }, cookie)).status, 400);
      assert.equal(seen.length, 1);
    });
    await t.test('second speaker uses Eric and rejects arbitrary voices', async () => {
      const before = seen.length;
      const response = await call('/pronunciation', { text: 'Hello from Eric.', voice: 'secondary' }, cookie);
      assert.equal(response.status, 201);
      assert.equal(seen[before].body.model, 'edge-tts/en-US-EricNeural');
      assert.equal((await call('/pronunciation', { text: 'Hi', voice: 'arbitrary-model' }, cookie)).status, 400);
      assert.equal(seen.length, before + 1);
    });
    await t.test('provider failures return a generic error and signup can be disabled', async () => {
      fail = true;
      const response = await call('/pronunciation', { text: 'bond' }, cookie);
      assert.equal(response.status, 502);
      assert.doesNotMatch(await response.text(), /private upstream|test-server-key/);
      process.env.SIGNUP_ENABLED = 'false';
      assert.equal((await call('/auth/signup', { email: 'closed@example.com', password: 'test-password' })).status, 403);
    });
  } finally {
    await app.close();
    await new Promise(resolve => upstream.close(resolve));
    await database.drop();
    rmSync(dir, { recursive: true, force: true });
  }
});
