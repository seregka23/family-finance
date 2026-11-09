export type ChatGPTUser = { email: string; displayName: string; fullName: string | null };

// The deployment proxy authenticates visitors and replaces these headers.
export function getChatGPTUser(request: Request): ChatGPTUser | null {
  const email = request.headers.get('oai-authenticated-user-email');
  if (!email) return null;
  let fullName: string | null = null;
  if (
    request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8'
  ) {
    try {
      fullName =
        decodeURIComponent(request.headers.get('oai-authenticated-user-full-name') ?? '') || null;
    } catch {
      /* Ignore malformed optional names. */
    }
  }
  return { email, displayName: fullName ?? email, fullName };
}
