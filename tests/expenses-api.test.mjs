import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';
const { GET } = await loadTs('../src/server/api/expenses.ts');

test('public expense endpoint returns an empty monthly summary without outbound requests', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected outbound request'); };
  try {
    for (const month of ['2026-08', '2024-02', '2026-12']) {
      const response = await GET(new Request(`https://example.test/api/expenses?month=${month}`));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.month, month);
      assert.deepEqual(result.currencies, []);
    }
    for (const query of ['', '?month=', '?month=2026-99', '?month=2026-08-01', '?month=invalid']) {
      assert.equal((await GET(new Request(`https://example.test/api/expenses${query}`))).status, 400, query);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
