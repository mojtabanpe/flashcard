const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { createApp } = require('../dist/server/src/bootstrap');
const {
  DatabaseService,
} = require('../dist/server/src/database/database.service');
const { useTestDatabase } = require('./db.cjs');
const scopes = ['cards:read', 'cards:write', 'readings:read', 'readings:write'];

test('MCP: personal tokens, OAuth PKCE, tool ownership and revocation', async (t) => {
  const database = useTestDatabase();
  process.env.NODE_ENV = 'test';
  process.env.MCP_PUBLIC_URL = 'https://recall.example';
  let app = await createApp();
  await app.listen(0, '127.0.0.1');
  let base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
  let db = app.get(DatabaseService);
  const web = async (path, method = 'GET', body, cookie) =>
    fetch(base + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Recall-Client': 'web',
        Origin: 'http://localhost:4333',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const signup = async (email) => {
    const r = await web('/auth/signup', 'POST', {
      email,
      password: 'test-password',
    });
    return {
      cookie: r.headers.get('set-cookie').split(';')[0],
      user: (await r.json()).user,
    };
  };
  const form = (path, body, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: new URLSearchParams(body),
    });
  let rpcId = 0;
  const rpc = (token, method, params = {}) =>
    fetch(base + '/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-03-26',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
  const tool = async (token, name, args = {}) => {
    const r = await rpc(token, 'tools/call', { name, arguments: args });
    assert.equal(r.status, 200);
    return (await r.json()).result;
  };
  try {
    const a = await signup('mcp-a@example.com'),
      b = await signup('mcp-b@example.com');
    const key = await (
      await web('/mcp/tokens', 'POST', { name: 'ChatGPT' }, a.cookie)
    ).json();
    const other = await (
      await web('/mcp/tokens', 'POST', { name: 'Other' }, b.cookie)
    ).json();
    const deck = await (
      await web('/decks', 'POST', { name: 'Words', color: 'sky' }, a.cookie)
    ).json();
    const foreign = await (
      await web('/decks', 'POST', { name: 'Private', color: 'sky' }, b.cookie)
    ).json();
    await t.test('discovery, setup and web CSRF stay protected', async () => {
      const r = await rpc(undefined, 'tools/list');
      assert.equal(r.status, 401);
      assert.match(r.headers.get('www-authenticate'), /resource_metadata=/);
      const meta = await (
        await fetch(base + '/.well-known/oauth-protected-resource/api/mcp')
      ).json();
      assert.equal(meta.resource, 'https://recall.example/api/mcp');
      const oauth = await (
        await fetch(base + '/.well-known/oauth-authorization-server')
      ).json();
      assert.equal(oauth.token_endpoint, 'https://recall.example/token');
      assert.equal((await web('/mcp/tokens')).status, 401);
      assert.equal(
        (
          await fetch(base + '/api/mcp/tokens', {
            method: 'POST',
            headers: { Cookie: a.cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'CSRF' }),
          })
        ).status,
        403,
      );
      const page = await web('/mcp/setup', 'GET', undefined, a.cookie);
      assert.equal(page.status, 200);
      assert.match(
        page.headers.get('content-security-policy'),
        /frame-ancestors 'none'/,
      );
      assert.match(await page.text(), /Create personal token/);
      assert.equal(
        (await fetch(base + '/api/mcp', { headers: { Cookie: a.cookie } }))
          .status,
        401,
      );
      assert.equal((await rpc('wrong', 'tools/list')).status, 401);
      const init = await (
        await rpc(key.token, 'initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        })
      ).json();
      assert.equal(init.result.serverInfo.name, 'recall');
      const tools = (await (await rpc(key.token, 'tools/list')).json()).result
        .tools;
      assert.equal(tools.length, 7);
      const update = tools.find((t) => t.name === 'update_card');
      assert.equal(update.annotations.readOnlyHint, false);
      assert.equal(update.annotations.idempotentHint, true);
      assert.deepEqual(update._meta.securitySchemes, [
        { type: 'oauth2', scopes: ['cards:write'] },
      ]);
      assert.equal(
        tools.find((t) => t.name === 'create_card').annotations.readOnlyHint,
        false,
      );
      const rows = await (
        await web('/mcp/tokens', 'GET', undefined, a.cookie)
      ).json();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].token, undefined);
      const stored = await db.one(
        'SELECT token_hash FROM mcp_keys WHERE id=$1',
        [key.id],
      );
      assert.notEqual(stored.token_hash, key.token);
    });
    await t.test(
      'tools save cards and reading passages under the token owner',
      async () => {
        const card = await tool(key.token, 'create_card', {
          deck_id: deck.id,
          front: 'سلام',
          back: 'Hello',
          unit: 'U1',
        });
        assert.equal(JSON.parse(card.content[0].text).user_id, a.user.id);
        const text = await tool(key.token, 'create_reading', {
          title: 'Travel',
          body: 'A short passage.',
        });
        assert.equal(JSON.parse(text.content[0].text).body, 'A short passage.');
        assert.equal(
          JSON.parse((await tool(key.token, 'list_readings')).content[0].text)
            .length,
          1,
        );
        assert.equal(
          JSON.parse((await tool(other.token, 'list_readings')).content[0].text)
            .length,
          0,
        );
        assert.equal(
          (
            await tool(key.token, 'create_card', {
              deck_id: foreign.id,
              front: 'steal',
              back: 'no',
            })
          ).isError,
          true,
        );
        const invalid = await (
          await rpc(key.token, 'tools/call', {
            name: 'create_reading',
            arguments: { title: ' ', body: 'x' },
          })
        ).json();
        assert.ok(invalid.error || invalid.result.isError);
        const restricted = await (
          await web(
            '/mcp/tokens',
            'POST',
            { name: 'Read only', scopes: ['cards:read'] },
            a.cookie,
          )
        ).json();
        assert.equal(
          (
            await tool(restricted.token, 'create_card', {
              deck_id: deck.id,
              front: 'no',
              back: 'no',
            })
          ).isError,
          true,
        );
        assert.equal(
          (
            await web(
              '/mcp/tokens',
              'POST',
              { name: 'Bad', scopes: ['admin'] },
              a.cookie,
            )
          ).status,
          400,
        );
        // A different account cannot revoke this key.
        await web('/mcp/tokens/' + key.id, 'DELETE', undefined, b.cookie);
        assert.equal((await rpc(key.token, 'tools/list')).status, 200);
      },
    );
    await t.test(
      'update_card edits content while preserving review state and ownership',
      async () => {
        const created = JSON.parse(
          (
            await tool(key.token, 'create_card', {
              deck_id: deck.id,
              front: 'inevitable — اجتناب‌ناپذیر',
              back: 'Impossible to avoid — اجتناب‌ناپذیر',
              unit: 'U2',
              examples: 'Old example.',
            })
          ).content[0].text,
        );
        await web(
          `/cards/${created.id}/review`,
          'POST',
          { rating: 'good' },
          a.cookie,
        );
        await web(
          `/cards/${created.id}/review`,
          'POST',
          { rating: 'again' },
          a.cookie,
        );
        await db.run(
          'UPDATE cards SET suspended=TRUE,suspensions=1 WHERE id=$1',
          [created.id],
        );
        const before = JSON.parse(
          (await tool(key.token, 'list_cards', { deck_id: deck.id })).content[0]
            .text,
        ).find((c) => c.id === created.id);
        const updated = JSON.parse(
          (
            await tool(key.token, 'update_card', {
              card_id: created.id,
              back: 'Impossible to avoid',
            })
          ).content[0].text,
        );
        assert.equal(updated.back, 'Impossible to avoid');
        for (const field of Object.keys(before).filter(
          (f) => !['back', 'updated_at'].includes(f),
        )) {
          assert.deepEqual(
            updated[field],
            before[field],
            field + ' must be preserved',
          );
        }
        const repeat = JSON.parse(
          (
            await tool(key.token, 'update_card', {
              card_id: created.id,
              back: updated.back,
            })
          ).content[0].text,
        );
        assert.equal(repeat.id, before.id);
        assert.equal(repeat.due_at, before.due_at);
        const cleared = JSON.parse(
          (
            await tool(key.token, 'update_card', {
              card_id: created.id,
              front: 'inevitable',
              unit: '',
              examples: '',
            })
          ).content[0].text,
        );
        assert.equal(cleared.front, 'inevitable');
        assert.equal(cleared.unit, '');
        assert.equal(cleared.examples, '');
        assert.equal(cleared.back, updated.back);
        const restricted = await (
          await web(
            '/mcp/tokens',
            'POST',
            {
              name: 'Read only edits',
              scopes: ['cards:read'],
            },
            a.cookie,
          )
        ).json();
        for (const token of [other.token, restricted.token]) {
          assert.equal(
            (
              await tool(token, 'update_card', {
                card_id: created.id,
                back: 'Unauthorized edit',
              })
            ).isError,
            true,
          );
        }
        assert.equal(
          (
            await tool(key.token, 'update_card', {
              card_id: '00000000-0000-4000-8000-000000000001',
              back: 'Missing card',
            })
          ).isError,
          true,
        );
        for (const args of [
          { card_id: created.id },
          { card_id: 'invalid', back: 'x' },
          { card_id: created.id, back: '' },
          { card_id: created.id, front: '' },
          { card_id: created.id, unit: 'invalid' },
          { card_id: created.id, back: 'x'.repeat(100001) },
          { card_id: created.id, back: 'x', repetitions: 0 },
          { card_id: created.id, back: 'x', deck_id: foreign.id },
        ]) {
          const result = await (
            await rpc(key.token, 'tools/call', {
              name: 'update_card',
              arguments: args,
            })
          ).json();
          assert.ok(result.error || result.result.isError);
        }
        const final = JSON.parse(
          (await tool(key.token, 'list_cards', { deck_id: deck.id })).content[0]
            .text,
        ).find((c) => c.id === created.id);
        assert.deepEqual(final, cleared);
      },
    );
    const redirect = 'https://chatgpt.com/connector_platform/oauth_redirect';
    let client;
    await t.test(
      'dynamic registration rejects untrusted callbacks',
      async () => {
        const register = (redirect_uris) =>
          fetch(base + '/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_name: 'ChatGPT',
              redirect_uris,
              token_endpoint_auth_method: 'none',
              grant_types: ['authorization_code', 'refresh_token'],
              response_types: ['code'],
            }),
          });
        assert.equal(
          (await register(['https://evil.example/callback'])).status,
          400,
        );
        const r = await register([redirect]);
        assert.equal(r.status, 201);
        client = await r.json();
      },
    );
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const params = {
      client_id: client.client_id,
      redirect_uri: redirect,
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state: 'original-state',
      resource: 'https://recall.example/api/mcp',
      scope: scopes.join(' '),
    };
    let code, access, refresh;
    await t.test(
      'OAuth consent binds the browser, state, callback and PKCE',
      async () => {
        const r = await fetch(
          base + '/authorize?' + new URLSearchParams(params),
          { redirect: 'manual' },
        );
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('referrer-policy'), 'same-origin');
        assert.match(
          r.headers.get('content-security-policy'),
          /form-action 'self' https:\/\/chatgpt\.com/,
        );
        const html = await r.text(),
          request = html.match(/name="request" value="([^"]+)"/)[1],
          cookie = r.headers.get('set-cookie').split(';')[0];
        assert.equal(
          (
            await form(
              '/api/mcp/consent',
              { request, token: key.token },
              { Origin: 'https://evil.example', Cookie: cookie },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await form(
              '/api/mcp/consent',
              { request, token: key.token },
              { Origin: 'https://recall.example' },
            )
          ).status,
          400,
        );
        const consent = await form(
          '/api/mcp/consent',
          { request, token: key.token },
          { Origin: 'https://recall.example', Cookie: cookie },
        );
        assert.equal(consent.status, 303);
        const target = new URL(consent.headers.get('location'));
        assert.equal(target.searchParams.get('state'), 'original-state');
        code = target.searchParams.get('code');
        const exchange = (extra) =>
          form('/token', {
            grant_type: 'authorization_code',
            client_id: client.client_id,
            code,
            code_verifier: verifier,
            redirect_uri: redirect,
            resource: params.resource,
            ...extra,
          });
        assert.equal(
          (
            await exchange({
              code_verifier: randomBytes(32).toString('base64url'),
            })
          ).status,
          400,
        );
        assert.equal(
          (await exchange({ redirect_uri: 'https://chatgpt.com/wrong' }))
            .status,
          400,
        );
        assert.equal(
          (await exchange({ resource: 'https://evil.example/mcp' })).status,
          400,
        );
        const tokens = await exchange({});
        assert.equal(tokens.status, 200);
        const body = await tokens.json();
        access = body.access_token;
        refresh = body.refresh_token;
        assert.equal((await exchange({})).status, 400);
        assert.equal((await rpc(access, 'tools/list')).status, 200);
      },
    );
    await t.test(
      'OAuth survives restart, rotates refresh tokens and rejects scope escalation',
      async () => {
        await app.close();
        app = await createApp();
        await app.listen(0, '127.0.0.1');
        base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
        db = app.get(DatabaseService);
        assert.equal((await rpc(access, 'tools/list')).status, 200);
        assert.equal(
          (
            await form('/token', {
              grant_type: 'refresh_token',
              client_id: client.client_id,
              refresh_token: refresh,
              scope: 'admin',
            })
          ).status,
          400,
        );
        const r = await form('/token', {
          grant_type: 'refresh_token',
          client_id: client.client_id,
          refresh_token: refresh,
          scope: 'cards:read',
        });
        assert.equal(r.status, 200);
        const body = await r.json();
        assert.equal(
          (
            await form('/token', {
              grant_type: 'refresh_token',
              client_id: client.client_id,
              refresh_token: refresh,
            })
          ).status,
          400,
        );
        access = body.access_token;
        refresh = body.refresh_token;
        assert.equal(
          (await tool(access, 'create_reading', { title: 'No', body: 'No' }))
            .isError,
          true,
        );
      },
    );
    await t.test(
      'bans and token revocation immediately disable personal and OAuth access',
      async () => {
        await db.run(
          "UPDATE users SET banned_until=now()+interval '1 hour' WHERE id=$1",
          [a.user.id],
        );
        assert.equal((await rpc(key.token, 'tools/list')).status, 401);
        assert.equal((await rpc(access, 'tools/list')).status, 401);
        await db.run('UPDATE users SET banned_until=NULL WHERE id=$1', [
          a.user.id,
        ]);
        await web('/mcp/tokens/' + key.id, 'DELETE', undefined, a.cookie);
        assert.equal((await rpc(key.token, 'tools/list')).status, 401);
        assert.equal((await rpc(access, 'tools/list')).status, 401);
        assert.equal(
          (
            await form('/token', {
              grant_type: 'refresh_token',
              client_id: client.client_id,
              refresh_token: refresh,
            })
          ).status,
          400,
        );
        assert.equal((await rpc(other.token, 'tools/list')).status, 200);
      },
    );
  } finally {
    await app.close();
    await database.drop();
    delete process.env.MCP_PUBLIC_URL;
  }
});
