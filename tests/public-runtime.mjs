import assert from 'node:assert/strict';

export const testAuthSecret = 'test-only-auth-secret-with-at-least-sixty-four-characters-for-fixtures';
export const runtimeEnv = () => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NOTION_|CF_ACCESS_|ALLOWED_EMAILS$|ACCOUNT_OWNER_BY_EMAIL$)/.test(key))),
  AUTH_SECRET: testAuthSecret
});

export async function assertApplicationRuntime(request, apiStatus = 200, cookie = '') {
  const allowed = (path) => request(path, { Cookie: cookie });
  for (const [path, heading] of [
    ['/', 'Семейные финансы'], ['/operations', 'Операции'], ['/plan', 'План на'],
    ['/accounts', 'Счета и резервы'], ['/dashboards', 'Дашборды'],
    ['/login', 'Вход'], ['/register', 'Регистрация']
  ]) {
    const publicPage = path === '/login' || path === '/register';
    const anonymous = await request(path);
    if (!publicPage) {
      assert.equal(anonymous.status, apiStatus === 503 ? 503 : 307, path);
      if (apiStatus === 503) continue;
      assert.match(anonymous.headers.get('location'), /^\/login\?return_to=/);
    }
    const response = publicPage ? anonymous : await allowed(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /ng-server-context="ssr"/);
    assert.ok(html.includes(heading), path);
    assert.doesNotMatch(html, /notion\.so|cloudflareaccess\.com|cdn-cgi\/access|signin-with-chatgpt|signout-with-chatgpt|codex-preview|_vinext|_next/i);
  }
  const invitationToken = 'd'.repeat(64);
  const invitationPage = await request(`/register#token=${invitationToken}`);
  assert.equal(invitationPage.status, 200);
  assert.ok(!(await invitationPage.text()).includes(invitationToken), 'SSR must not serialize invitation fragments');
  for (const path of ['/api/operations', '/api/expenses?month=2026-08']) {
    assert.equal((await request(path)).status, apiStatus === 503 ? 503 : 401);
    assert.equal((await request(path, { 'oai-authenticated-user-email': 'allowed@example.test', 'Cf-Access-Authenticated-User-Email': 'allowed@example.test', 'Cf-Access-Jwt-Assertion': 'forged' })).status, apiStatus === 503 ? 503 : 401);
    const response = await allowed(path);
    assert.equal(response.status, apiStatus, path);
    const data = await response.json();
    if (apiStatus !== 200) { assert.equal(typeof data.error, 'string'); continue; }
    if (path.startsWith('/api/operations')) {
      assert.deepEqual(data.operations, []); assert.deepEqual(data.accounts, []);
      assert.deepEqual(data.monthlyPlan.items, []); assert.deepEqual(data.receipts.items, []);
      assert.deepEqual(data.goals, { items: [], history: [] });
    } else { assert.equal(data.month, '2026-08'); assert.deepEqual(data.currencies, []); }
  }
  for (const path of ['/unknown', '/api/missing', '/auth/logout', '/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']) {
    assert.equal((await request(path)).status, 404, path);
  }
  assert.equal((await request('/auth/login')).headers.get('location'), '/login');
  if (apiStatus === 200) for (const path of ['/api/expenses?month=2026-99', '/api/operations?from=&to=2026-08-31']) {
    assert.equal((await allowed(path)).status, 400, path);
  }
}
