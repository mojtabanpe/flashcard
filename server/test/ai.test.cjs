const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createApp } = require('../dist/server/src/bootstrap');
const { parseCardAnswer } = require('../dist/server/src/ai/ai.module');

test('parses fenced JSON and array examples', () => {
  assert.deepEqual(parseCardAnswer('```json\n{"back":" to fail to value ","examples":"- One.\\n- Two."}\n```', ' bond '), { front: 'bond', back: 'to fail to value', examples: '- One.\n- Two.' });
  assert.deepEqual(parseCardAnswer('{"front":"take","back":"x","examples":["A.","B."]}', 'took'), { front: 'take', back: 'x', examples: '- A.\n- B.' });
  assert.throws(() => parseCardAnswer('no json here', 'x'));
  assert.throws(() => parseCardAnswer('{"back":"","examples":""}', 'x'));
});

test('authenticated card-answer proxy to the 9Router chat endpoint', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-ai-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
  delete process.env.FRONTEND_PATH;
  process.env.AI_API_KEY = 'test-ai-key';
  process.env.AI_MODEL = 'test-chat-model';
  let seen = [], reply = '{"back":"to fail to appreciate something","examples":"- We take clean water for granted."}', status = 200;
  const upstream = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    seen.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(text) });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(status === 200 ? JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }] }) : 'private upstream error');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  process.env.AI_URL = 'http://127.0.0.1:' + upstream.address().port + '/v1/chat/completions';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
  const call = (path, body, cookie) => fetch(base + '/api' + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Recall-Client': 'web', ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body) });
  try {
    assert.equal((await call('/ai/card-answer', { front: 'take for granted' })).status, 401);
    const signup = await call('/auth/signup', { email: 'ai@example.com', password: 'test-password' });
    const cookie = signup.headers.get('set-cookie').split(';')[0];
    await t.test('returns definition and examples; key and model stay on the server', async () => {
      const response = await call('/ai/card-answer', { front: ' take for granted ', deck: 'word skills advanced' }, cookie);
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { front: 'take for granted', back: 'to fail to appreciate something', examples: '- We take clean water for granted.' });
      assert.equal(seen[0].path, '/v1/chat/completions');
      assert.equal(seen[0].authorization, 'Bearer test-ai-key');
      assert.equal(seen[0].body.model, 'test-chat-model');
      assert.equal(seen[0].body.stream, false);
      assert.match(seen[0].body.messages[1].content, /Deck: word skills advanced\nFront: take for granted$/);
      await call('/ai/card-answer', { front: 'took', context: ' She took the bus. ' }, cookie);
      assert.match(seen[1].body.messages[1].content, /^Front: took\nContext: She took the bus\.$/);
    });
    await t.test('rejects invalid input without calling the provider', async () => {
      assert.equal((await call('/ai/card-answer', { front: ' ' }, cookie)).status, 400);
      assert.equal((await call('/ai/card-answer', { front: 'x'.repeat(501) }, cookie)).status, 400);
      assert.equal((await call('/ai/card-answer', { front: 'bond', model: 'injected' }, cookie)).status, 400);
      assert.equal(seen.length, 2);
    });
    await t.test('provider failures and malformed answers return a generic 502', async () => {
      reply = 'Sorry, I cannot help.';
      assert.equal((await call('/ai/card-answer', { front: 'bond' }, cookie)).status, 502);
      status = 503;
      const response = await call('/ai/card-answer', { front: 'bond' }, cookie);
      assert.equal(response.status, 502);
      assert.doesNotMatch(await response.text(), /private upstream|test-ai-key/);
    });
  } finally {
    await app.close();
    await new Promise(resolve => upstream.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
