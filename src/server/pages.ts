import { isEmailAllowed } from './access-control';
import { getChatGPTUser } from './auth';

const pages = new Set(['/', '/operations', '/plan', '/accounts', '/dashboards']);
const proxyPaths = new Set(['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']);
const privateHeaders = { 'Cache-Control': 'private, no-store' };

export function allowedSsrHosts(): string[] | undefined {
  return process.env['SSR_ALLOWED_HOSTS']
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

/** Shared page boundary for the Node and Cloudflare SSR adapters. */
export async function handlePageRequest(
  request: Request,
  render: (request: Request) => Promise<Response | null>
): Promise<Response> {
  const url = new URL(request.url);
  if (proxyPaths.has(url.pathname))
    return new Response('Authentication proxy is required.', {
      status: 503,
      headers: privateHeaders
    });
  const user = getChatGPTUser(request);
  if (!user) {
    const returnTo = `${url.pathname}${url.search}`;
    return new Response(null, {
      status: 307,
      headers: {
        ...privateHeaders,
        Location: `/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo.startsWith('//') ? '/' : returnTo)}`
      }
    });
  }
  if (!isEmailAllowed(user.email)) {
    return new Response(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Нет доступа</title><h1>Нет доступа</h1><p>Аккаунт не добавлен в список разрешённых пользователей.</p><a href="/signout-with-chatgpt?return_to=/">Войти с другим аккаунтом</a></html>',
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
