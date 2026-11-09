import { createHash } from 'node:crypto';
import { loadTs } from './load-ts.mjs';
export const authOrigin = 'https://example.test';
export const authSecret = 'test-only-auth-secret-with-at-least-sixty-four-characters-for-fixtures';
process.env.AUTH_ORIGIN = authOrigin;
process.env.AUTH_SECRET = authSecret;
export const sessionToken = 'a'.repeat(64);
const digest = createHash('sha256').update(sessionToken).digest('hex');
export function sessionSeedSql() {
  const now = Math.floor(Date.now() / 1000);
  return `INSERT INTO auth_users(id,email,name,role,status,password_hash,password_salt,password_version,created_at)
    VALUES ('test-member','member@example.test','Test Member','member','enabled','${'0'.repeat(64)}','${'0'.repeat(64)}','pbkdf2-sha256-hmac-v1',${now});
    INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES ('${digest}','test-member',${now},${now + 3600});`;
}
export const loadAuthenticated = loadTs;
export const authorizedRequest = (url) => new Request(url, { headers: { Cookie: `__Host-family_session=${sessionToken}` } });
