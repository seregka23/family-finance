import {
  authConfiguration,
  authUnavailable,
  keyedHash,
  passwordHash,
  PASSWORD_VERSION,
  randomToken,
  readSessionToken,
  requireAccess,
  sessionCookie,
  tokenHash,
  verifyPassword,
  type AuthUser
} from '../auth';
import { json, type FinanceDatabase } from '../database';

type UserRow = AuthUser & {
  status: string;
  password_hash: string;
  password_salt: string;
  password_version: string;
};
const nowSeconds = () => Math.floor(Date.now() / 1000);
const invalid = () =>
  json({ error: 'Не удалось зарегистрироваться. Проверьте данные и приглашение.' }, 400);
const badLogin = () => json({ error: 'Неверный email или пароль.' }, 401);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function rateLimit(
  database: FinanceDatabase,
  secret: string,
  request: Request,
  email: string,
  action: string,
  token = ''
) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const scopes = [
    { key: `${action}:ip:${ip}`, limit: action === 'login' ? 30 : 15 },
    { key: `${action}:email:${email}`, limit: action === 'login' ? 10 : 8 }
  ];
  if (action === 'register') scopes.push({ key: `register:invite:${token}`, limit: 5 });
  const now = nowSeconds(),
    seconds = action === 'login' ? 900 : 3600;
  // Check IP first: rejected clients cannot create unbounded email/invite buckets.
  for (const scope of scopes) {
    const bucket = Array.from(
      new Uint8Array(await keyedHash(`rate:${scope.key}`, secret)),
      (value) => value.toString(16).padStart(2, '0')
    ).join('');
    const results = await database.batch<{ attempts: number }>([
      database
        .prepare(
          'DELETE FROM auth_rate_limits WHERE bucket_hash IN (SELECT bucket_hash FROM auth_rate_limits WHERE expires_at<=? LIMIT 100)'
        )
        .bind(now),
      database
        .prepare(
          'DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at<=? LIMIT 100)'
        )
        .bind(now),
      database
        .prepare(
          `INSERT INTO auth_rate_limits(bucket_hash,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_hash) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`
        )
        .bind(bucket, now + seconds, now, now)
    ]);
    if (results.length !== 3 || results.some((result) => !result.success) || !results[2].results[0])
      throw new Error('Rate limiter unavailable');
    if (results[2].results[0].attempts > scope.limit) return true;
  }
  return false;
}
async function responseWithSession(
  user: AuthUser,
  token: string,
  configuration: NonNullable<ReturnType<typeof authConfiguration>>
) {
  const response = json({ user });
  response.headers.set('Set-Cookie', sessionCookie(token, configuration));
  return response;
}
export async function handleAuthRequest(
  request: Request,
  database?: FinanceDatabase
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (
    !['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/session'].includes(
      path
    )
  )
    return json({ error: 'Not found' }, 404);
  const expected = path === '/api/auth/session' ? 'GET' : 'POST';
  if (request.method !== expected)
    return new Response(null, {
      status: 405,
      headers: { Allow: expected, 'Cache-Control': 'private, no-store' }
    });
  const configuration = authConfiguration();
  if (!configuration || !database) return authUnavailable();
  if (expected === 'GET') {
    const user = await requireAccess(request, database);
    return user instanceof Response ? user : json({ user });
  }
  if (request.headers.get('Origin') !== configuration.origin)
    return json({ error: 'Недопустимый источник запроса.' }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? ''))
    return json({ error: 'Expected application/json' }, 415);
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get('Content-Length') ?? 0) > 4096)
      return json({ error: 'Request too large' }, 413);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Invalid request' }, 400);
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return json({ error: 'Request too large' }, 413);
      }
      chunks.push(part.value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(data));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return json({ error: 'Invalid request' }, 400);
    body = value as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  try {
    if (path === '/api/auth/logout') {
      const token = readSessionToken(request, configuration);
      if (token) {
        const result = await database
          .prepare('DELETE FROM auth_sessions WHERE token_hash=?')
          .bind(await tokenHash(token))
          .run();
        if (!result.success) return authUnavailable();
      }
      const response = json({ ok: true });
      response.headers.set('Set-Cookie', sessionCookie('', configuration, true));
      return response;
    }
    const email = typeof body['email'] === 'string' ? body['email'].trim().toLowerCase() : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    const invite = typeof body['token'] === 'string' ? body['token'] : '';
    if (
      await rateLimit(
        database,
        configuration.secret,
        request,
        email,
        path.endsWith('login') ? 'login' : 'register',
        invite
      )
    )
      return json({ error: 'Слишком много попыток. Попробуйте позже.' }, 429);
    if (
      !emailPattern.test(email) ||
      email.length > 254 ||
      password.length < 12 ||
      password.length > 128
    )
      return path.endsWith('login') ? badLogin() : invalid();
    const previousToken = readSessionToken(request, configuration);
    const previousHash = previousToken ? await tokenHash(previousToken) : '';
    const now = nowSeconds(),
      session = randomToken(),
      sessionHash = await tokenHash(session);
    if (path === '/api/auth/login') {
      const result = await database
        .prepare('SELECT * FROM auth_users WHERE email=?')
        .bind(email)
        .all<UserRow>();
      if (!result.success) return authUnavailable();
      const user = result.results[0];
      // Hash even unknown emails so normal failures share the expensive verification path.
      const verified = await verifyPassword(
        password,
        user?.password_salt ?? '00000000000000000000000000000000',
        user?.password_hash ?? '0'.repeat(64),
        configuration.secret
      );
      if (
        !user ||
        !verified ||
        user.status !== 'enabled' ||
        user.password_version !== PASSWORD_VERSION ||
        !['member', 'admin'].includes(user.role)
      )
        return badLogin();
      const stored = await database.batch([
        database.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(previousHash),
        database
          .prepare(
            'INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?) RETURNING token_hash'
          )
          .bind(sessionHash, user.id, now, now + 604800)
      ]);
      if (
        stored.length !== 2 ||
        stored.some((result) => !result.success) ||
        stored[1].results.length !== 1
      )
        return authUnavailable();
      return responseWithSession(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        session,
        configuration
      );
    }
    if (name.length > 100 || !/^[a-f0-9]{64}$/.test(invite)) return invalid();
    const id = crypto.randomUUID(),
      salt = randomToken(),
      hash = await passwordHash(password, salt, configuration.secret),
      inviteHash = await tokenHash(invite);
    const results = await database.batch([
      database
        .prepare(
          `INSERT INTO auth_users(id,email,name,role,status,password_hash,password_salt,password_version,created_at)
        SELECT ?,?,?,role,'enabled',?,?,?,? FROM auth_invites WHERE token_hash=? AND email=? AND consumed_at IS NULL AND expires_at>? RETURNING id,email,name,role`
        )
        .bind(id, email, name, hash, salt, PASSWORD_VERSION, now, inviteHash, email, now),
      database
        .prepare(
          `UPDATE auth_invites SET consumed_at=?,user_id=? WHERE token_hash=? AND consumed_at IS NULL AND EXISTS(SELECT 1 FROM auth_users WHERE id=?) RETURNING token_hash`
        )
        .bind(now, id, inviteHash, id),
      database
        .prepare(
          `INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) SELECT ?,id,?,? FROM auth_users WHERE id=? RETURNING token_hash`
        )
        .bind(sessionHash, now, now + 604800, id),
      database
        .prepare(
          'DELETE FROM auth_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM auth_users WHERE id=?)'
        )
        .bind(previousHash, id)
    ]);
    if (
      results.length !== 4 ||
      results.some((result) => !result.success || !Array.isArray(result.results))
    )
      return authUnavailable();
    const user = results[0].results[0] as AuthUser | undefined;
    if (!user) return invalid();
    if (
      results[0].results.length !== 1 ||
      results[1].results.length !== 1 ||
      results[2].results.length !== 1
    )
      return authUnavailable();
    return responseWithSession(user, session, configuration);
  } catch (error) {
    // A duplicate email must not reveal whether an account already exists.
    if (
      path === '/api/auth/register' &&
      error instanceof Error &&
      /UNIQUE constraint failed: auth_users.email/.test(error.message)
    )
      return invalid();
    return authUnavailable();
  }
}
