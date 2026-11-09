import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { installProductionCryptoLimit } from './production-crypto-limit.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createHmac, scrypt, pbkdf2, randomBytes } from 'node:crypto';
import { authOrigin, authSecret, loadAuthenticated } from './auth-test-context.mjs';
import { localD1 } from './d1-fixture.mjs';
const { handleAuthRequest } = await loadAuthenticated('../src/server/api/auth.ts');
const { GET: operations } = await loadAuthenticated('../src/server/api/operations.ts');
const { GET: expenses } = await loadAuthenticated('../src/server/api/expenses.ts');
const password = 'Correct horse battery staple!';
const digest = (token) => createHash('sha256').update(token).digest('hex');
const cookieOf = (response) => response.headers.get('set-cookie').split(';')[0];
const post = (path, body, headers = {}) => new Request(`${authOrigin}/api/auth/${path}`, { method: 'POST', headers: { Origin: authOrigin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const session = (cookie) => new Request(`${authOrigin}/api/auth/session`, { headers: { Cookie: cookie } });
function invite(fixture, email = 'person@example.test', expired = false) {
  const token = randomBytes(32).toString('hex'); const now = Math.floor(Date.now() / 1000);
  fixture.sqlite.prepare('INSERT INTO auth_invites(token_hash,email,role,created_at,expires_at) VALUES (?,?,?,?,?)').run(digest(token), email, 'member', now - 1000, expired ? now - 1 : now + 1000);
  return token;
}
const register = (token, extra = {}) => post('register', { email: 'person@example.test', password, name: 'Person', token, ...extra });

test('real registration consumes an email-bound invitation and stores only password/session hashes', async () => {
  const fixture = localD1(':memory:', true, false);
  try {
    const token = invite(fixture);
    const response = await handleAuthRequest(register(token), fixture.db);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(body.user.email, 'person@example.test');
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /^__Host-family_session=[a-f0-9]{64};/);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) assert.ok(cookie.includes(attribute));
    assert.doesNotMatch(cookie, /Domain=/i);
    const user = fixture.sqlite.prepare('SELECT * FROM auth_users').get();
    assert.equal(user.password_scheme, 'scrypt-hmac-v2');
    assert.notEqual(user.password_hash, password); assert.equal(user.password_hash.length, 64);
    assert.ok(user.password_salt.length >= 32);
    const stored = fixture.sqlite.prepare('SELECT * FROM auth_sessions').get();
    const raw = cookieOf(response).split('=')[1];
    assert.notEqual(stored.token_hash, raw); assert.equal(stored.token_hash, digest(raw));
    const invitation = fixture.sqlite.prepare('SELECT * FROM auth_invites').get();
    assert.notEqual(invitation.token_hash, token); assert.ok(invitation.consumed_at); assert.equal(invitation.user_id, user.id);
    assert.equal((await handleAuthRequest(session(cookieOf(response)), fixture.db)).status, 200);
    assert.equal((await handleAuthRequest(register(token), fixture.db)).status, 400);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM auth_users').get().n, 1);
  } finally { fixture.close(); }
});

test('expired, mismatched and weak-password invitations fail without consuming them; concurrent consumption is atomic', async () => {
  const fixture = localD1(':memory:', true, false);
  try {
    const token = invite(fixture);
    assert.equal((await handleAuthRequest(register(token, { email: 'other@example.test' }), fixture.db)).status, 400);
    assert.equal((await handleAuthRequest(register(token, { password: 'too-short' }), fixture.db)).status, 400);
    assert.equal((await handleAuthRequest(register(invite(fixture, 'person@example.test', true)), fixture.db)).status, 400);
    assert.equal(fixture.sqlite.prepare('SELECT consumed_at FROM auth_invites WHERE token_hash=?').get(digest(token)).consumed_at, null);
    const responses = await Promise.all([handleAuthRequest(register(token), fixture.db), handleAuthRequest(register(token), fixture.db)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    const duplicate = await handleAuthRequest(register(invite(fixture)), fixture.db);
    const invalid = await handleAuthRequest(register('0'.repeat(64)), fixture.db);
    assert.equal(duplicate.status, 400); assert.deepEqual(await duplicate.json(), await invalid.json());
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM auth_users').get().n, 1);
  } finally { fixture.close(); }
});

test('login rotates a supplied token, generic failures do not enumerate accounts, logout and expiry revoke access', async () => {
  const fixture = localD1(':memory:', true, false);
  try {
    await handleAuthRequest(register(invite(fixture)), fixture.db);
    const failed = await handleAuthRequest(post('login', { email: 'person@example.test', password: `${password}wrong` }), fixture.db);
    const unknown = await handleAuthRequest(post('login', { email: 'unknown@example.test', password }), fixture.db);
    assert.equal(failed.status, 401); assert.equal(unknown.status, 401); assert.deepEqual(await failed.json(), await unknown.json());
    const fixed = 'b'.repeat(64);
    const login = await handleAuthRequest(post('login', { email: 'person@example.test', password }, { Cookie: `__Host-family_session=${fixed}` }), fixture.db);
    assert.equal(login.status, 200);
    const previousCookie = cookieOf(login);
    const rotated = await handleAuthRequest(post('login', { email: 'person@example.test', password }, { Cookie: previousCookie }), fixture.db);
    assert.equal(rotated.status, 200);
    const cookie = cookieOf(rotated);
    assert.notEqual(cookie, previousCookie);
    assert.equal((await handleAuthRequest(session(previousCookie), fixture.db)).status, 401);
    assert.notEqual(cookie, `__Host-family_session=${fixed}`);
    assert.equal((await handleAuthRequest(session(`__Host-family_session=${fixed}`), fixture.db)).status, 401);
    fixture.sqlite.exec("UPDATE auth_users SET status='disabled'");
    assert.equal((await handleAuthRequest(session(cookie), fixture.db)).status, 403);
    assert.equal((await operations(new Request(`${authOrigin}/api/operations?from=invalid`, { headers: { Cookie: cookie } }), fixture.db)).status, 403);
    fixture.sqlite.exec("UPDATE auth_users SET status='enabled',role='admin'");
    assert.equal((await (await handleAuthRequest(session(cookie), fixture.db)).json()).user.role, 'admin');
    const logout = await handleAuthRequest(post('logout', {}, { Cookie: cookie }), fixture.db);
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await handleAuthRequest(session(cookie), fixture.db)).status, 401);
    const next = await handleAuthRequest(post('login', { email: 'person@example.test', password }), fixture.db);
    const now = Math.floor(Date.now() / 1000);
    fixture.sqlite.prepare('UPDATE auth_sessions SET created_at=?,expires_at=?').run(now - 1000, now - 1);
    assert.equal((await handleAuthRequest(session(cookieOf(next)), fixture.db)).status, 401);
  } finally { fixture.close(); }
});

test('CSRF, invalid bodies and absent configuration fail before auth writes', async () => {
  const fixture = localD1(':memory:', true, false);
  try {
    for (const path of ['login', 'register', 'logout']) {
      for (const origin of ['', 'https://attacker.example']) assert.equal((await handleAuthRequest(post(path, {}, { Origin: origin }), fixture.db)).status, 403);
      assert.equal((await handleAuthRequest(post(path, {}, { 'Content-Type': 'text/plain' }), fixture.db)).status, 415);
    }
    assert.equal(fixture.statements.length, 0);
    assert.equal((await handleAuthRequest(post('login', []), fixture.db)).status, 400);
    assert.equal((await handleAuthRequest(post('login', { password: 'x'.repeat(5000) }), fixture.db)).status, 413);
    assert.equal((await handleAuthRequest(post('login', {}))).status, 503);
    process.env.AUTH_SECRET = 'short';
    assert.equal((await handleAuthRequest(post('login', {}), fixture.db)).status, 503);
  } finally { process.env.AUTH_SECRET = authSecret; fixture.close(); }
});

test('missing/forged identity is denied before finance validation or queries; brute-force limits are enforced', async () => {
  const fixture = localD1(':memory:', true, false);
  try {
    for (const [handler, path] of [[operations, 'operations?from=invalid'], [expenses, 'expenses?month=invalid']]) {
      for (const headers of [{}, { 'Cf-Access-Jwt-Assertion': 'forged', 'Cf-Access-Authenticated-User-Email': 'person@example.test', 'oai-authenticated-user-email': 'person@example.test' }, { Cookie: `__Host-family_session=${'c'.repeat(64)}` }]) {
        const response = await handler(new Request(`${authOrigin}/api/${path}`, { headers }), fixture.db);
        assert.equal(response.status, 401);
      }
    }
    assert.ok(fixture.statements.every(({ sql }) => sql.includes('auth_sessions')));
    let response;
    for (let index = 0; index < 11; index++) response = await handleAuthRequest(post('login', { email: 'unknown@example.test', password }), fixture.db);
    assert.equal(response.status, 429);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS n FROM auth_users').get().n, 0);
  } finally { fixture.close(); }
});

test('registration and login succeed with the production PBKDF2 iteration limit enforced', async () => {
  const fixture = localD1(':memory:', true, false);
  const limit = installProductionCryptoLimit();
  try {
    const key = await crypto.subtle.importKey('raw', new Uint8Array(32), 'PBKDF2', false, ['deriveBits']);
    await assert.rejects(crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 600000 }, key, 256), /production limit/);
    assert.equal(limit.rejected, 1, 'test must actually enforce the production ceiling');
    const registration = await handleAuthRequest(register(invite(fixture)), fixture.db);
    assert.equal(registration.status, 200, await registration.clone().text());
    const login = await handleAuthRequest(post('login', { email: 'person@example.test', password }), fixture.db);
    assert.equal(login.status, 200, await login.clone().text());
    assert.equal((await handleAuthRequest(session(cookieOf(login)), fixture.db)).status, 200);
    const wrong = await handleAuthRequest(post('login', { email: 'person@example.test', password: `${password}wrong` }), fixture.db);
    const absent = await handleAuthRequest(post('login', { email: 'unknown@example.test', password }), fixture.db);
    assert.equal(wrong.status, 401); assert.equal(absent.status, 401);
    assert.deepEqual(await wrong.json(), await absent.json());
    assert.equal(limit.rejected, 1, 'password hashing must not exceed the runtime ceiling');
  } finally { limit.restore(); fixture.close(); }
});

test('new password hashes match an independent strong scrypt calculation with the existing pepper', async () => {
  const { passwordHash, PASSWORD_SCHEME } = await loadAuthenticated('../src/server/auth.ts');
  const salt = '0123456789abcdef'.repeat(4);
  const peppered = createHmac('sha256', authSecret).update(`password:${password}`).digest();
  const expected = (await promisify(scrypt)(peppered, Buffer.from(salt, 'utf8'), 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 })).toString('hex');
  assert.equal(PASSWORD_SCHEME, 'scrypt-hmac-v2');
  assert.equal(await passwordHash(password, salt, authSecret), expected);
  assert.notEqual(await passwordHash(`${password}different`, salt, authSecret), expected);
});

test('additive password migration preserves legacy credentials, invitations and active sessions without downgrading them', async () => {
  const fixture = localD1(':memory:', false, false);
  const now = Math.floor(Date.now() / 1000);
  const salt = '1234567890abcdef'.repeat(4);
  const peppered = createHmac('sha256', authSecret).update(`password:${password}`).digest();
  const legacyHash = (await promisify(pbkdf2)(peppered, salt, 600000, 32, 'sha256')).toString('hex');
  const token = 'f'.repeat(64);
  try {
    for (const migration of ['0001_finance.sql', '0002_auth.sql']) fixture.sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    fixture.sqlite.prepare(`INSERT INTO auth_users(id,email,name,role,status,password_hash,password_salt,password_version,created_at) VALUES ('legacy','person@example.test','Legacy','member','enabled',?,?,'pbkdf2-sha256-hmac-v1',?)`).run(legacyHash, salt, now);
    fixture.sqlite.prepare('INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').run(digest(token), 'legacy', now, now + 3600);
    fixture.sqlite.prepare("INSERT INTO auth_invites(token_hash,email,role,created_at,expires_at,consumed_at,user_id) VALUES (?,'person@example.test','member',?,?,?,'legacy')").run(digest('e'.repeat(64)), now, now + 3600, now);
    const oldUser = fixture.sqlite.prepare('SELECT * FROM auth_users').get();
    const oldSession = fixture.sqlite.prepare('SELECT * FROM auth_sessions').get();
    const oldInvite = fixture.sqlite.prepare('SELECT * FROM auth_invites').get();
    fixture.sqlite.exec(readFileSync(new URL('../migrations/0003_auth_password_scheme.sql', import.meta.url), 'utf8'));
    const { password_scheme, ...preserved } = fixture.sqlite.prepare('SELECT * FROM auth_users').get();
    assert.equal(password_scheme, 'pbkdf2-sha256-hmac-v1');
    assert.deepEqual(preserved, { ...oldUser });
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM auth_sessions').get(), oldSession);
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM auth_invites').get(), oldInvite);
    assert.equal((await handleAuthRequest(post('login', { email: 'person@example.test', password }), fixture.db)).status, 200);
    const originalError = console.error; const logged = [];
    const limit = installProductionCryptoLimit();
    console.error = (...values) => logged.push(values);
    try {
      const response = await handleAuthRequest(post('login', { email: 'person@example.test', password }), fixture.db);
      assert.equal(response.status, 503);
      assert.equal((await handleAuthRequest(session(`__Host-family_session=${token}`), fixture.db)).status, 200);
      assert.equal(fixture.sqlite.prepare("SELECT password_hash FROM auth_users WHERE id='legacy'").get().password_hash, legacyHash);
      const diagnostics = JSON.stringify(logged);
      assert.match(diagnostics, /auth_failure/); assert.match(diagnostics, /password_kdf_limit/);
      for (const secret of [password, authSecret, 'person@example.test', token, legacyHash, salt]) assert.ok(!diagnostics.includes(secret));
    } finally { limit.restore(); console.error = originalError; }
  } finally { fixture.close(); }
});
