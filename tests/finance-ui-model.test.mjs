import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const js = ts.transpileModule(
  readFileSync(new URL('../src/app/models/finance-ui-model.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText;
const {
  operationDay,
  operationDate,
  currentMonthStart,
  periodBounds,
  validPeriod,
  validDate,
  accountActivity,
  countLabel
} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('Belgrade dates are stable across UTC midnight, year and DST boundaries', () => {
  assert.equal(operationDay('2026-12-31T23:30:00Z'), '2027-01-01');
  assert.equal(currentMonthStart(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.deepEqual(periodBounds('week', new Date('2026-10-25T23:30:00Z')), {
    from: '2026-10-26',
    to: '2026-11-01'
  });
  assert.deepEqual(periodBounds('month', new Date('2028-02-14')), {
    from: '2028-02-01',
    to: '2028-02-29'
  });
  assert.match(operationDate('2025-08-03'), /2025/);
  assert.equal(operationDay('invalid'), '');
});
test('invalid, cleared, reversed and unbounded date filters cannot query', () => {
  assert.equal(validDate('2026-02-30'), false);
  for (const range of [
    { from: '', to: '2026-01-01' },
    { from: '2026-02-02', to: '2026-02-01' },
    { from: '2024-01-01', to: '2026-01-01' }
  ])
    assert.equal(validPeriod(range), false);
  assert.equal(validPeriod({ from: '2028-01-01', to: '2028-12-31' }), true);
});
test('account activity isolates income, expenses, accounts and currencies', () => {
  const rows = [
    { account: 'A', currency: 'RSD', amount: 500, operationType: 'Доход' },
    { account: 'A', currency: 'RSD', amount: 30, operationType: 'Расход' },
    { account: 'A', currency: 'EUR', amount: 20, operationType: 'Расход' },
    { account: 'B', currency: 'RSD', amount: 90, operationType: 'Расход' }
  ];
  assert.deepEqual(accountActivity(rows, 'A', 'RSD'), { income: 500, expense: 30 });
  assert.equal(countLabel(2, ['операция', 'операции', 'операций']), '2 операции');
  assert.equal(countLabel(21, ['операция', 'операции', 'операций']), '21 операция');
});
