import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalJWKSet } from 'jose';
import { loadTs } from './load-ts.mjs';
import { accessAudience, accessIssuer, accessJwksUrl, createAccessFixture } from './access-fixtures.mjs';

const joseUrl = import.meta.resolve('jose');
let generation = 0;

async function authModule(team = new URL(accessIssuer).hostname, audience = accessAudience) {
  if (team === undefined) delete process.env.CF_ACCESS_TEAM_DOMAIN;
  else process.env.CF_ACCESS_TEAM_DOMAIN = team;
  if (audience === undefined) delete process.env.CF_ACCESS_AUD;
  else process.env.CF_ACCESS_AUD = audience;
  return loadTs('../src/server/auth.ts', {
    jose: `
      export * from ${JSON.stringify(joseUrl)};
      export function createRemoteJWKSet(url) {
        globalThis.accessTestJwksRequests.push(String(url));
        return globalThis.accessTestKeyResolver;
      }
      // Distinct module generation ${generation++} avoids test module caches masking configuration changes.
    `
  });
}

const request = (token, extra = {}) => new Request('https://app.example.test/', {
  headers: { ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...extra }
});

test('Cloudflare Access verifies signatures and claims and rejects spoofed identity headers', async (t) => {
  const original = { team: process.env.CF_ACCESS_TEAM_DOMAIN, audience: process.env.CF_ACCESS_AUD };
  const fixture = await createAccessFixture();
  globalThis.accessTestKeyResolver = createLocalJWKSet(fixture.jwks);
  globalThis.accessTestJwksRequests = [];
  try {
    const { getChatGPTUser } = await authModule();
    await t.test('accepts a correctly signed Access JWT and uses verified identity claims', async () => {
      const user = await getChatGPTUser(request(fixture.token(), {
        'oai-authenticated-user-email': 'spoofed@example.test',
        'Cf-Access-Authenticated-User-Email': 'spoofed@example.test'
      }));
      assert.equal(user?.email, 'allowed@example.test');
      assert.equal(user?.displayName, 'Fixture User');
      assert.equal(user?.fullName, 'Fixture User');
      assert.deepEqual(globalThis.accessTestJwksRequests, [accessJwksUrl]);
    });
    await t.test('rejects unsigned headers, a cookie-only identity, and malformed JWTs', async () => {
      for (const spoofed of [
        {},
        { 'oai-authenticated-user-email': 'allowed@example.test' },
        { 'Cf-Access-Authenticated-User-Email': 'allowed@example.test' },
        { Cookie: `CF_Authorization=${fixture.token()}` }
      ]) assert.equal(await getChatGPTUser(request(null, spoofed)), null);
      assert.equal(await getChatGPTUser(request('not-a-jwt')), null);
    });
    await t.test('rejects a valid token signed by an untrusted key', async () => {
      const other = await createAccessFixture();
      assert.equal(await getChatGPTUser(request(fixture.token('allowed@example.test', {}, other.privateKey))), null);
    });
    await t.test('rejects wrong issuer, audience, expiry, and not-before claims', async () => {
      const now = Math.floor(Date.now() / 1000);
      for (const claims of [
        { iss: 'https://attacker.cloudflareaccess.com' },
        { aud: 'different-application' },
        { exp: now - 120 },
        { nbf: now + 600 },
        { iat: now + 600 },
        { iat: now, exp: now - 1 }
      ]) assert.equal(await getChatGPTUser(request(fixture.token('allowed@example.test', claims))), null);
    });
    await t.test('rejects missing expiry, issue time, or a usable email', async () => {
      for (const overrides of [{ exp: undefined }, { iat: undefined }, { sub: undefined }, { email: undefined }, { email: '' }, { email: 42 }]) {
        assert.equal(await getChatGPTUser(request(fixture.signedClaims({ ...fixture.claims(), ...overrides }))), null);
      }
    });
    await t.test('fails closed when configuration is absent or invalid', async () => {
      for (const [team, audience] of [
        ['', accessAudience],
        [new URL(accessIssuer).hostname, ''],
        ['http://finance-test.cloudflareaccess.com', accessAudience],
        ['attacker.example.test', accessAudience]
      ]) {
        const { getChatGPTUser: configuredUser } = await authModule(team, audience);
        assert.equal(await configuredUser(request(fixture.token(), { 'oai-authenticated-user-email': 'allowed@example.test' })), null);
      }
    });
    await t.test('legacy sign-in return paths reject redirects and loops while preserving local queries', async () => {
      await authModule();
      const { handlePageRequest } = await loadTs('../src/server/pages.ts');
      for (const [destination, expected] of [
        ['/operations?month=2026-08&view=all#totals', '/operations?month=2026-08&view=all#totals'],
        ['https://evil.example/', '/'],
        ['//evil.example/', '/'],
        ['/%2fevil.example/', '/'],
        ['/%252fevil.example/', '/'],
        ['/\\evil.example/', '/'],
        ['/%5cevil.example/', '/'],
        ['/signin-with-chatgpt', '/'],
        ['/signout-with-chatgpt', '/'],
        ['/%73ignin-with-chatgpt', '/'],
        ['/callback', '/'],
        ['/cdn-cgi/access/logout', '/'],
        ['/cdn-cgi/access/login?redirect_url=https://evil.example', '/']
      ]) {
        const url = new URL('/signin-with-chatgpt', 'https://app.example.test');
        url.searchParams.set('return_to', destination);
        const response = await handlePageRequest(new Request(url), async () => {
          throw new Error('Sign-in aliases must not render');
        });
        assert.equal(response.status, 307, destination);
        assert.equal(response.headers.get('location'), expected, destination);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
      }
    });
    await t.test('missing Access configuration prevents spoofed page identity from rendering', async () => {
      delete process.env.CF_ACCESS_TEAM_DOMAIN;
      delete process.env.CF_ACCESS_AUD;
      const { handlePageRequest } = await loadTs('../src/server/pages.ts');
      let rendered = false;
      const response = await handlePageRequest(request(fixture.token(), {'oai-authenticated-user-email':'allowed@example.test'}), async () => {
        rendered = true;
        return new Response('Private dashboard');
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(rendered, false);
    });
  } finally {
    if (original.team === undefined) delete process.env.CF_ACCESS_TEAM_DOMAIN;
    else process.env.CF_ACCESS_TEAM_DOMAIN = original.team;
    if (original.audience === undefined) delete process.env.CF_ACCESS_AUD;
    else process.env.CF_ACCESS_AUD = original.audience;
    delete globalThis.accessTestKeyResolver;
    delete globalThis.accessTestJwksRequests;
  }
});
