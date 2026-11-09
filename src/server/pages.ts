import { isEmailAllowed } from './access-control';
import { accessConfiguration, getChatGPTUser } from './auth';

const pages = new Set(['/', '/operations', '/plan', '/accounts', '/dashboards']);
const authAliases = new Set(['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']);
const privateHeaders = { 'Cache-Control': 'private, no-store' };

export function allowedSsrHosts(): string[] | undefined {
  return process.env['SSR_ALLOWED_HOSTS']
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

function safeReturnTo(value: string | null): string {
  if (!value || value.length > 4096 || !value.startsWith('/')) return '/';
  try {
    let decoded = value;
    for (let count = 0; count < 5; count++) {
      if (
        !decoded.startsWith('/') ||
        decoded.startsWith('//') ||
        /[\\\u0000-\u001f\u007f]/.test(decoded)
      )
        return '/';
      const url = new URL(decoded, 'https://local.invalid');
      if (
        url.origin !== 'https://local.invalid' ||
        authAliases.has(url.pathname) ||
        url.pathname.startsWith('/cdn-cgi/access/')
      )
        return '/';
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        const original = new URL(value, 'https://local.invalid');
        return `${original.pathname}${original.search}${original.hash}`;
      }
      decoded = next;
    }
  } catch {
    // Malformed encodings and URLs are not return destinations.
  }
  return '/';
}

/** Shared page boundary for the Node and Cloudflare SSR adapters. */
export async function handlePageRequest(
  request: Request,
  render: (request: Request) => Promise<Response | null>
): Promise<Response> {
  const url = new URL(request.url);
  if (!accessConfiguration()) {
    return new Response(
      'Cloudflare Access is not configured. Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.',
      {
        status: 503,
        headers: privateHeaders
      }
    );
  }
  if (url.pathname === '/signout-with-chatgpt') {
    return new Response(null, {
      status: 307,
      headers: { ...privateHeaders, Location: '/cdn-cgi/access/logout' }
    });
  }
  if (url.pathname === '/signin-with-chatgpt') {
    // A request to a protected application route starts the Access edge login flow.
    return new Response(null, {
      status: 307,
      headers: { ...privateHeaders, Location: safeReturnTo(url.searchParams.get('return_to')) }
    });
  }
  if (url.pathname === '/callback')
    return new Response('Not found', { status: 404, headers: privateHeaders });
  const user = await getChatGPTUser(request);
  if (!user) {
    // Access normally intercepts anonymous requests before the origin. Do not loop
    // origin redirects if a deployment's Access policy is missing or bypassed.
    return new Response(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Требуется вход</title><h1>Войдите через Cloudflare Access</h1><p>Сессия отсутствует или завершилась.</p><a href="/">Войти заново</a></html>',
      {
        status: 401,
        headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
  if (!isEmailAllowed(user.email)) {
    return new Response(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Нет доступа</title><h1>Нет доступа</h1><p>Аккаунт не добавлен в список разрешённых пользователей.</p><a href="/cdn-cgi/access/logout">Войти с другим аккаунтом</a></html>',
      { status: 403, headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  if (!pages.has(url.pathname))
    return new Response('Not found', { status: 404, headers: privateHeaders });
  const rendered = await render(request);
  if (!rendered) return new Response('Not found', { status: 404, headers: privateHeaders });
  const response = new Response(rendered.body, rendered);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
