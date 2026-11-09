/** Auth failures need an actionable response; other errors remain generic. */
export function authErrorStatus(error: unknown): 401 | 403 | null {
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 401 || error.status === 403) return error.status;
  }
  return null;
}

const financePaths = new Set(['/', '/operations', '/plan', '/accounts', '/dashboards']);

export function safeReturnTo(route: string | null): string {
  if (!route || /[\\\x00-\x1f\x7f]/.test(route) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(route)) return '/';
  const path = route.split(/[?#]/, 1)[0];
  return financePaths.has(path) ? route : '/';
}

export function loginUrl(route: string): string {
  return `/login?return_to=${encodeURIComponent(safeReturnTo(route))}`;
}
