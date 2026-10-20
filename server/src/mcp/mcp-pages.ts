import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
function page(
  res: Response,
  title: string,
  body: string,
  script = '',
  callbackOrigin = '',
) {
  const nonce = randomBytes(18).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self' ${callbackOrigin}; base-uri 'none'; frame-ancestors 'none'`,
  );
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} · Recall</title><style nonce="${nonce}">body{font:1rem/1.6 system-ui,sans-serif;background:#faf8f3;color:#25231e;margin:0;padding:1.5rem}main{max-width:42rem;margin:3rem auto}a{color:#644212}label{display:block;margin-top:1rem}input,textarea,button{font:inherit;box-sizing:border-box;max-width:100%;padding:.65rem;border:1px solid #827b6e;border-radius:.4rem}input,textarea{width:100%;background:white;color:inherit}button{cursor:pointer;margin:.75rem .5rem .5rem 0;background:#302a21;color:white;min-height:44px}code{overflow-wrap:anywhere}li{margin:.75rem 0}small{display:block}#status{white-space:pre-wrap}textarea{min-height:6rem}h1{line-height:1.2}</style></head><body><main><a href="/">Return to Recall</a><h1>${escapeHtml(title)}</h1>${body}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`,
    );
}
export function consentPage(
  res: Response,
  request: string,
  client: string,
  scopes: string[],
  redirectUri: string,
) {
  page(
    res,
    'Connect Recall',
    `<p><strong>${escapeHtml(client)}</strong> is requesting these permissions:</p><ul>${scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul><p>Enter a personal token created on the <a href="/api/mcp/setup" target="_blank" rel="noopener">ChatGPT connection page</a>. Approving allows this connection to use the listed tools for the account that owns the token.</p><form method="post" action="/api/mcp/consent"><input type="hidden" name="request" value="${escapeHtml(request)}"><label for="token">Personal token</label><input id="token" name="token" type="password" autocomplete="off" required maxlength="100" spellcheck="false"><button type="submit">Authorize connection</button><a href="/">Cancel</a></form>`,
    '',
    new URL(redirectUri).origin,
  );
}
export function errorPage(res: Response, message: string) {
  page(
    res.status(400),
    'Connection unsuccessful',
    `<p role="alert">${escapeHtml(message)}</p><p>Return to ChatGPT and start the connection again.</p>`,
  );
}
export function setupPage(res: Response, resource: string) {
  page(
    res,
    'Connect ChatGPT',
    `<p>Add a custom MCP server in ChatGPT with this server URL:</p><p><code>${escapeHtml(resource)}</code></p><p>Choose OAuth authentication. Leave the client ID and client secret empty to use dynamic registration. When Recall asks for authorization, enter a personal token created here.</p><p>Each token allows reading decks and cards, creating cards, and reading and creating passages. Tokens expire after 90 days. Revoking a token also disconnects apps authorized with it.</p><form id="create"><label for="name">Token name</label><input id="name" name="name" value="ChatGPT" maxlength="80" required><button type="submit">Create personal token</button></form><div id="secret" hidden><label for="new-token">Personal token — copy it now; it is shown only once</label><textarea id="new-token" readonly spellcheck="false"></textarea></div><p id="status" role="status"></p><h2>Personal tokens</h2><ul id="tokens"></ul>`,
    `
const status = document.getElementById('status');
async function api(path, method = 'GET', body) {
  const r = await fetch('/api/mcp/tokens' + path, {method, headers: {'Content-Type':'application/json','X-Recall-Client':'web'}, ...(body ? {body:JSON.stringify(body)} : {})});
  if (!r.ok) throw new Error(r.status === 401 ? 'Sign in to Recall, then reopen this page.' : 'Unable to update tokens. Reload the page and try again.');
  return r.json();
}
async function list() {
  const rows = await api(''); const ul = document.getElementById('tokens'); ul.replaceChildren();
  if (!rows.length) { const li = document.createElement('li'); li.textContent = 'No personal tokens yet. Create one to connect ChatGPT.'; ul.append(li); }
  for (const row of rows) {
    const li = document.createElement('li'), b = document.createElement('button');
    li.append(document.createTextNode(row.name + ' · expires ' + new Date(row.expires_at).toLocaleDateString() + ' '));
    b.type = 'button'; b.textContent = 'Revoke ' + row.name;
    b.onclick = async () => { b.disabled = true; try { await api('/' + row.id, 'DELETE'); status.textContent = 'Token revoked. Its connections can no longer access Recall.'; document.getElementById('secret').hidden = true; document.getElementById('new-token').value = ''; await list(); } catch (e) { status.textContent = e.message; b.disabled = false; } }; li.append(b); ul.append(li);
  }
}
document.getElementById('create').onsubmit = async e => {
  e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
  try { const r = await api('', 'POST', {name:document.getElementById('name').value}); document.getElementById('secret').hidden = false; const input = document.getElementById('new-token'); input.value = r.token; input.focus(); input.select(); status.textContent = 'Token created. Save it before leaving this page.'; await list(); } catch (err) { status.textContent = err.message; } finally { b.disabled = false; }
}; list().catch(e => status.textContent = e.message);
`,
  );
}
