import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { localD1 } from './d1-fixture.mjs';

test('offline invitation issuer writes private fragment links and hashed SQL without printing secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-invite-'));
  const fixture = localD1(':memory:', true, false);
  try {
    const output = join(directory, 'invitation.txt'); const sqlOutput = join(directory, 'invite.sql');
    const result = await promisify(execFile)(process.execPath, ['scripts/create-invite.mjs', '--email', 'Member@Example.Test', '--origin', 'https://example.test', '--output', output, '--sql-output', sqlOutput], { cwd: new URL('../', import.meta.url) });
    const text = await readFile(output, 'utf8'); const sql = await readFile(sqlOutput, 'utf8');
    const link = new URL(text.split('\n')[0]);
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    assert.match(token, /^[a-f0-9]{64}$/); assert.equal(link.search, ''); assert.equal(link.pathname, '/register');
    for (const path of [output, sqlOutput]) assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.ok(!result.stdout.includes(token)); assert.ok(!result.stderr.includes(token)); assert.ok(!sql.includes(token));
    fixture.sqlite.exec(sql);
    const invitation = fixture.sqlite.prepare('SELECT * FROM auth_invites').get();
    assert.equal(invitation.email, 'member@example.test');
    assert.equal(invitation.token_hash, createHash('sha256').update(token).digest('hex'));
    assert.equal(invitation.expires_at - invitation.created_at, 86400);
  } finally { fixture.close(); await rm(directory, { recursive: true, force: true }); }
});

test('browser HTTP transport excludes invitation fragments from the server request URL', async () => {
  let received;
  const server = createServer((request, response) => { received = request.url; response.end('Registration'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await fetch(`http://127.0.0.1:${server.address().port}/register#token=${'e'.repeat(64)}`);
    assert.equal(received, '/register');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
