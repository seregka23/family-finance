import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';
import { localD1 } from './d1-fixture.mjs';
const { GET } = await loadTs('../src/server/api/operations.ts');

test('public operations endpoint returns empty typed collections without outbound requests', async () => {
  const fixture = localD1();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected outbound request'); };
  const request = (query = '') => new Request(`https://example.test/api/operations${query}`);
  try {
    const response = await GET(request('?from=2026-08-01&to=2026-08-31&month=2026-08-01'), fixture.db);
    assert.equal(response.status, 200);
    const data = await response.json();
    const { updatedAt, ...collections } = data;
    assert.deepEqual(collections, {
      operations: [], accounts: [], monthlyPlan: { month: '2026-08-01', items: [] },
      receipts: { items: [] }, goals: { items: [], history: [] }
    });
    assert.ok(Number.isFinite(Date.parse(updatedAt)));
    const defaults = await GET(request(), fixture.db);
    assert.equal(defaults.status, 200);
    assert.match((await defaults.json()).monthlyPlan.month, /^\d{4}-\d{2}-01$/);
    for (const query of [
      '?from=&to=2026-08-31', '?from=2026-08-01', '?to=2026-08-31',
      '?from=2026-08-31&to=2026-08-01', '?from=2026-02-30&to=2026-03-01',
      '?from=2024-01-01&to=2026-01-01', '?month=2026-13-01', '?month=2026-08-02'
    ]) assert.equal((await GET(request(query), fixture.db)).status, 400, query);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; fixture.close(); }
});
