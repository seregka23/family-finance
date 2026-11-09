import type { FinanceDatabase } from './server/database';
import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { GET as expenses } from './server/api/expenses';
import { GET as operations } from './server/api/operations';
import { allowedSsrHosts, handlePageRequest } from './server/pages';

const angular = new AngularAppEngine({ allowedHosts: allowedSsrHosts() });

// Angular's platform-neutral entry is also used by the Cloudflare module Worker.
const handleRequest = async (request: Request, context?: { DB?: FinanceDatabase }) => {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'private, no-store' } }
      );
    }
    if (path === '/api/operations') return operations(request, context?.DB);
    if (path === '/api/expenses') return expenses(request, context?.DB);
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  return handlePageRequest(request, (value) => angular.handle(value));
};

createRequestHandler(handleRequest);
export const reqHandler = handleRequest;
