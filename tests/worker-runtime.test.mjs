import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test(
  'Cloudflare runtime serves SSR, assets and private APIs from the configured paths',
  { timeout: 60000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const { port } = reservation.address();
    await new Promise((resolve) => reservation.close(resolve));
    const temporary = await mkdtemp(join(tmpdir(), 'finance-worker-'));
    const server = spawn(
      process.execPath,
      [
        'node_modules/wrangler/bin/wrangler.js',
        'dev',
        '--local',
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--inspector-port',
        '0',
        '--var',
        'ALLOWED_EMAILS:allowed@example.test',
        '--var',
        'NOTION_TOKEN:',
        '--var',
        'SSR_ALLOWED_HOSTS:localhost,127.0.0.1'
      ],
      {
        cwd: new URL('../', import.meta.url),
        env: {
          ...process.env,
          NOTION_TOKEN: '',
          WRANGLER_SEND_METRICS: 'false',
          WRANGLER_LOG_PATH: join(temporary, 'wrangler.log'),
          XDG_CONFIG_HOME: join(temporary, 'config')
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
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
      const allowed = { 'oai-authenticated-user-email': 'allowed@example.test' };
      for (const path of ['/', '/operations', '/plan', '/accounts', '/dashboards']) {
        const anonymous = await request(path);
        assert.equal(anonymous.status, 307);
        assert.equal(
          anonymous.headers.get('location'),
          `/signin-with-chatgpt?return_to=${encodeURIComponent(path)}`
        );
        assert.equal(
          (await request(path, { 'oai-authenticated-user-email': 'denied@example.test' })).status,
          403
        );
        const response = await request(path, allowed);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.match(await response.text(), /ng-server-context="ssr"/);
      }
      for (const path of ['/api/operations', '/api/expenses?month=2026-08']) {
        assert.equal((await request(path)).status, 401);
        assert.equal(
          (await request(path, { 'oai-authenticated-user-email': 'denied@example.test' })).status,
          403
        );
        const missingConfig = await request(path, allowed);
        assert.equal(missingConfig.status, 503);
        assert.equal(missingConfig.headers.get('cache-control'), 'private, no-store');
      }
      assert.equal((await request('/api/missing', allowed)).status, 404);
      assert.equal((await request('/unknown', allowed)).status, 404);
      assert.equal((await request('/signin-with-chatgpt')).status, 503);
      const font = await request('/fonts/geist-98bbbccb.woff2');
      assert.equal(font.status, 200);
      assert.ok((await font.arrayBuffer()).byteLength > 1000);
      const html = await (await request('/', allowed)).text();
      const script = html.match(/<script[^>]+src="([^"]+\.js)"/);
      assert.ok(script, 'SSR must reference a browser script');
      assert.equal((await request(`/${script[1].replace(/^\//, '')}`)).status, 200);
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
