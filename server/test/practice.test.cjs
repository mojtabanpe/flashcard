const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../dist/server/src/bootstrap');
const { useTestDatabase } = require('./db.cjs');
const { parseDialogue, parseWritingFeedback, parseWritingTask } = require('../dist/server/src/practice/practice.module');

test('parses practice answers and drops malformed parts', () => {
  assert.deepEqual(parseWritingTask('```json\n{"scenario":" Reply to Sam. ","message":"Fancy a coffee?"}\n```'), { scenario: 'Reply to Sam.', message: 'Fancy a coffee?' });
  assert.deepEqual(parseWritingTask('{"scenario":"Leave a note."}'), { scenario: 'Leave a note.', message: '' });
  assert.throws(() => parseWritingTask('{"message":"hi"}'));
  const feedback = parseWritingFeedback(JSON.stringify({
    corrected: 'I went there.', natural: 'I was there.', comment: 'Nice!',
    mistakes: [{ original: 'I go', fix: 'I went', why: 'past' }, { original: '', fix: 'x' }, 'junk'],
    phrases: [{ phrase: 'pop in', meaning: 'visit briefly' }, { phrase: 'no meaning' }],
  }));
  assert.deepEqual(feedback.mistakes, [{ original: 'I go', fix: 'I went', why: 'past' }]);
  assert.deepEqual(feedback.phrases, [{ phrase: 'pop in', meaning: 'visit briefly' }]);
  assert.throws(() => parseWritingFeedback('{"corrected":"x"}'));
  const lines = Array.from({ length: 6 }, (_, i) => ({ speaker: i % 2 ? 'Ben' : 'Amy', text: 'Line ' + i }));
  const dialogue = parseDialogue(JSON.stringify({
    title: 'At the café', lines,
    questions: [{ question: 'Who?', options: ['Amy', 'Ben'], answer: 1 }, { question: 'Bad', options: ['a', 'b'], answer: 5 }],
    phrases: [{ phrase: 'grab a bite', meaning: 'eat something quickly' }],
  }));
  assert.equal(dialogue.lines.length, 6);
  assert.deepEqual(dialogue.questions, [{ question: 'Who?', options: ['Amy', 'Ben'], answer: 1 }]);
  assert.throws(() => parseDialogue(JSON.stringify({ title: 'x', lines: lines.slice(0, 2) })));
});

test('practice endpoints call the chat gateway with the situation and level', async (t) => {
  const database = useTestDatabase();
  process.env.NODE_ENV = 'test';
  delete process.env.FRONTEND_PATH;
  process.env.AI_API_KEY = 'test-ai-key';
  let seen = [], reply = '';
  const upstream = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    seen.push(JSON.parse(text));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }] }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  process.env.AI_URL = 'http://127.0.0.1:' + upstream.address().port + '/v1/chat/completions';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const call = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Recall-Client': 'web', ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body) });
  try {
    assert.equal((await call('/ai/practice/writing-task', { situation: 'cafe' })).status, 401);
    const signup = await call('/auth/signup', { email: 'practice@example.com', password: 'test-password' });
    const cookie = signup.headers.get('set-cookie').split(';')[0];

    await t.test('writing task and feedback', async () => {
      reply = '{"scenario":"Your friend texts you.","message":"Free tonight?"}';
      const task = await call('/ai/practice/writing-task', { situation: 'texting', level: 'B2' }, cookie);
      assert.equal(task.status, 201);
      assert.deepEqual(await task.json(), { scenario: 'Your friend texts you.', message: 'Free tonight?' });
      assert.equal(seen[0].messages[1].content, 'Situation: Texting a friend\nLevel: B2 (upper-intermediate)');
      assert.match(seen[0].messages[0].content, /everyday conversation/);

      reply = '{"corrected":"Yes, I am free.","natural":"Yeah, I\'m free!","mistakes":[],"phrases":[],"comment":"Good."}';
      const feedback = await call('/ai/practice/writing-feedback', {
        situation: 'texting', scenario: 'Your friend texts you.', message: 'Free tonight?', answer: ' Yes I am free ',
      }, cookie);
      assert.equal(feedback.status, 201);
      assert.equal((await feedback.json()).natural, "Yeah, I'm free!");
      assert.match(seen[1].messages[1].content, /^Situation: Texting a friend\nLevel: B1 \(intermediate\)\nTask: Your friend texts you\.\nThe other person said: Free tonight\?\nThe learner's answer:\n---\nYes I am free\n---$/);
    });

    await t.test('dialogue', async () => {
      const lines = Array.from({ length: 10 }, (_, i) => ({ speaker: i % 2 ? 'Ben' : 'Amy', text: 'Hi ' + i }));
      reply = JSON.stringify({ title: 'Coffee break', lines, questions: [], phrases: [] });
      const response = await call('/ai/practice/dialogue', { situation: 'work', level: 'C1' }, cookie);
      assert.equal(response.status, 201);
      assert.equal((await response.json()).lines.length, 10);
      assert.equal(seen[2].messages[1].content, 'Situation: At work\nLevel: C1 (advanced)');
    });

    await t.test('rejects bad input and bad answers', async () => {
      const before = seen.length;
      for (const body of [{}, { situation: 'politics' }, { situation: 'cafe', level: 'A1' }, { situation: 'cafe', extra: 1 }])
        assert.equal((await call('/ai/practice/dialogue', body, cookie)).status, 400);
      assert.equal((await call('/ai/practice/writing-feedback', { situation: 'cafe', scenario: 'x', answer: ' ' }, cookie)).status, 400);
      assert.equal(seen.length, before);
      reply = 'Sorry, no.';
      assert.equal((await call('/ai/practice/dialogue', { situation: 'cafe' }, cookie)).status, 502);
    });
  } finally {
    await app.close();
    await new Promise((resolve) => upstream.close(resolve));
    await database.drop();
  }
});
