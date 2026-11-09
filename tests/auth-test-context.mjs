import { createLocalJWKSet } from 'jose';
import { createAccessFixture, accessIssuer, accessAudience } from './access-fixtures.mjs';
import { loadTs } from './load-ts.mjs';

export const access = await createAccessFixture();
process.env.CF_ACCESS_TEAM_DOMAIN = new URL(accessIssuer).hostname;
process.env.CF_ACCESS_AUD = accessAudience;
process.env.ALLOWED_EMAILS = 'allowed@example.test';
globalThis.accessTestJwksRequests = [];
globalThis.accessTestKeyResolver = createLocalJWKSet(access.jwks);
export const accessMocks = {
  jose: `export * from ${JSON.stringify(import.meta.resolve('jose'))};
    export const createRemoteJWKSet = (url) => { globalThis.accessTestJwksRequests.push(String(url)); return globalThis.accessTestKeyResolver; };`
};
export const loadAuthenticated = (file) => loadTs(file, accessMocks);
export const authorizedRequest = (url) => new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': access.token() } });
