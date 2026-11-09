import { generateKeyPair, sign } from 'node:crypto';
import { promisify } from 'node:util';

export const accessIssuer = 'https://finance-test.cloudflareaccess.com';
export const accessAudience = 'family-finance-test-audience';
export const accessJwksUrl = `${accessIssuer}/cdn-cgi/access/certs`;

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export async function createAccessFixture() {
  const { publicKey, privateKey } = await promisify(generateKeyPair)('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
  const jwks = { keys: [jwk] };
  const signedClaims = (claims, signingKey = privateKey) => {
    const data = `${encode({ alg: 'RS256', kid: 'fixture-key' })}.${encode(claims)}`;
    return `${data}.${sign('RSA-SHA256', Buffer.from(data), signingKey).toString('base64url')}`;
  };
  const claims = (email = 'allowed@example.test', overrides = {}) => ({
    email,
    name: 'Fixture User',
    iss: accessIssuer,
    aud: accessAudience,
    sub: 'fixture-user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides
  });
  const token = (email = 'allowed@example.test', overrides = {}, signingKey = privateKey) =>
    signedClaims(claims(email, overrides), signingKey);
  return { jwks, claims, token, signedClaims, privateKey };
}
