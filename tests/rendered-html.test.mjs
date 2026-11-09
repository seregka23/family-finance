import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

// Exercise the real Angular SSR production runtime, including request headers and redirects.
test(
  'production Angular SSR preserves authentication and private API boundaries',
  { timeout: 60000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const { port } = reservation.address();
    await new Promise((resolve) => reservation.close(resolve));
    const server = spawn(process.execPath, ['dist/family-finance/server/server.mjs'], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        ALLOWED_EMAILS: 'allowed@example.test',
        NOTION_TOKEN: '',
        PORT: String(port),
        HOST: '127.0.0.1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    server.stdout.on('data', (chunk) => {
      output += chunk;
    });
    server.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const base = `http://127.0.0.1:${port}`;
    const request = (path, headers = {}) =>
      fetch(`${base}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    try {
      let ready = false;
      for (let i = 0; i < 150; i++) {
        if (server.exitCode !== null) throw new Error(`Angular SSR exited early: ${output}`);
        try {
          await request('/favicon.svg');
          ready = true;
          break;
        } catch {
          await delay(100);
        }
      }
      assert.ok(ready, `Angular SSR did not start: ${output}`);
      const anonymous = await request('/');
      assert.equal(anonymous.status, 307);
      assert.match(anonymous.headers.get('location'), /^\/signin-with-chatgpt\?return_to=%2F$/);
      const denied = await request('/', { 'oai-authenticated-user-email': 'denied@example.test' });
      assert.equal(denied.status, 403);
      assert.match(await denied.text(), /Нет доступа/);
      const allowed = { 'oai-authenticated-user-email': 'allowed@example.test' };
      const page = await request('/', allowed);
      assert.equal(page.status, 200);
      assert.equal(page.headers.get('cache-control'), 'private, no-store');
      const html = await page.text();
      assert.match(html, /Семейные финансы/);
      assert.doesNotMatch(html, /codex-preview|_vinext|_next/);
      assert.match(html, /ng-server-context="ssr"/);
      assert.match(html, /Бюджет семьи/);
      for (const endpoint of ['/api/operations', '/api/expenses?month=2026-08']) {
        assert.equal((await request(endpoint)).status, 401);
        assert.equal(
          (await request(endpoint, { 'oai-authenticated-user-email': 'denied@example.test' }))
            .status,
          403
        );
        const unavailable = await request(endpoint, allowed);
        assert.equal(unavailable.status, 503);
        assert.equal(unavailable.headers.get('cache-control'), 'private, no-store');
      }
      const font = await request('/fonts/geist-98bbbccb.woff2');
      assert.equal(font.status, 200);
      assert.ok((await font.arrayBuffer()).byteLength > 1000);
    } finally {
      const exited = once(server, 'exit');
      if (server.exitCode === null) {
        server.kill('SIGTERM');
        const killTimer = setTimeout(() => server.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(killTimer);
      }
    }
  }
);
