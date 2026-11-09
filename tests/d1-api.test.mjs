import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAuthenticated as loadTs, authorizedRequest } from './auth-test-context.mjs';
import { localD1 } from './d1-fixture.mjs';
import { seedSql, assertPopulatedOperations } from './d1-seed.mjs';
const { GET: operations } = await loadTs('../src/server/api/operations.ts');
const { GET: expenses } = await loadTs('../src/server/api/expenses.ts');
const request = (path) => authorizedRequest(`https://example.test/api/${path}`);

test('real migrated SQLite data persists and drives journal, balances, plans, receipts and expenses', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-d1-unit-'));
  const path = join(directory, 'finance.sqlite');
  let fixture = localD1(path);
  try {
    fixture.sqlite.exec(seedSql());
    fixture.close();
    fixture = localD1(path, false);
    const response = await operations(request('operations?from=2026-08-05&to=2026-08-05&month=2026-08-01'), fixture.db);
    assert.equal(response.status, 200);
    await assertPopulatedOperations(assert, await response.json());
    const month = await (await operations(request('operations?from=2026-08-01&to=2026-08-31&month=2026-08-01'), fixture.db)).json();
    assert.equal(month.operations.length, 176);
    assert.equal(month.operations.find((operation) => operation.id === 'receipt').items, 2);
    const receipt = month.receipts.items.find((item) => item.operationId === 'receipt');
    assert.equal(receipt.total, 3);
    assert.equal(receipt.itemCount, 2);
    assert.equal(receipt.categories[0].percent, 100);
    const dashboard = await (await expenses(request('expenses?month=2026-08'), fixture.db)).json();
    assert.equal(dashboard.currencies.find((item) => item.currency === 'RSD').total, 4.73);
    assert.equal(dashboard.currencies.find((item) => item.currency === 'EUR').total, 9.99);
    const next = await (await expenses(request('expenses?month=2026-09'), fixture.db)).json();
    assert.equal(next.currencies[0].total, 9);
    assert.ok(fixture.statements.some(({ values }) => values.includes('2026-08-05')));
    assert.ok(fixture.statements.every(({ sql }) => !sql.includes('2026-08-05') && !sql.includes('DROP TABLE')));
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM accounts').get().count, 3);
  } finally { fixture.close(); await rm(directory, { recursive: true, force: true }); }
});

test('missing binding/schema fail503 while invalid and injected inputs fail400 before queries', async () => {
  const uninitialized = localD1(':memory:', false);
  const fixture = localD1();
  try {
    for (const [handler, path] of [[operations, 'operations'], [expenses, 'expenses?month=2026-08']]) {
      for (const db of [undefined, uninitialized.db]) {
        const response = await handler(request(path), db);
        assert.equal(response.status, 503);
        assert.equal(typeof (await response.json()).error, 'string');
      }
    }
    for (const [handler, path] of [
      [operations, "operations?from=2026-08-01%27%20OR%201=1--&to=2026-08-31"],
      [operations, 'operations?month=2026-08-01%27%3BDELETE%20FROM%20accounts--'],
      [expenses, 'expenses?month=2026-08%27%20OR%201=1--']
    ]) {
      assert.equal((await handler(request(path), fixture.db)).status, 400);
    }
    assert.equal(fixture.statements.length, 0);
  } finally { fixture.close(); uninitialized.close(); }
});

test('actual migration rejects invalid calendar dates, foreign keys, currencies and fractional minor units', () => {
  const fixture = localD1();
  try {
    fixture.sqlite.exec("INSERT INTO accounts(id,name,currency,balance_minor) VALUES ('cash','Cash','RSD',10000)");
    fixture.sqlite.exec("INSERT INTO categories(id,name) VALUES ('food','Food')");
    for (const sql of [
      "INSERT INTO accounts(id,name,currency,balance_minor) VALUES ('bad','Bad','GBP',1)",
      "INSERT INTO accounts(id,name,currency,balance_minor) VALUES ('bad','Bad','RSD',1.5)",
      "INSERT INTO reserves(id,title,account_id,currency) VALUES ('bad','Bad','missing','RSD')",
      "INSERT INTO monthly_plan_items(id,month,category_id,title,currency,amount_minor) VALUES ('bad','2026-13-01','food','Bad','RSD',1)",
      "INSERT INTO operations(id,operation_type,amount_minor,currency,operation_date) VALUES ('bad','Расход',1,'RSD','2026-02-30')",
      "INSERT INTO operations(id,operation_type,amount_minor,currency,operation_date) VALUES ('bad','Расход',1,'RSD','2026-13-01')"
    ]) assert.throws(() => fixture.sqlite.exec(sql), sql);
  } finally { fixture.close(); }
});

test('separate request bindings never share data and unsuccessful D1 results fail closed', async () => {
  const populated = localD1();
  const empty = localD1();
  try {
    populated.sqlite.exec(seedSql());
    for (const db of [populated.db, empty.db, populated.db]) {
      const result = await (await operations(request('operations?month=2026-08-01'), db)).json();
      assert.equal(result.operations.length, db === empty.db ? 0 : 178);
    }
    const failed = {
      prepare() { return { bind() { return this; }, async all() { return { success: false, results: [] }; } }; },
      async batch() { return [{ success: false, results: [] }]; }
    };
    assert.equal((await operations(request('operations'), failed)).status, 503);
    assert.equal((await expenses(request('expenses?month=2026-08'), failed)).status, 503);
  } finally { populated.close(); empty.close(); }
});

test('currency relations remain consistent on both child writes and parent edits', () => {
  const fixture = localD1();
  try {
    fixture.sqlite.exec(seedSql());
    for (const sql of [
      "INSERT INTO receipt_items(id,operation_id,currency,amount_minor) VALUES ('bad','receipt','EUR',100)",
      "UPDATE receipt_items SET currency='EUR' WHERE id='line-a'",
      "UPDATE operations SET currency='EUR' WHERE id='receipt'",
      "UPDATE accounts SET currency='EUR' WHERE id='cash'",
      "INSERT INTO reserves(id,title,account_id,currency) VALUES ('bad','Bad','cash','EUR')"
    ]) assert.throws(() => fixture.sqlite.exec(sql), sql);
  } finally { fixture.close(); }
});

test('individually valid money rows cannot produce an inexact aggregate', async () => {
  const fixture = localD1();
  try {
    fixture.sqlite.exec(seedSql());
    for (const id of ['large-a', 'large-b']) {
      fixture.sqlite.prepare(`INSERT INTO operations(id,operation_type,amount_minor,currency,operation_date,category_id,status)
        VALUES (?,'Расход',?,'RSD','2026-08-10','food','Готово')`).run(id, Number.MAX_SAFE_INTEGER);
    }
    assert.equal((await expenses(request('expenses?month=2026-08'), fixture.db)).status, 503);
    assert.equal((await operations(request('operations?month=2026-08-01'), fixture.db)).status, 503);
  } finally { fixture.close(); }
});

test('reporting money preserves cents at the accepted boundary and rejects lossy conversions', async () => {
  const fixture = localD1();
  const maximum = Math.floor(Number.MAX_SAFE_INTEGER / 100);
  try {
    fixture.sqlite.exec(`INSERT INTO categories(id,name) VALUES ('precision','Precision');
      INSERT INTO monthly_plan_items(id,month,category_id,title,currency,amount_minor)
      VALUES ('precision-plan','2026-08-01','precision','Precision','RSD',1);
      INSERT INTO operations(id,operation_type,amount_minor,currency,operation_date,category_id,status)
      VALUES ('precision-row','Расход',1,'RSD','2026-08-10','precision','Готово');`);
    for (const minor of [maximum - 1, maximum]) {
      fixture.sqlite.prepare('UPDATE operations SET amount_minor=? WHERE id=?').run(minor, 'precision-row');
      const expenseResponse = await expenses(request('expenses?month=2026-08'), fixture.db);
      const operationResponse = await operations(request('operations?month=2026-08-01'), fixture.db);
      assert.equal(expenseResponse.status, 200, String(minor));
      assert.equal(operationResponse.status, 200, String(minor));
      const expenseData = await expenseResponse.json();
      const operationData = await operationResponse.json();
      for (const major of [expenseData.currencies[0].total, operationData.operations[0].amount, operationData.monthlyPlan.items[0].actual]) {
        assert.equal(Math.round(major * 100), minor);
      }
    }
    for (const minor of [maximum + 1, 9007199254740001]) {
      fixture.sqlite.prepare('UPDATE operations SET amount_minor=? WHERE id=?').run(minor, 'precision-row');
      assert.equal((await expenses(request('expenses?month=2026-08'), fixture.db)).status, 503, String(minor));
      assert.equal((await operations(request('operations?month=2026-08-01'), fixture.db)).status, 503, String(minor));
    }
    fixture.sqlite.prepare('UPDATE operations SET amount_minor=? WHERE id=?').run(maximum, 'precision-row');
    fixture.sqlite.exec(`INSERT INTO operations(id,operation_type,amount_minor,currency,operation_date,category_id,status)
      VALUES ('extra-cent','Расход',1,'RSD','2026-08-10','precision','Готово');`);
    assert.equal((await expenses(request('expenses?month=2026-08'), fixture.db)).status, 503);
    assert.equal((await operations(request('operations?month=2026-08-01'), fixture.db)).status, 503);
  } finally { fixture.close(); }
});

test('account balances and derived availability enforce the same cent precision limit', async () => {
  const fixture = localD1();
  const maximum = Math.floor(Number.MAX_SAFE_INTEGER / 100);
  try {
    fixture.sqlite.prepare('INSERT INTO accounts(id,name,currency,balance_minor) VALUES (?,?,?,?)')
      .run('debt', 'Debt account', 'RSD', -maximum);
    const response = await operations(request('operations?month=2026-08-01'), fixture.db);
    assert.equal(response.status, 200);
    const account = (await response.json()).accounts[0];
    assert.equal(Math.round(account.balance * 100), -maximum);
    assert.equal(Math.round(account.available * 100), -maximum);
    fixture.sqlite.exec("INSERT INTO reserves(id,title,account_id,currency,saved_minor) VALUES ('cent','Cent','debt','RSD',1)");
    assert.equal((await operations(request('operations?month=2026-08-01'), fixture.db)).status, 503);
  } finally { fixture.close(); }
});
