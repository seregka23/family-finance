import { requireAccess } from './auth';
import type { FinanceDatabase } from './database';

const pages = new Set(['/', '/operations', '/plan', '/accounts', '/dashboards']);
const publicPages = new Set(['/login', '/register']);
const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export function allowedSsrHosts(): string[] | undefined {
  return process.env['SSR_ALLOWED_HOSTS']
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}
export async function handlePageRequest(
  request: Request,
  render: (request: Request) => Promise<Response | null>,
  database?: FinanceDatabase
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/auth/login')
    return new Response(null, { status: 307, headers: { ...privateHeaders, Location: '/login' } });
  if (!pages.has(url.pathname) && !publicPages.has(url.pathname))
    return new Response('Not found', { status: 404, headers: privateHeaders });
  if (!publicPages.has(url.pathname)) {
    const user = await requireAccess(request, database);
    if (user instanceof Response) {
      if (user.status === 401)
        return new Response(null, {
          status: 307,
          headers: {
            ...privateHeaders,
            Location: `/login?return_to=${encodeURIComponent(url.pathname + url.search)}`
          }
        });
      return user;
    }
  }
  const rendered = await render(request);
  if (!rendered) return new Response('Not found', { status: 404, headers: privateHeaders });
  const response = new Response(rendered.body, rendered);
  for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
  return response;
}
