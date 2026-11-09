import { accessConfiguration, requireAccess } from './auth';

const pages = new Set(['/', '/operations', '/plan', '/accounts', '/dashboards']);
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
      if (url.origin !== 'https://local.invalid' || !pages.has(url.pathname)) return '/';
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        const original = new URL(value, 'https://local.invalid');
        return `${original.pathname}${original.search}${original.hash}`;
      }
      decoded = next;
    }
  } catch {
    /* Invalid encodings cannot be redirect destinations. */
  }
  return '/';
}

/** Shared protected page routing for the Node and Cloudflare SSR adapters. */
export async function handlePageRequest(
  request: Request,
  render: (request: Request) => Promise<Response | null>
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/auth/logout')
    return new Response(null, {
      status: 307,
      headers: { ...privateHeaders, Location: '/cdn-cgi/access/logout' }
    });
  if (url.pathname === '/auth/login') {
    if (!accessConfiguration())
      return new Response('Authentication is not configured', {
        status: 503,
        headers: privateHeaders
      });
    return new Response(null, {
      status: 307,
      headers: { ...privateHeaders, Location: safeReturnTo(url.searchParams.get('return_to')) }
    });
  }
  if (!pages.has(url.pathname))
    return new Response('Not found', { status: 404, headers: privateHeaders });
  const access = await requireAccess(request);
  if (access instanceof Response) {
    if (access.status === 401 || access.status === 403) {
      const forbidden = access.status === 403;
      return new Response(
        `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${forbidden ? 'Нет доступа' : 'Требуется вход'}</title><h1>${forbidden ? 'Нет доступа' : 'Войдите через Cloudflare Access'}</h1><p>${forbidden ? 'Аккаунт не добавлен в список разрешённых пользователей.' : 'Сессия отсутствует или завершилась.'}</p><a href="/auth/login">Войти заново</a> <a href="/auth/logout">Выйти или сменить аккаунт</a></html>`,
        {
          status: access.status,
          headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' }
        }
      );
    }
    return access;
  }
  const rendered = await render(request);
  if (!rendered) return new Response('Not found', { status: 404, headers: privateHeaders });
  const response = new Response(rendered.body, rendered);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
