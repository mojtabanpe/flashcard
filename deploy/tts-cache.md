# Redis speech cache

Successful TTS responses are cached for at least 86,400 seconds. Set `TTS_CACHE_TTL_SECONDS` to increase this duration; lower or invalid values cannot shorten it below one day.

Cache keys hash the authenticated user, provider endpoint, model and trimmed text. Audio and its content type are stored together, with an atomic Redis expiry. Errors, empty audio and invalid response types are not cached. Identical concurrent requests share one upstream generation. Cached audio remains usable when the upstream TTS provider is unavailable. If Redis is unavailable, speech falls back to the provider.

The deployment runs a dedicated `recall-redis-1` container on `127.0.0.1:16379`. AOF persistence uses the `recall_redis-data` volume. The `noeviction` policy prevents early eviction of existing entries; at the 256 MB limit, new cache writes fail gracefully and those responses are returned uncached. Do not remove the volume during releases.

The authenticated pronunciation endpoint returns `X-TTS-Cache: HIT`, `MISS` (generated and stored) or `BYPASS` (not stored). Cache access still requires authentication and the existing rate limits.

To check Redis without exposing texts, keys or credentials:

```sh
ssh flashcard 'docker exec recall-redis-1 redis-cli ping'
ssh flashcard 'docker exec recall-redis-1 redis-cli info memory'
```

For local cache integration tests, start a test Redis and provide `REDIS_TEST_URL`:

```sh
REDIS_TEST_URL=redis://127.0.0.1:16379 pnpm api:test
```

The GitHub test job supplies its own Redis service. Tests cover real Redis reads/writes, TTL enforcement, expiration, corrupted entries, user/model isolation, provider failures, concurrency and fallback when Redis is unavailable.
