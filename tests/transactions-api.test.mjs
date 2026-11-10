import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { authOrigin, authorizedRequest, loadAuthenticated, sessionToken, sessionSeedSql } from './auth-test-context.mjs';
import { localD1 } from './d1-fixture.mjs';
import { seedSql } from './d1-seed.mjs';
const { POST, GET } = await loadAuthenticated('../src/server/api/operations.ts');
const { GET: expenses } = await loadAuthenticated('../src/server/api/expenses.ts');
const { GET: options } = await loadAuthenticated('../src/server/api/transaction-options.ts');
const body = (changes = {}) => ({ requestId: randomUUID(), operationType: 'Расход', amount: '12.34', currency: 'RSD', operationDate: '2026-08-20', title: 'Manual groceries', accountId: 'cash', categoryId: 'food', ...changes });
const post = (data, headers = {}) => new Request(`${authOrigin}/api/operations`, { method: 'POST', headers: { Origin: authOrigin, 'Content-Type': 'application/json', Cookie: `__Host-family_session=${sessionToken}`, ...headers }, body: typeof data === 'string' ? data : JSON.stringify(data) });
const journal = () => authorizedRequest(`${authOrigin}/api/operations?from=2026-08-01&to=2026-08-31&month=2026-08-01`);

test('manual expenses and income update balances once and reconcile across journal, monthly plan and dashboards', async () => {
  const fixture = localD1();
  try {
    fixture.sqlite.exec(seedSql());
    const expense = body({ amount: '12,34', title: ' Manual groceries ' });
    const created = await POST(post(expense), fixture.db);
    assert.equal(created.status, 201); const result = await created.json(); assert.equal(result.created, true);
    const repeated = await POST(post({ ...expense, amount: '12.34', title: 'Manual groceries' }), fixture.db);
    assert.equal(repeated.status, 200); assert.deepEqual(await repeated.json(), { id: result.id, created: false });
    assert.equal((await POST(post({ ...expense, amount: '12.35' }), fixture.db)).status, 409);
    const actorToken = 'b'.repeat(64), now = Math.floor(Date.now() / 1000);
    fixture.sqlite.prepare(`INSERT INTO auth_users(id,email,name,role,status,password_hash,password_salt,password_version,created_at) VALUES ('other','other@example.test','','member','enabled',?,?,'pbkdf2-sha256-hmac-v1',?)`).run('0'.repeat(64), '0'.repeat(64), now);
    fixture.sqlite.prepare('INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').run(createHash('sha256').update(actorToken).digest('hex'), 'other', now, now + 3600);
    assert.equal((await POST(post(expense, { Cookie: `__Host-family_session=${actorToken}` }), fixture.db)).status, 409);
    const income = await POST(post(body({ operationType: 'Доход', amount: '20.01', title: 'Manual income' })), fixture.db);
    assert.equal(income.status, 201);
    const data = await (await GET(journal(), fixture.db)).json();
    assert.equal(data.accounts.find((account) => account.id === 'cash').balance, 1007.67);
    assert.equal(data.accounts.find((account) => account.id === 'cash').available, 757.67);
    assert.equal(data.monthlyPlan.items[0].actual, 17.07);
    assert.equal(data.operations.find((operation) => operation.id === result.id).source, 'Вручную');
    assert.equal(data.operations.filter((operation) => operation.id === result.id).length, 1);
    const summary = await (await expenses(authorizedRequest(`${authOrigin}/api/expenses?month=2026-08`), fixture.db)).json();
    assert.equal(summary.currencies.find((item) => item.currency === 'RSD').total, 17.07);
    const distinct = [body({ amount: '0.10' }), body({ amount: '0.20' })];
    const responses = await Promise.all(distinct.map((payload) => POST(post(payload), fixture.db)));
    assert.deepEqual(responses.map((response) => response.status), [201, 201]);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, 100737);
    const retryPayload = body({ amount: '0.01' });
    const retries = await Promise.all([POST(post(retryPayload), fixture.db), POST(post(retryPayload), fixture.db)]);
    assert.deepEqual(retries.map((response) => response.status).sort(), [200, 201]);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, 100736);
  } finally { fixture.close(); }
});

test('empty workspace accepts unlinked operations and unknown account balances stay unknown', async () => {
  const fixture = localD1();
  try {
    assert.equal((await POST(post(body({ accountId: null, categoryId: null })), fixture.db)).status, 201);
    fixture.sqlite.exec(seedSql());
    assert.equal((await POST(post(body({ currency: 'USD', accountId: 'unknown' })), fixture.db)).status, 201);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='unknown'").get().balance_minor, null);
    const response = await options(authorizedRequest(`${authOrigin}/api/transaction-options`), fixture.db);
    assert.equal(response.status, 200); const data = await response.json();
    assert.ok(data.accounts.some((account) => account.id === 'cash' && account.currency === 'RSD'));
    assert.ok(data.categories.some((category) => category.id === 'food'));
  } finally { fixture.close(); }
});

test('invalid amounts, dates, references and protected fields cannot insert transactions or alter balances', async () => {
  const fixture = localD1();
  try {
    fixture.sqlite.exec(seedSql());
    fixture.sqlite.exec("UPDATE accounts SET active=0 WHERE id='euros'");
    const before = fixture.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n;
    for (const changes of [
      { amount: 12.34 }, { amount: '0' }, { amount: '-1' }, { amount: '1e2' }, { amount: '1.001' }, { amount: '900719925474.10' },
      { operationDate: '2026-02-30' }, { operationTime: '24:01' }, { title: ' ' }, { title: 'x'.repeat(201) },
      { requestId: "' OR 1=1 --" }, { currency: 'GBP' }, { currency: ['RSD'] }, { operationType: ['Расход'] }, { accountId: 'missing' }, { categoryId: "' OR 1=1 --" },
      { accountId: 'euros', currency: 'EUR' }, { accountId: 'cash', currency: 'EUR' },
      { reserveId: 'holiday' }, { items: [] }, { createdBy: 'someone-else' }, { source: 'Чек' }, { status: 'Готово' }
    ]) assert.equal((await POST(post(body(changes)), fixture.db)).status, 400, JSON.stringify(changes));
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n, before);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, 100000);
    fixture.sqlite.prepare("UPDATE accounts SET balance_minor=? WHERE id='cash'").run(Math.floor(Number.MAX_SAFE_INTEGER / 100));
    assert.equal((await POST(post(body({ operationType: 'Доход', amount: '0.01' })), fixture.db)).status, 409);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n, before);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, Math.floor(Number.MAX_SAFE_INTEGER / 100));
  } finally { fixture.close(); }
});

test('authorization, CSRF and body guards run before manual transaction writes', async () => {
  const fixture = localD1();
  try {
    for (const [headers, status] of [[{ Cookie: '' }, 401], [{ Origin: '' }, 403], [{ Origin: 'https://evil.example' }, 403], [{ 'Content-Type': 'text/plain' }, 415]]) {
      assert.equal((await POST(post(body({ amount: 'invalid' }), headers), fixture.db)).status, status);
    }
    assert.equal((await POST(post('[]'), fixture.db)).status, 400);
    assert.equal((await POST(post('x'.repeat(9000)), fixture.db)).status, 413);
    assert.equal((await POST(post(body()))).status, 503);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n, 0);
    assert.equal((await options(new Request(`${authOrigin}/api/transaction-options`), fixture.db)).status, 401);
    fixture.sqlite.exec("UPDATE auth_users SET status='disabled'");
    assert.equal((await POST(post(body({ amount: 'invalid' })), fixture.db)).status, 403);
  } finally { fixture.close(); }
});

test('an existing installation without the manual transaction migration returns503 without partial writes', async () => {
  const fixture = localD1(':memory:', false, false);
  try {
    for (const file of ['0001_finance.sql', '0002_auth.sql', '0003_auth_password_scheme.sql']) fixture.sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    fixture.sqlite.exec(sessionSeedSql());
    fixture.sqlite.exec(seedSql());
    assert.equal((await POST(post(body()), fixture.db)).status, 503);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n, 178);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, 100000);
  } finally { fixture.close(); }
});

test('monthly currency totals reject concurrent overflow atomically without netting income or other currencies', async () => {
  const fixture = localD1();
  const maximum = Math.floor(Number.MAX_SAFE_INTEGER / 100);
  try {
    fixture.sqlite.exec("INSERT INTO accounts(id,name,currency,balance_minor) VALUES ('cash','Cash','RSD',10000)");
    fixture.sqlite.prepare(`INSERT INTO operations(id,operation_type,amount_minor,currency,operation_date,status)
      VALUES ('near-limit','Расход',?,'RSD','2026-08-01','Готово')`).run(maximum - 1);
    const first = body({ accountId: 'cash', categoryId: null, amount: '0.01' });
    const second = body({ accountId: 'cash', categoryId: null, amount: '0.01' });
    const responses = await Promise.all([POST(post(first), fixture.db), POST(post(second), fixture.db)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    assert.equal(fixture.sqlite.prepare("SELECT SUM(amount_minor) AS amount FROM operations WHERE operation_type='Расход' AND currency='RSD'").get().amount, maximum);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n, 2);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, 9999);
    assert.equal((await POST(post(body({ accountId: null, categoryId: null, operationType: 'Доход', amount: '1.00' })), fixture.db)).status, 201);
    assert.equal((await POST(post(body({ accountId: null, categoryId: null, currency: 'EUR', amount: '1.00' })), fixture.db)).status, 201);
    assert.equal((await POST(post(body({ accountId: null, categoryId: null, operationDate: '2026-09-01', amount: '1.00' })), fixture.db)).status, 201);
  } finally { fixture.close(); }
});

test('manual expense rolls back when derived availability overflows; unknown reserve availability remains unknown', async () => {
  const fixture = localD1();
  const maximum = Math.floor(Number.MAX_SAFE_INTEGER / 100);
  try {
    fixture.sqlite.prepare("INSERT INTO accounts(id,name,currency,balance_minor) VALUES ('cash','Cash','RSD',?)").run(-maximum + 1);
    fixture.sqlite.exec("INSERT INTO reserves(id,title,account_id,currency,saved_minor,archived) VALUES ('archived','Archived','cash','RSD',1,1)");
    const payload = body({ amount: '0.01', categoryId: null });
    assert.equal((await POST(post(payload), fixture.db)).status, 409);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM operations').get().n, 0);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, -maximum + 1);
    fixture.sqlite.exec("INSERT INTO reserves(id,title,account_id,currency,saved_minor) VALUES ('unknown','Unknown','cash','RSD',NULL)");
    assert.equal((await POST(post(payload), fixture.db)).status, 201);
    assert.equal(fixture.sqlite.prepare("SELECT balance_minor FROM accounts WHERE id='cash'").get().balance_minor, -maximum);
    const data = await (await GET(journal(), fixture.db)).json();
    assert.equal(data.accounts[0].available, null);
  } finally { fixture.close(); }
});
