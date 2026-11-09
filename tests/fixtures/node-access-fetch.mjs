// Test-only certificate transport. Production modules still perform real JWT verification.
const trustedUrl = 'https://finance-test.cloudflareaccess.com/cdn-cgi/access/certs';
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  return url === trustedUrl
    ? Promise.resolve(Response.json(JSON.parse(process.env.ACCESS_TEST_JWKS)))
    : originalFetch(input, init);
};
