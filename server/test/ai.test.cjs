const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createApp } = require('../dist/server/src/bootstrap');
const { useTestDatabase } = require('./db.cjs');
const { parseCardAnswer, parseReadingText } = require('../dist/server/src/ai/ai.module');

test('parses fenced JSON and array examples', () => {
  assert.deepEqual(parseCardAnswer('```json\n{"back":" to fail to value ","examples":"- One.\\n- Two."}\n```', ' bond '), { front: 'bond', back: 'to fail to value', examples: '- One.\n- Two.' });
  assert.deepEqual(parseCardAnswer('{"front":"take","back":"x","examples":["A.","B."]}', 'took'), { front: 'take', back: 'x', examples: '- A.\n- B.' });
  assert.throws(() => parseCardAnswer('no json here', 'x'));
  assert.throws(() => parseCardAnswer('{"back":"","examples":""}', 'x'));
});

test('parses generated reading texts', () => {
  const words = Array(450).fill('word').join(' ');
  assert.deepEqual(parseReadingText('```\n# **Title: "Quiet Robots"**\n\n' + words + '.\n\n\n\n## Part two\n' + words + '\n```'), {
    title: 'Quiet Robots', body: words + '.\n\n' + words,
  });
  assert.throws(() => parseReadingText('Title\n\nToo short to read for fifteen minutes.'));
  assert.throws(() => parseReadingText(''));
});

test('authenticated card-answer proxy to the 9Router chat endpoint', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'recall-ai-'));
  process.env.NODE_ENV = 'test';
  const database = useTestDatabase();
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
    await t.test('writes a reading text for a chosen topic and level', async () => {
      status = 200;
      seen = [];
      const words = Array(950).fill('word').join(' ');
      reply = 'The Quiet Revolution in Batteries\n\n' + words + '.\n\n' + words + '.';
      assert.equal((await call('/ai/reading-text', { topic: 'technology' })).status, 401);
      const response = await call('/ai/reading-text', { topic: 'technology', level: 'C1' }, cookie);
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { title: 'The Quiet Revolution in Batteries', body: words + '.\n\n' + words + '.' });
      assert.match(seen[0].body.messages[0].content, /about 1,000 words/);
      assert.equal(seen[0].body.messages[1].content, 'Topic: Technology\nLevel: C1 (advanced)');
      await call('/ai/reading-text', { topic: 'travel' }, cookie);
      assert.equal(seen[1].body.messages[1].content, 'Topic: Travel\nLevel: B2 (upper-intermediate)');
      for (const body of [{}, { topic: 'politics' }, { topic: 'sports', level: 'A1' }, { topic: 'sports', words: 5000 }])
        assert.equal((await call('/ai/reading-text', body, cookie)).status, 400);
      assert.equal(seen.length, 2);
      reply = 'Too short';
      assert.equal((await call('/ai/reading-text', { topic: 'sports' }, cookie)).status, 502);
    });
    await t.test('rates AI texts and writes the next one from the latest rated text\'s notes', async () => {
      status = 200;
      const words = Array(950).fill('word').join(' ');
      reply = 'Second Draft\n\n' + words + '.\n\n' + words + '.';
      const patch = (id, body) => fetch(base + '/api/texts/' + id + '/review', { method: 'PATCH', headers: {
        'Content-Type': 'application/json', 'X-Recall-Client': 'web', Cookie: cookie }, body: JSON.stringify(body) });
      const make = async (title, ai) => (await (await call('/texts', { title, body: 'Some body.', ...(ai ? { ai } : {}) }, cookie)).json());
      const first = await make('Old Rated', true), manual = await make('Typed By Hand', false), latest = await make('Newest Rated', true);
      assert.equal(first.ai, true); assert.equal(first.rating, null);
      assert.equal((await patch(manual.id, { rating: 4 })).status, 400);
      for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { note: 'x' }])
        assert.equal((await patch(first.id, bad)).status, 400);
      seen = [];
      await call('/ai/reading-text', { topic: 'travel' }, cookie);
      assert.equal(seen[0].body.messages[1].content, 'Topic: Travel\nLevel: B2 (upper-intermediate)', 'no rated text yet');
      assert.equal((await patch(first.id, { rating: 2, note: 'Too many idioms.' })).status, 200);
      const rated = await (await patch(latest.id, { rating: 5, note: '  Loved the short paragraphs.  ' })).json();
      assert.equal(rated.rating, 5);
      assert.equal(rated.review_note, 'Loved the short paragraphs.');
      const response = await call('/ai/reading-text', { topic: 'travel' }, cookie);
      assert.equal((await response.json()).feedback_from, 'Newest Rated');
      const prompt = seen[1].body.messages[1].content;
      assert.match(prompt, /rated their previous text "Newest Rated" 5 out of 5/);
      assert.match(prompt, /Loved the short paragraphs\./);
      assert.doesNotMatch(prompt, /Too many idioms/);
      assert.match(prompt, /extra care/);
    });
  } finally {
    await app.close();
    await new Promise(resolve => upstream.close(resolve));
    await database.drop();
    rmSync(dir, { recursive: true, force: true });
  }
});
