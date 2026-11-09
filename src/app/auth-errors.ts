/** Auth failures need an actionable response; other errors remain generic. */
export function authErrorStatus(error: unknown): 401 | 403 | null {
  if (error && typeof error === 'object' && 'status' in error) {
    if (error.status === 401 || error.status === 403) return error.status;
  }
  return null;
}

export function loginUrl(route: string): string {
  const localRoute = route.startsWith('/') && !route.startsWith('//') ? route : '/';
  return `/auth/login?return_to=${encodeURIComponent(localRoute)}`;
}
