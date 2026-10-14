const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { createClient } = require('redis');
require('reflect-metadata');
const {
  AudioCacheService,
} = require('../dist/server/src/pronunciation/audio-cache/audio-cache.service');
const {
  SpeechService,
  speechCacheKey,
} = require('../dist/server/src/pronunciation/speech/speech.service');

test(
  'real Redis: TTS reuse, 24-hour TTL, expiry, concurrency, isolation and failures',
  { skip: !process.env.REDIS_TEST_URL },
  async (t) => {
    process.env.REDIS_URL = process.env.REDIS_TEST_URL;
    process.env.TTS_CACHE_TTL_SECONDS = '60';
    process.env.TTS_API_KEY = 'fixture-key';
    process.env.TTS_MODEL = 'fixture-model';
    let requests = 0,
      mode = 'audio';
    const upstream = createServer(async (req, res) => {
      requests++;
      for await (const part of req) {
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (mode === 'error') {
        res.writeHead(502);
        res.end('provider error');
        return;
      }
      if (mode === 'invalid') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(mode === 'empty' ? '' : 'ID3-redis-fixture');
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const endpoint =
      'http://127.0.0.1:' + upstream.address().port + '/v1/audio/speech';
    process.env.TTS_URL = endpoint;
    const redis = createClient({ url: process.env.REDIS_TEST_URL });
    redis.on('error', () => {});
    await redis.connect();
    const cache = new AudioCacheService();
    cache.onModuleInit();
    const owner = randomUUID(),
      keys = new Set();
    const key = (text, user = owner, model = process.env.TTS_MODEL) => {
      const k = speechCacheKey(user, endpoint, model, text);
      keys.add(k);
      return k;
    };
    const speak = (service, text, user = owner) => {
      key(text, user);
      return service.speak(user, text);
    };
    const service = new SpeechService(cache);
    try {
      const until = Date.now() + 5000;
      while (!cache.client.isReady && Date.now() < until)
        await new Promise((r) => setTimeout(r, 25));
      assert.equal(cache.client.isReady, true);
      await t.test(
        'identical normalized requests reuse binary audio with minimum one-day expiry',
        async () => {
          const first = await speak(service, ' hello ');
          assert.equal(first.cacheStatus, 'MISS');
          const second = await speak(service, 'hello');
          assert.equal(second.cacheStatus, 'HIT');
          assert.deepEqual(first.audio, second.audio);
          assert.equal(second.contentType, 'audio/mpeg');
          assert.equal(requests, 1);
          const ttl = await redis.ttl(key('hello'));
          assert.ok(ttl >= 86398 && ttl <= 86400);
          assert.doesNotMatch(key('hello'), /hello|fixture-key/);
          const restarted = new SpeechService(cache);
          assert.equal((await speak(restarted, 'hello')).cacheStatus, 'HIT');
        },
      );
      await t.test(
        'cache hits work while the provider is failing; errors and invalid audio are not cached',
        async () => {
          mode = 'error';
          assert.equal((await speak(service, 'hello')).cacheStatus, 'HIT');
          const before = requests;
          await assert.rejects(speak(service, 'uncached error'));
          await assert.rejects(speak(service, 'uncached error'));
          assert.equal(requests, before + 2);
          assert.equal(await redis.exists(key('uncached error')), 0);
          for (const format of ['invalid', 'empty']) {
            mode = format;
            await assert.rejects(speak(service, format));
            assert.equal(await redis.exists(key(format)), 0);
          }
          mode = 'audio';
          assert.equal(
            (await speak(service, 'uncached error')).cacheStatus,
            'MISS',
          );
        },
      );
      await t.test(
        'model and user differences produce separate cached results',
        async () => {
          const before = requests;
          process.env.TTS_MODEL = 'other-model';
          assert.equal((await speak(service, 'hello')).cacheStatus, 'MISS');
          process.env.TTS_MODEL = 'fixture-model';
          assert.equal(
            (await speak(service, 'hello', randomUUID())).cacheStatus,
            'MISS',
          );
          assert.equal(requests, before + 2);
        },
      );
      await t.test(
        'simultaneous duplicate requests share one upstream generation',
        async () => {
          const before = requests;
          const results = await Promise.all(
            Array.from({ length: 8 }, () => speak(service, 'concurrent')),
          );
          assert.equal(requests, before + 1);
          assert.ok(results.every((r) => r.audio.equals(results[0].audio)));
          assert.equal((await speak(service, 'concurrent')).cacheStatus, 'HIT');
        },
      );
      await t.test(
        'expired and corrupted entries are regenerated',
        async () => {
          await redis.pExpire(key('hello'), 1);
          await new Promise((r) => setTimeout(r, 15));
          assert.equal((await speak(service, 'hello')).cacheStatus, 'MISS');
          await redis.set(key('hello'), 'broken json');
          assert.equal((await speak(service, 'hello')).cacheStatus, 'MISS');
          assert.ok((await redis.ttl(key('hello'))) >= 86398);
        },
      );
      await t.test('speech continues when Redis is unavailable', async () => {
        cache.onModuleDestroy();
        const result = await speak(service, 'redis unavailable');
        assert.equal(result.cacheStatus, 'BYPASS');
      });
    } finally {
      cache.onModuleDestroy();
      if (keys.size) await redis.del([...keys]);
      redis.destroy();
      await new Promise((resolve) => upstream.close(resolve));
    }
  },
);
