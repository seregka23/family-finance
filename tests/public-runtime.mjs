import assert from 'node:assert/strict';

export const runtimeEnv = () => Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^(NOTION_|CF_ACCESS_|ALLOWED_EMAILS$|ACCOUNT_OWNER_BY_EMAIL$)/.test(key))
);

export async function assertPublicRuntime(request) {
  for (const [path, heading] of [
    ['/', 'Семейные финансы'],
    ['/operations', 'Операции'],
    ['/plan', 'План на'],
    ['/accounts', 'Счета и резервы'],
    ['/dashboards', 'Дашборды']
  ]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    assert.match(html, /ng-server-context="ssr"/);
    assert.ok(html.includes(heading), path);
    assert.doesNotMatch(html, /notion\.so|notion\.site|signin-with-chatgpt|signout-with-chatgpt|cdn-cgi\/access|codex-preview|_vinext|_next/i);
  }
  for (const path of ['/api/operations', '/api/expenses?month=2026-08']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const data = await response.json();
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
  for (const path of ['/unknown', '/api/missing', '/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('location'), null);
  }
  for (const path of ['/api/expenses?month=2026-99', '/api/operations?from=&to=2026-08-31']) {
    assert.equal((await request(path)).status, 400, path);
  }
}
