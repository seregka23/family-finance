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
import { assertProtectedRuntime, runtimeEnv, runtimeAccess } from './public-runtime.mjs';
import { seedSql, assertPopulatedOperations } from './d1-seed.mjs';

test(
  'Cloudflare D1 persists migrated data across Worker restarts and protects SSR with Access',
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
    await wrangler('d1', 'execute', 'DB', '--local', '--persist-to', persist, '--file', 'migrations/0001_finance.sql', '--yes');
    const start = () => spawn(
      process.execPath,
      [
        'node_modules/wrangler/bin/wrangler.js',
        'dev',
        'tests/fixtures/worker-access.mjs',
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
        '--var', `CF_ACCESS_TEAM_DOMAIN:${runtimeEnv().CF_ACCESS_TEAM_DOMAIN}`,
        '--var', `CF_ACCESS_AUD:${runtimeEnv().CF_ACCESS_AUD}`,
        '--var', 'ALLOWED_EMAILS:allowed@example.test',
        '--var', `ACCESS_TEST_JWKS:${runtimeEnv().ACCESS_TEST_JWKS}`
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
      await assertProtectedRuntime(request);
      const allowedRequest = (path) => request(path, { 'Cf-Access-Jwt-Assertion': runtimeAccess.token() });
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
