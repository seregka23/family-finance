import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile(new URL('../.dev.vars', import.meta.url),
    `AUTH_ORIGIN=http://localhost:8787\nAUTH_SECRET=${randomBytes(32).toString('hex')}\n`,
    { mode: 0o600, flag: 'wx' });
  console.log('Created private .dev.vars for local authentication. Existing files are never overwritten.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.dev.vars already exists; left unchanged.');
  else throw error;
}
