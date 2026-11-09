import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { migrationSql } from './d1-fixture.mjs';
import { assertApplicationRuntime, runtimeEnv } from './public-runtime.mjs';
import { seedSql, assertPopulatedOperations } from './d1-seed.mjs';

test(
  'Cloudflare D1 persists migrated data across Worker restarts and authenticates registration and persists finance data',
  { timeout: 180000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const { port } = reservation.address();
    await new Promise((resolve) => reservation.close(resolve));
    const temporary = await mkdtemp(join(tmpdir(), 'finance-worker-'));
    const persist = join(temporary, 'state');
    const commandEnv = { ...runtimeEnv(), WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(temporary, 'wrangler.log'), XDG_CONFIG_HOME: join(temporary, 'config') };
    const wrangler = (...args) => promisify(execFile)(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { cwd: new URL('../', import.meta.url), env: commandEnv, timeout: 60000 });
    const migrationFile = join(temporary, 'migrations.sql');
    await writeFile(migrationFile, migrationSql());
    await wrangler('d1', 'execute', 'DB', '--local', '--persist-to', persist, '--file', migrationFile, '--yes');
    const invitation = randomBytes(32).toString('hex');
    const inviteFile = join(temporary, 'invite.sql');
    const now = Math.floor(Date.now() / 1000);
    await writeFile(inviteFile, `INSERT INTO auth_invites(token_hash,email,role,created_at,expires_at) VALUES ('${createHash('sha256').update(invitation).digest('hex')}','runtime@example.test','member',${now},${now + 3600});`);
    await wrangler('d1', 'execute', 'DB', '--local', '--persist-to', persist, '--file', inviteFile, '--yes');
    const start = () => spawn(
      process.execPath,
      [
        'node_modules/wrangler/bin/wrangler.js',
        'dev',
        '--local',
        '--persist-to', persist,
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--inspector-port',
        '0',
        '--var',
        'SSR_ALLOWED_HOSTS:localhost,127.0.0.1',
        '--var', `AUTH_ORIGIN:http://127.0.0.1:${port}`,
        '--var', `AUTH_SECRET:${runtimeEnv().AUTH_SECRET}`
      ],
      {
        cwd: new URL('../', import.meta.url),
        env: {
          ...runtimeEnv(),
          WRANGLER_SEND_METRICS: 'false',
          WRANGLER_LOG_PATH: join(temporary, 'wrangler.log'),
          XDG_CONFIG_HOME: join(temporary, 'config')
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let server = start();
    let output = '';
    server.stdout.on('data', (chunk) => {
      output += chunk;
    });
    server.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const request = (path, headers = {}) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(5000)
      });
    try {
      let ready = false;
      for (let i = 0; i < 200; i++) {
        if (server.exitCode !== null) throw new Error(`Worker exited before startup: ${output}`);
        try {
          const r = await request('/favicon.svg');
          if (r.ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      assert.ok(ready, output);
      const authPost = (path, body, cookie = '', origin = `http://127.0.0.1:${port}`) => fetch(`http://127.0.0.1:${port}/api/auth/${path}`, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body), redirect: 'manual'
      });
      const registration = await authPost('register', { email: 'runtime@example.test', password: 'Runtime correct horse battery!', name: 'Runtime Member', token: invitation });
      assert.equal(registration.status, 200, await registration.clone().text());
      const cookie = registration.headers.get('set-cookie').split(';')[0];
      assert.match(cookie, /^family_session=[a-f0-9]{64}$/);
      await assertApplicationRuntime(request, 200, cookie);
      assert.equal((await authPost('register', { email: 'runtime@example.test', password: 'Runtime correct horse battery!', token: invitation })).status, 400);
      assert.equal((await authPost('logout', {}, cookie, 'https://attacker.example')).status, 403);
      const login = await authPost('login', { email: 'runtime@example.test', password: 'Runtime correct horse battery!' });
      assert.equal(login.status, 200);
      const loginCookie = login.headers.get('set-cookie').split(';')[0];
      assert.notEqual(loginCookie, cookie);
      assert.equal((await authPost('logout', {}, loginCookie)).status, 200);
      assert.equal((await request('/api/auth/session', { Cookie: loginCookie })).status, 401);
      const allowedRequest = (path) => request(path, { Cookie: cookie });
      const seed = join(temporary, 'seed.sql');
      await writeFile(seed, seedSql());
      const stopped = once(server, 'exit');
      server.kill('SIGTERM');
      await stopped;
      await wrangler('d1', 'execute', 'DB', '--local', '--persist-to', persist, '--file', seed, '--yes');
      server = start();
      server.stdout.on('data', (chunk) => { output += chunk; });
      server.stderr.on('data', (chunk) => { output += chunk; });
      let populated;
      for (let attempt = 0; attempt < 200; attempt++) {
        try {
          const response = await allowedRequest('/api/operations?from=2026-08-05&to=2026-08-05&month=2026-08-01');
          if (response.ok) { populated = await response.json(); break; }
        } catch {}
        await delay(100);
      }
      assert.ok(populated, output);
      await assertPopulatedOperations(assert, populated);
      const expenses = await (await allowedRequest('/api/expenses?month=2026-08')).json();
      assert.equal(expenses.currencies.find((item) => item.currency === 'RSD').total, 4.73);
      assert.equal(expenses.currencies.find((item) => item.currency === 'EUR').total, 9.99);
      const receiptData = await (await allowedRequest('/api/operations?from=2026-08-20&to=2026-08-20&month=2026-08-01')).json();
      assert.equal(receiptData.receipts.items[0].itemCount, 2);
      assert.equal(receiptData.receipts.items[0].total, 3);

      const font = await allowedRequest('/fonts/geist-98bbbccb.woff2');
      assert.equal(font.status, 200);
      assert.ok((await font.arrayBuffer()).byteLength > 1000);
      const html = await (await allowedRequest('/')).text();
      const script = html.match(/<script[^>]+src="([^"]+\.js)"/);
      assert.ok(script, 'SSR must reference a browser script');
      assert.equal((await allowedRequest(`/${script[1].replace(/^\//, '')}`)).status, 200);
    } finally {
      if (server.exitCode === null) {
        const exited = once(server, 'exit');
        server.kill('SIGTERM');
        const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(timer);
      }
      await rm(temporary, { recursive: true, force: true });
    }
  }
);
