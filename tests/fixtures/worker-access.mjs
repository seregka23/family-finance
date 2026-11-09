// Test-only certificate transport, selected explicitly by the local runtime test.
const trustedUrl = 'https://finance-test.cloudflareaccess.com/cdn-cgi/access/certs';
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  return url === trustedUrl
    ? Promise.resolve(Response.json(JSON.parse(process.env.ACCESS_TEST_JWKS)))
    : originalFetch(input, init);
};

export default {
  async fetch(request, env, context) {
    // Load the real production handler after the fixture transport is installed.
    const { default: production } = await import('../../worker/index.mjs');
    return production.fetch(request, env, context);
  }
};
