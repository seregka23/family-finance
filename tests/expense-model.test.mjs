import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/models/expense-model.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { aggregateExpenses, monthBounds, belgradeDay, merchantName } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);
const row = (id, amount, currency = 'RSD', date = '2026-08-05', category = 'Продукты') => ({
  id,
  amount,
  currency,
  date,
  category,
  review: false
});

test('full months, leap days and invalid month input', () => {
  assert.equal(monthBounds('2024-02').to, '2024-02-29');
  assert.equal(monthBounds('2026-12').next, '2027-01-01');
  assert.throws(() => monthBounds('2026-13'));
  assert.equal(belgradeDay('2026-08-31T22:30:00Z'), '2026-09-01');
});

test('verified merchant aliases, missing names, currency isolation and exact cumulative totals', () => {
  assert.equal(merchantName(' UNIVEREXPORT   MP142 Beograd RS '), 'Univerexport');
  assert.equal(merchantName('213 - MAXI 630 BEOGRAD RS'), 'Maxi');
  assert.equal(merchantName('Maxi 177'), 'Maxi');
  assert.equal(merchantName('Wolt doo 972546560588 RS'), 'Wolt');
  assert.equal(merchantName('Maxim Restaurant'), 'Maxim Restaurant');
  assert.equal(merchantName('Shop 123'), 'Shop 123');
  const rows = [
    { ...row('a', 0.1), merchant: 'Univerexport MP142', title: 'First purchase' },
    { ...row('b', 0.2, 'RSD', '2026-08-06'), merchant: 'UNIVEREXPORT MP142 Beograd RS' },
    { ...row('c', 1, 'EUR'), merchant: 'Univerexport MP142' },
    row('d', 0.7)
  ];
  rows.push(rows[0]);
  const {
    currencies: [rsd, eur]
  } = aggregateExpenses(rows, '2026-08', new Date('2026-09-05'));
  assert.equal(rsd.total, 1);
  assert.deepEqual(rsd.merchants, [
    { name: 'Не указан', amount: 0.7, count: 1 },
    { name: 'Univerexport', amount: 0.3, count: 2 }
  ]);
  assert.equal(eur.merchants[0].amount, 1);
  assert.equal(rsd.days[4].cumulative, 0.8);
  assert.equal(rsd.days[5].cumulative, 1);
  assert.equal(rsd.days.at(-1).cumulative, rsd.total);
  assert.equal(rsd.largest.find((x) => x.id === 'a').merchant, 'Univerexport MP142');
  assert.equal(rsd.largest.find((x) => x.id === 'a').title, 'First purchase');
});

test('largest expenses are bounded, sorted and do not truncate merchant totals', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ...row(String(i), i + 1),
    merchant: 'Shop'
  }));
  const bucket = aggregateExpenses(rows, '2026-08', new Date('2026-09-05')).currencies[0];
  assert.equal(bucket.largest.length, 10);
  assert.deepEqual(
    bucket.largest.map((x) => x.amount),
    [20, 19, 18, 17, 16, 15, 14, 13, 12, 11]
  );
  assert.equal(bucket.merchants[0].amount, 210);
  assert.equal(bucket.merchants[0].count, 20);
  assert.equal(bucket.days.at(-1).cumulative, 210);
});

test('more than 100 rows reconcile across currencies, categories and days', () => {
  const rows = Array.from({ length: 173 }, (_, i) => row(String(i), 0.1));
  rows.push(row('eur', 0.99, 'EUR'), row('rub', 4799, 'RUB'), rows[0]);
  const data = aggregateExpenses(rows, '2026-08', new Date('2026-09-05T10:00:00Z'));
  assert.deepEqual(
    data.currencies.map((x) => x.currency),
    ['RSD', 'EUR', 'RUB']
  );
  assert.equal(data.currencies[0].count, 173);
  assert.equal(data.currencies[0].total, 17.3);
  for (const bucket of data.currencies) {
    assert.equal(bucket.days.length, 31);
    assert.equal(
      bucket.categories.reduce((n, x) => n + x.amount, 0),
      bucket.total
    );
    assert.equal(
      bucket.days.reduce((n, x) => n + x.amount, 0),
      bucket.total
    );
  }
});

test('empty months, invalid amounts, future dates and Belgrade boundaries', () => {
  const data = aggregateExpenses(
    [
      row('a', 10, 'RSD', '2026-08-31T22:30:00Z'),
      row('b', null, 'RSD', '2026-09-02'),
      row('c', 20, 'RSD', '2026-09-06'),
      row('d', 15, '', '2026-09-03', '')
    ],
    '2026-09',
    new Date('2026-09-05T10:00:00Z')
  );
  assert.equal(data.currencies[0].total, 10);
  assert.equal(data.currencies[0].days.length, 5);
  assert.equal(data.currencies[1].currency, 'Без валюты');
  assert.equal(data.currencies[1].categories[0].name, 'Без категории');
  assert.equal(data.excluded, 1);
  assert.equal(aggregateExpenses([], '2026-08').currencies.length, 0);
});
