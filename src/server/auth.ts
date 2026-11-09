import { scrypt, timingSafeEqual } from 'node:crypto';
import { json, type FinanceDatabase } from './database';

export type AuthUser = { id: string; email: string; name: string; role: 'member' | 'admin' };
export type AuthConfiguration = { origin: string; secret: string; secure: boolean };
export const LEGACY_PASSWORD_VERSION = 'pbkdf2-sha256-hmac-v1';
export const PASSWORD_SCHEME = 'scrypt-hmac-v2';
// OWASP scrypt option: 32 MiB, r=8, p=3; cost786432 stays below Workers1048576 limit.
export const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
// Preserve the original PBKDF2 work factor for legacy credentials; never reduce it.
export const PASSWORD_ITERATIONS = 600000;
const SESSION_SECONDS = 604800;
const encoder = new TextEncoder();

export function authConfiguration(): AuthConfiguration | null {
  const secret = process.env['AUTH_SECRET'];
  const configuredOrigin = process.env['AUTH_ORIGIN'];
  if (!secret || encoder.encode(secret).length < 32 || !configuredOrigin) return null;
  try {
    const url = new URL(configuredOrigin);
    const local =
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (!local && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return { origin: url.origin, secret, secure: !local };
  } catch {
    return null;
  }
}
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
export async function tokenHash(token: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
}
export async function keyedHash(value: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, encoder.encode(value));
}
export async function passwordHash(
  password: string,
  salt: string,
  secret: string,
  scheme: string = PASSWORD_SCHEME
): Promise<string> {
  const peppered = await keyedHash(`password:${password}`, secret);
  if (scheme === PASSWORD_SCHEME) {
    const derived = await new Promise<Uint8Array>((resolve, reject) =>
      scrypt(new Uint8Array(peppered), encoder.encode(salt), 32, SCRYPT_OPTIONS, (error, result) =>
        error ? reject(error) : resolve(result)
      )
    );
    return Array.from(derived, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  if (scheme !== LEGACY_PASSWORD_VERSION) throw new Error('Unsupported password scheme');
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: encoder.encode(salt),
        iterations: PASSWORD_ITERATIONS
      },
      key,
      256
    )
  );
}
function equalHash(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(encoder.encode(left), encoder.encode(right));
}

export function sessionCookie(
  token: string,
  configuration: AuthConfiguration,
  clear = false
): string {
  return `${configuration.secure ? '__Host-family_session' : 'family_session'}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_SECONDS}${configuration.secure ? '; Secure' : ''}`;
}
export function readSessionToken(
  request: Request,
  configuration: AuthConfiguration
): string | null {
  const name = configuration.secure ? '__Host-family_session' : 'family_session';
  const tokens = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (tokens.length !== 1) return null;
  const token = tokens[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export const authUnavailable = () => json({ error: 'Authentication unavailable' }, 503);

/** A hashed opaque session and current database role/status are checked on every request. */
export async function requireAccess(
  request: Request,
  database?: FinanceDatabase
): Promise<AuthUser | Response> {
  const configuration = authConfiguration();
  if (!configuration || !database) {
    logAuthFailure('session', 'configuration');
    return authUnavailable();
  }
  const token = readSessionToken(request, configuration);
  if (!token) return json({ error: 'Authentication required' }, 401);
  try {
    const result = await database
      .prepare(
        `SELECT u.id,u.email,u.name,u.role,u.status FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`
      )
      .bind(await tokenHash(token), Math.floor(Date.now() / 1000))
      .all<AuthUser & { status: string }>();
    if (!result.success) {
      logAuthFailure('session', 'session_lookup');
      return authUnavailable();
    }
    const user = result.results[0];
    if (!user) return json({ error: 'Authentication required' }, 401);
    if (user.status !== 'enabled' || !['member', 'admin'].includes(user.role))
      return json({ error: 'Access denied' }, 403);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  } catch (error) {
    logAuthFailure('session', 'session_lookup', error);
    return authUnavailable();
  }
}
export async function verifyPassword(
  password: string,
  salt: string,
  hash: string,
  secret: string,
  scheme: string = PASSWORD_SCHEME
): Promise<boolean> {
  return equalHash(await passwordHash(password, salt, secret, scheme), hash);
}

/** Only fixed diagnostic labels are logged: never request values or exception text. */
export function logAuthFailure(operation: string, stage: string, error?: unknown): void {
  const message = error instanceof Error ? error.message : '';
  const code =
    /PBKDF2|Pbkdf2|pbkdf2/.test(message) && /iteration|limit|100000|100,000/i.test(message)
      ? 'password_kdf_limit'
      : stage === 'password_hash'
        ? 'password_hash_failure'
        : stage === 'configuration'
          ? 'configuration_unavailable'
          : 'database_failure';
  console.error(JSON.stringify({ event: 'auth_failure', operation, stage, code }));
}
