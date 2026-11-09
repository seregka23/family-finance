import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Offline trusted-admin helper: creates SQL to apply with authenticated Wrangler.
// Raw tokens appear only in a mode-0600 invitation file, never on the console.
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index], process.argv[index + 1]);
const email = args.get('--email')?.trim().toLowerCase();
const role = args.get('--role') ?? 'member';
const output = args.get('--output');
const sqlOutput = args.get('--sql-output');
let origin;
try {
  origin = new URL(args.get('--origin'));
} catch {
  /* Validated below. */
}
const localHttp =
  origin?.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
if (
  !email ||
  email.length > 254 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !['member', 'admin'].includes(role) ||
  !output ||
  !sqlOutput ||
  !origin ||
  (!localHttp && origin.protocol !== 'https:') ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  resolve(output) === resolve(sqlOutput)
) {
  console.error(
    'Usage: node scripts/create-invite.mjs --email EMAIL --role member|admin --origin https://APP --output PRIVATE_INVITATION_FILE --sql-output PRIVATE_SQL_FILE'
  );
  process.exit(1);
}
const token = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(token).digest('hex');
const now = Math.floor(Date.now() / 1000);
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const sql = `INSERT INTO auth_invites(token_hash,email,role,created_at,expires_at) VALUES(${quote(hash)},${quote(email)},${quote(role)},${now},${now + 86400});\n`;
for (const path of [output, sqlOutput])
  await mkdir(dirname(resolve(path)), { recursive: true, mode: 0o700 });
await writeFile(sqlOutput, sql, { mode: 0o600, flag: 'wx' });
await writeFile(
  output,
  `${origin.origin}/register#token=${token}\n\nДля: ${email}\nДействует до: ${new Date((now + 86400) * 1000).toISOString()}\n`,
  { mode: 0o600, flag: 'wx' }
);
console.log(
  'Created private invitation and SQL files. Apply the SQL with trusted database administration before using the invitation.'
);
