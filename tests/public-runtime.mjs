import assert from 'node:assert/strict';
import { createAccessFixture, accessIssuer, accessAudience } from './access-fixtures.mjs';
export const runtimeAccess = await createAccessFixture();

export const runtimeEnv = () => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NOTION_|CF_ACCESS_|ALLOWED_EMAILS$|ACCOUNT_OWNER_BY_EMAIL$)/.test(key))),
  CF_ACCESS_TEAM_DOMAIN: new URL(accessIssuer).hostname,
  CF_ACCESS_AUD: accessAudience,
  ALLOWED_EMAILS: 'allowed@example.test',
  ACCESS_TEST_JWKS: JSON.stringify(runtimeAccess.jwks)
});

export async function assertProtectedRuntime(request, apiStatus = 200) {
  const allowed = (path) => request(path, { 'Cf-Access-Jwt-Assertion': runtimeAccess.token() });
  for (const path of ['/', '/api/operations?from=invalid', '/api/expenses?month=invalid']) {
    assert.equal((await request(path)).status, 401, path);
    assert.equal((await request(path, { 'oai-authenticated-user-email': 'allowed@example.test', 'Cf-Access-Authenticated-User-Email': 'allowed@example.test' })).status, 401);
    assert.equal((await request(path, { 'Cf-Access-Jwt-Assertion': runtimeAccess.token('denied@example.test') })).status, 403);
  }
  const forged = runtimeAccess.token().split('.');
  forged[2] = (forged[2][0] === 'A' ? 'B' : 'A') + forged[2].slice(1);
  for (const token of [
    'malformed', forged.join('.'),
    runtimeAccess.token('allowed@example.test', { exp: Math.floor(Date.now() / 1000) - 120 }),
    runtimeAccess.token('allowed@example.test', { aud: 'wrong-application' }),
    runtimeAccess.token('allowed@example.test', { iss: 'https://evil.cloudflareaccess.com' })
  ]) assert.equal((await request('/api/operations', { 'Cf-Access-Jwt-Assertion': token })).status, 401);
  for (const [path, heading] of [
    ['/', 'Семейные финансы'],
    ['/operations', 'Операции'],
    ['/plan', 'План на'],
    ['/accounts', 'Счета и резервы'],
    ['/dashboards', 'Дашборды']
  ]) {
    const response = await allowed(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    assert.match(html, /ng-server-context="ssr"/);
    assert.ok(html.includes(heading), path);
    assert.doesNotMatch(html, /notion\.so|notion\.site|signin-with-chatgpt|signout-with-chatgpt|codex-preview|_vinext|_next/i);
  }
  for (const path of ['/api/operations', '/api/expenses?month=2026-08']) {
    const response = await allowed(path);
    assert.equal(response.status, apiStatus, path);
    const data = await response.json();
    if (apiStatus !== 200) {
      assert.equal(typeof data.error, 'string');
      continue;
    }
    if (path.startsWith('/api/operations')) {
      assert.deepEqual(data.operations, []);
      assert.deepEqual(data.accounts, []);
      assert.deepEqual(data.monthlyPlan.items, []);
      assert.deepEqual(data.receipts.items, []);
      assert.deepEqual(data.goals, { items: [], history: [] });
      assert.equal('viewer' in data, false);
    } else {
      assert.equal(data.month, '2026-08');
      assert.deepEqual(data.currencies, []);
    }
  }
  assert.equal((await request('/auth/login?return_to=%2Foperations')).headers.get('location'), '/operations');
  assert.equal((await request('/auth/logout')).headers.get('location'), '/cdn-cgi/access/logout');
  for (const path of ['/unknown', '/api/missing', '/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']) {
    const response = await allowed(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('location'), null);
  }
  for (const path of ['/api/expenses?month=2026-99', '/api/operations?from=&to=2026-08-31']) {
    assert.equal((await allowed(path)).status, 400, path);
  }
}
