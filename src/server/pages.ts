const pages = new Set(['/', '/operations', '/plan', '/accounts', '/dashboards']);
const privateHeaders = { 'Cache-Control': 'private, no-store' };

export function allowedSsrHosts(): string[] | undefined {
  return process.env['SSR_ALLOWED_HOSTS']
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

/** Shared public page routing for the Node and Cloudflare SSR adapters. */
export async function handlePageRequest(
  request: Request,
  render: (request: Request) => Promise<Response | null>
): Promise<Response> {
  if (!pages.has(new URL(request.url).pathname))
    return new Response('Not found', { status: 404, headers: privateHeaders });
  const rendered = await render(request);
  if (!rendered) return new Response('Not found', { status: 404, headers: privateHeaders });
  const response = new Response(rendered.body, rendered);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
