import { authConfiguration } from './auth';
import { json } from './database';

/** Bounded JSON and an exact configured Origin are required for browser writes. */
export async function readWriteBody(request: Request): Promise<Record<string, unknown> | Response> {
  const configuration = authConfiguration();
  if (!configuration) return json({ error: 'Authentication unavailable' }, 503);
  if (request.headers.get('Origin') !== configuration.origin)
    return json({ error: 'Недопустимый источник запроса.' }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? ''))
    return json({ error: 'Expected application/json' }, 415);
  if (Number(request.headers.get('Content-Length') ?? 0) > 8192)
    return json({ error: 'Request too large' }, 413);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Invalid request' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return json({ error: 'Request too large' }, 413);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return json({ error: 'Invalid request' }, 400);
    return body as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
}
