import { createRemoteJWKSet, jwtVerify } from 'jose';

export type ChatGPTUser = { email: string; displayName: string; fullName: string | null };
type AccessConfiguration = { issuer: string; audience: string };

// Public signing keys may be reused across requests; user identity is never cached.
const signingKeys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function accessConfiguration(): AccessConfiguration | null {
  const team = process.env['CF_ACCESS_TEAM_DOMAIN']?.trim();
  const audience = process.env['CF_ACCESS_AUD']?.trim();
  if (!team || !audience) return null;
  try {
    const url = new URL(team.includes('://') ? team : `https://${team}`);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/i.test(url.hostname)
    )
      return null;
    return { issuer: url.origin, audience };
  } catch {
    return null;
  }
}

/** Verify an Access application JWT. Plain email headers and cookies prove no identity. */
export async function getChatGPTUser(request: Request): Promise<ChatGPTUser | null> {
  const configuration = accessConfiguration();
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!configuration || !assertion) return null;
  try {
    let keys = signingKeys.get(configuration.issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', configuration.issuer), {
        timeoutDuration: 5000,
        cooldownDuration: 30000,
        cacheMaxAge: 600000
      });
      // Configuration is trusted deployment input, but keep its public-key cache bounded.
      if (signingKeys.size >= 4) signingKeys.clear();
      signingKeys.set(configuration.issuer, keys);
    }
    const { payload } = await jwtVerify(assertion, keys, {
      issuer: configuration.issuer,
      audience: configuration.audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'email'],
      clockTolerance: 5
    });
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub.trim() ||
      typeof payload.iat !== 'number' ||
      !Number.isFinite(payload.iat) ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      payload.iat > Date.now() / 1000 + 5 ||
      payload.exp <= payload.iat ||
      typeof payload['email'] !== 'string' ||
      !/^[^\s@]+@[^\s@]+$/.test(payload['email'])
    )
      return null;
    const email = payload['email'].trim().toLocaleLowerCase('en-US');
    const fullName =
      typeof payload['name'] === 'string' && payload['name'].trim() ? payload['name'].trim() : null;
    return { email, displayName: fullName ?? email, fullName };
  } catch {
    // Unknown keys, network failures, bad signatures and invalid claims all fail closed.
    return null;
  }
}
