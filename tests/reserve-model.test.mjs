import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';
const { reservedForAccount } = await loadTs('../src/app/models/reserve-model.ts');

test('account reserves include archived allocations and isolate account balances', () => {
  const goals = [
    { accountId: 'cash', currency: 'RSD', saved: 15000 },
    { accountId: 'cash', currency: 'RSD', saved: 1000, archived: true },
    { accountId: 'euros', currency: 'EUR', saved: 200 }
  ];
  assert.equal(reservedForAccount(goals, 'cash', 'RSD'), 16000);
  assert.equal(reservedForAccount(goals, 'euros', 'EUR'), 200);
  assert.equal(reservedForAccount(goals, 'missing', 'RSD'), 0);
});

test('unknown reserves and mismatched currencies cannot fabricate available cash', () => {
  for (const reserve of [
    { accountId: 'cash', currency: 'RSD', saved: null },
    { accountId: 'cash', currency: 'EUR', saved: 200 }
  ]) {
    assert.equal(reservedForAccount([reserve], 'cash', 'RSD'), null);
  }
});
