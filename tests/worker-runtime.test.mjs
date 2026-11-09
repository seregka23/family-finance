import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertPublicRuntime, runtimeEnv } from './public-runtime.mjs';

test(
  'Cloudflare runtime serves public SSR, assets and empty APIs',
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
        'SSR_ALLOWED_HOSTS:localhost,127.0.0.1'
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
      await assertPublicRuntime(request);
      const font = await request('/fonts/geist-98bbbccb.woff2');
      assert.equal(font.status, 200);
      assert.ok((await font.arrayBuffer()).byteLength > 1000);
      const html = await (await request('/')).text();
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
