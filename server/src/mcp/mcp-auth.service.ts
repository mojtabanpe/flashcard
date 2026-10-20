import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { PoolClient } from 'pg';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTokenError,
  InvalidTargetError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { DatabaseService } from '../database/database.service';
import { consentPage } from './mcp-pages';

export const mcpScopes = [
  'cards:read',
  'cards:write',
  'readings:read',
  'readings:write',
];
export const digest = (s: string) =>
  createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
interface Grant {
  key_id: string;
  client_id: string;
  params: AuthorizationParams;
}
interface Credential {
  key_id: string;
  client_id: string;
  scopes: string[];
  user_id: string;
  access_expires: number;
  refresh_expires: number;
}

@Injectable()
export class McpAuthService implements OAuthServerProvider {
  constructor(private readonly db: DatabaseService) {}
  get origin() {
    const url = new URL(
      process.env['MCP_PUBLIC_URL'] ||
        (process.env['APP_ORIGINS'] || 'http://localhost:3000').split(',')[0],
    );
    if (
      url.protocol !== 'https:' &&
      !(
        process.env['NODE_ENV'] !== 'production' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
    )
      throw new Error('MCP_PUBLIC_URL must use HTTPS.');
    return url.origin;
  }
  get resource() {
    return new URL('/api/mcp', this.origin);
  }
  private resourceCheck(resource?: URL) {
    if (resource && resource.href !== this.resource.href)
      throw new InvalidTargetError(
        'Token audience must be the Recall MCP endpoint.',
      );
  }
  private scopesCheck(scopes: string[]) {
    if (!scopes.every((s) => mcpScopes.includes(s)))
      throw new InvalidScopeError('Unsupported permission.');
  }
  readonly clientsStore = {
    getClient: async (
      id: string,
    ): Promise<OAuthClientInformationFull | undefined> =>
      (
        await this.db.one<{ metadata: OAuthClientInformationFull }>(
          'SELECT metadata FROM mcp_clients WHERE id=$1',
          [id],
        )
      )?.metadata,
    registerClient: async (
      client: Omit<
        OAuthClientInformationFull,
        'client_id' | 'client_id_issued_at'
      >,
    ): Promise<OAuthClientInformationFull> => {
      if (
        !client.redirect_uris.length ||
        client.redirect_uris.length > 10 ||
        !client.redirect_uris.every((uri) => {
          const u = new URL(uri);
          const hosts = (
            process.env['MCP_REDIRECT_HOSTS'] || 'chatgpt.com,chat.openai.com'
          ).split(',');
          return (
            !u.hash &&
            !u.username &&
            !u.password &&
            ((u.protocol === 'https:' &&
              !u.port &&
              hosts.includes(u.hostname)) ||
              (process.env['NODE_ENV'] !== 'production' &&
                u.protocol === 'http:' &&
                u.hostname === '127.0.0.1'))
          );
        })
      )
        throw new InvalidClientMetadataError(
          'Redirect URI must belong to an allowed ChatGPT host.',
        );
      const full = {
        ...client,
        client_id: randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };
      await this.db.run('INSERT INTO mcp_clients(id,metadata) VALUES ($1,$2)', [
        full.client_id,
        JSON.stringify(full),
      ]);
      return full;
    },
  };
  async createKey(userId: string, name: string, scopes = mcpScopes) {
    this.scopesCheck(scopes);
    const token = 'recall_mcp_' + secret(),
      id = randomUUID();
    const expires = Date.now() + 90 * 86400000;
    await this.db.run(
      'INSERT INTO mcp_keys(id,user_id,name,token_hash,scopes,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, userId, name, digest(token), scopes, expires],
    );
    return { id, token, name, scopes, expires_at: expires };
  }
  listKeys(userId: string) {
    return this.db.many(
      'SELECT id,name,scopes,created_at,expires_at FROM mcp_keys WHERE user_id=$1 ORDER BY created_at DESC',
      [userId],
    );
  }
  async revokeKey(userId: string, id: string) {
    await this.db.run('DELETE FROM mcp_keys WHERE id=$1 AND user_id=$2', [
      id,
      userId,
    ]);
    return { revoked: true };
  }
  private async key(token: string) {
    return this.db.one<{
      id: string;
      user_id: string;
      scopes: string[];
      expires_at: number;
    }>(
      `SELECT k.* FROM mcp_keys k JOIN users u ON u.id=k.user_id
      WHERE token_hash=$1 AND expires_at>$2 AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())`,
      [digest(token), Date.now()],
    );
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    this.resourceCheck(params.resource);
    const scopes = params.scopes?.length ? params.scopes : mcpScopes;
    this.scopesCheck(scopes);
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))
      throw new InvalidGrantError('Invalid PKCE challenge.');
    const request = secret(),
      csrf = secret();
    // Expired transient state never grants access and is bounded by endpoint rate limits.
    await this.db.run('DELETE FROM mcp_pending WHERE expires_at<=$1', [
      Date.now(),
    ]);
    await this.db.run('DELETE FROM mcp_codes WHERE expires_at<=$1', [
      Date.now(),
    ]);
    await this.db.run('DELETE FROM mcp_credentials WHERE refresh_expires<=$1', [
      Date.now(),
    ]);
    await this.db.run(
      'INSERT INTO mcp_pending(id,client_id,params,csrf_hash,expires_at) VALUES ($1,$2,$3,$4,$5)',
      [
        digest(request),
        client.client_id,
        JSON.stringify({ ...params, resource: this.resource.href, scopes }),
        digest(csrf),
        Date.now() + 600000,
      ],
    );
    res.cookie('recall_mcp_consent', csrf, {
      httpOnly: true,
      secure: this.origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/api/mcp/consent',
      maxAge: 600000,
    });
    consentPage(
      res,
      request,
      client.client_name || 'ChatGPT',
      scopes,
      params.redirectUri,
    );
  }
  async consent(request: string, csrf: string, token: string, res: Response) {
    const key = await this.key(token);
    if (!key)
      throw new InvalidTokenError(
        'The personal token is invalid or expired. Create a token in Recall and try connecting again.',
      );
    const pending = await this.db.one<{
      client_id: string;
      params: AuthorizationParams;
    }>(
      'SELECT * FROM mcp_pending WHERE id=$1 AND csrf_hash=$2 AND expires_at>$3',
      [digest(request), digest(csrf), Date.now()],
    );
    if (!pending)
      throw new InvalidGrantError(
        'This connection request expired. Start again in ChatGPT.',
      );
    if (!pending.params.scopes!.every((s) => key.scopes.includes(s)))
      throw new InvalidScopeError(
        'This token does not allow the requested permissions.',
      );
    const code = secret();
    await this.db.transaction(async (c) => {
      const used = await c.query(
        'DELETE FROM mcp_pending WHERE id=$1 AND csrf_hash=$2 AND expires_at>$3 RETURNING id',
        [digest(request), digest(csrf), Date.now()],
      );
      if (!used.rowCount)
        throw new InvalidGrantError('Connection request already used.');
      await c.query(
        'INSERT INTO mcp_codes(code_hash,key_id,client_id,params,expires_at) VALUES ($1,$2,$3,$4,$5)',
        [
          digest(code),
          key.id,
          pending.client_id,
          JSON.stringify(pending.params),
          Date.now() + 300000,
        ],
      );
    });
    res.clearCookie('recall_mcp_consent', { path: '/api/mcp/consent' });
    const redirect = new URL(pending.params.redirectUri);
    redirect.searchParams.set('code', code);
    if (pending.params.state)
      redirect.searchParams.set('state', pending.params.state);
    res.redirect(303, redirect.href);
  }
  private async code(
    client: OAuthClientInformationFull,
    code: string,
  ): Promise<Grant> {
    const row = await this.db.one<Grant>(
      'SELECT * FROM mcp_codes WHERE code_hash=$1 AND client_id=$2 AND expires_at>$3',
      [digest(code), client.client_id, Date.now()],
    );
    if (!row)
      throw new InvalidGrantError('Invalid or expired authorization code.');
    return row;
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    return (await this.code(client, code)).params.codeChallenge;
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ) {
    this.resourceCheck(resource);
    const grant = await this.code(client, code);
    if (redirectUri !== grant.params.redirectUri)
      throw new InvalidGrantError('Redirect URI does not match.');
    return this.db.transaction(async (c) => {
      const used = await c.query(
        'DELETE FROM mcp_codes WHERE code_hash=$1 AND client_id=$2 AND expires_at>$3 RETURNING code_hash',
        [digest(code), client.client_id, Date.now()],
      );
      if (!used.rowCount)
        throw new InvalidGrantError('Authorization code already used.');
      return this.issue(
        c,
        grant.key_id,
        client.client_id,
        grant.params.scopes!,
      );
    });
  }
  private async issue(
    c: PoolClient,
    keyId: string,
    clientId: string,
    scopes: string[],
  ): Promise<OAuthTokens> {
    const valid = await c.query(
      `SELECT k.id FROM mcp_keys k JOIN users u ON u.id=k.user_id WHERE k.id=$1 AND k.expires_at>$2 AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) FOR SHARE OF k`,
      [keyId, Date.now()],
    );
    if (!valid.rowCount)
      throw new InvalidGrantError('Personal token revoked or expired.');
    const access = secret(),
      refresh = secret();
    await c.query(
      'INSERT INTO mcp_credentials(token_hash,refresh_hash,key_id,client_id,scopes,access_expires,refresh_expires) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        digest(access),
        digest(refresh),
        keyId,
        clientId,
        scopes,
        Date.now() + 3600000,
        Date.now() + 30 * 86400000,
      ],
    );
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: scopes.join(' '),
    };
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refresh: string,
    scopes?: string[],
    resource?: URL,
  ) {
    this.resourceCheck(resource);
    return this.db.transaction(async (c) => {
      const row = (
        await c.query<Credential>(
          'SELECT * FROM mcp_credentials WHERE refresh_hash=$1 AND client_id=$2 AND refresh_expires>$3 FOR UPDATE',
          [digest(refresh), client.client_id, Date.now()],
        )
      ).rows[0];
      if (!row)
        throw new InvalidGrantError('Invalid or expired refresh token.');
      if (scopes && !scopes.every((s) => row.scopes.includes(s)))
        throw new InvalidScopeError(
          'Cannot expand permissions during refresh.',
        );
      await c.query('DELETE FROM mcp_credentials WHERE refresh_hash=$1', [
        digest(refresh),
      ]);
      return this.issue(c, row.key_id, row.client_id, scopes || row.scopes);
    });
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (token.startsWith('recall_mcp_')) {
      const key = await this.key(token);
      if (!key) throw new InvalidTokenError('Invalid personal token.');
      return {
        token,
        clientId: 'personal',
        scopes: key.scopes,
        expiresAt: Math.floor(key.expires_at / 1000),
        resource: this.resource,
        extra: { userId: key.user_id },
      };
    }
    const row = await this.db.one<Credential>(
      `SELECT t.*,k.user_id FROM mcp_credentials t JOIN mcp_keys k ON k.id=t.key_id JOIN users u ON u.id=k.user_id
      WHERE t.token_hash=$1 AND t.access_expires>$2 AND k.expires_at>$2 AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())`,
      [digest(token), Date.now()],
    );
    if (!row) throw new InvalidTokenError('Invalid or expired access token.');
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes,
      expiresAt: Math.floor(row.access_expires / 1000),
      resource: this.resource,
      extra: { userId: row.user_id },
    };
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    await this.db.run(
      'DELETE FROM mcp_credentials WHERE client_id=$1 AND (token_hash=$2 OR refresh_hash=$2)',
      [client.client_id, digest(request.token)],
    );
  }
}
