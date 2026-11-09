import assert from 'node:assert/strict';
import test from 'node:test';
import { access, loadAuthenticated, authorizedRequest } from './auth-test-context.mjs';
import { createAccessFixture, accessIssuer, accessAudience, accessJwksUrl } from './access-fixtures.mjs';
const { getAccessUser, requireAccess } = await loadAuthenticated('../src/server/auth.ts');
const { handlePageRequest } = await loadAuthenticated('../src/server/pages.ts');
const { GET: operations } = await loadAuthenticated('../src/server/api/operations.ts');
const { GET: expenses } = await loadAuthenticated('../src/server/api/expenses.ts');
const request = (token, headers = {}) => new Request('https://example.test/', { headers: { ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...headers } });

test('only verified Access JWTs supply identity; forged headers and invalid claims fail closed', async () => {
  const user = await getAccessUser(request(access.token(), { 'Cf-Access-Authenticated-User-Email': 'attacker@example.test' }));
  assert.equal(user.email, 'allowed@example.test');
  assert.deepEqual(globalThis.accessTestJwksRequests, [accessJwksUrl]);
  const other = await createAccessFixture();
  const now = Math.floor(Date.now() / 1000);
  for (const token of [
    'invalid-jwt', access.token('allowed@example.test', {}, other.privateKey),
    access.token('allowed@example.test', { iss: 'https://attacker.cloudflareaccess.com' }),
    access.token('allowed@example.test', { aud: 'different-app' }),
    access.token('allowed@example.test', { exp: now - 120 }),
    access.token('allowed@example.test', { iat: now + 600 }),
    access.token('allowed@example.test', { nbf: now + 600 }),
    ...[{ sub: undefined }, { iat: undefined }, { exp: undefined }, { email: '' }, { email: 42 }].map((overrides) => access.signedClaims({ ...access.claims(), ...overrides }))
  ]) assert.equal(await getAccessUser(request(token)), null);
  for (const headers of [{}, { 'oai-authenticated-user-email': 'allowed@example.test' }, { 'Cf-Access-Authenticated-User-Email': 'allowed@example.test' }, { Cookie: `CF_Authorization=${access.token()}` }]) {
    assert.equal(await getAccessUser(request(null, headers)), null);
  }
});

test('API authorization precedes date validation and never touches D1 on denied requests', async () => {
  let queries = 0;
  const database = { prepare() { queries++; throw new Error('D1 must not be touched'); }, batch() { queries++; throw new Error('D1 must not be touched'); } };
  for (const [handler, path] of [[operations, '/api/operations?from=invalid'], [expenses, '/api/expenses?month=invalid']]) {
    for (const [headers, status] of [
      [{}, 401], [{ 'Cf-Access-Jwt-Assertion': 'invalid' }, 401],
      [{ 'oai-authenticated-user-email': 'allowed@example.test' }, 401],
      [{ 'Cf-Access-Jwt-Assertion': access.token('denied@example.test') }, 403]
    ]) {
      const response = await handler(new Request(`https://example.test${path}`, { headers }), database);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
  assert.equal(queries, 0);
});

test('missing and invalid configuration and an empty allowlist deny access', async () => {
  const original = { ...process.env };
  try {
    for (const [team, audience] of [['', accessAudience], [new URL(accessIssuer).hostname, ''], ['http://finance-test.cloudflareaccess.com', accessAudience], ['evil.example.test', accessAudience]]) {
      process.env.CF_ACCESS_TEAM_DOMAIN = team;
      process.env.CF_ACCESS_AUD = audience;
      assert.equal((await requireAccess(authorizedRequest('https://example.test/'))).status, 503);
      assert.equal((await operations(authorizedRequest('https://example.test/api/operations?from=invalid'))).status, 503);
    }
    process.env.CF_ACCESS_TEAM_DOMAIN = new URL(accessIssuer).hostname;
    process.env.CF_ACCESS_AUD = accessAudience;
    for (const value of ['', ' , ; \n ', 'malformed-email', 'allowed@example.test,bad']) {
      process.env.ALLOWED_EMAILS = value;
      assert.equal((await requireAccess(authorizedRequest('https://example.test/'))).status, 503);
      assert.equal((await operations(authorizedRequest('https://example.test/api/operations?from=invalid'))).status, 503);
      assert.equal((await requireAccess(request())).status, 503);
    }
    delete process.env.ALLOWED_EMAILS;
    assert.equal((await requireAccess(authorizedRequest('https://example.test/'))).status, 503);
    process.env.ALLOWED_EMAILS = 'different@example.test';
    assert.equal((await requireAccess(authorizedRequest('https://example.test/'))).status, 403);
  } finally {
    for (const name of ['CF_ACCESS_TEAM_DOMAIN', 'CF_ACCESS_AUD', 'ALLOWED_EMAILS']) process.env[name] = original[name];
  }
});

test('login redirects preserve known local queries and reject redirects and authentication loops', async () => {
  for (const [destination, expected] of [
    ['/operations?month=2026-08#totals', '/operations?month=2026-08#totals'],
    ['https://evil.example/', '/'], ['//evil.example/', '/'], ['/%2fevil.example/', '/'],
    ['/%252fevil.example/', '/'], ['/\\evil.example/', '/'], ['/%5cevil.example/', '/'],
    ['/auth/login', '/'], ['/auth/logout', '/'], ['/cdn-cgi/access/logout', '/'], ['/unknown', '/']
  ]) {
    const url = new URL('/auth/login', 'https://example.test'); url.searchParams.set('return_to', destination);
    const response = await handlePageRequest(new Request(url), async () => { throw new Error('Must not render'); });
    assert.equal(response.status, 307); assert.equal(response.headers.get('location'), expected, destination);
  }
  const logout = await handlePageRequest(new Request('https://example.test/auth/logout'), async () => null);
  assert.equal(logout.status, 307); assert.equal(logout.headers.get('location'), '/cdn-cgi/access/logout');
  let rendered = false;
  const render = async () => { rendered = true; return new Response('private'); };
  assert.equal((await handlePageRequest(request(), render)).status, 401);
  assert.equal((await handlePageRequest(request(access.token('denied@example.test')), render)).status, 403);
  assert.equal(rendered, false);
  assert.equal((await handlePageRequest(authorizedRequest('https://example.test/'), render)).status, 200);
});
