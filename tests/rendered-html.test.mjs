import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { assertPublicRuntime, runtimeEnv } from './public-runtime.mjs';

// Exercise the real Angular SSR production runtime without identity or database configuration.
test(
  'production Angular SSR serves public pages and empty APIs without credentials',
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
        ...runtimeEnv(),
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
      await assertPublicRuntime(request);
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
