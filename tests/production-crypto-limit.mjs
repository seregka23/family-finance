// Workerd's production default caps WebCrypto PBKDF2 at 100,000 iterations.
// Local Miniflare disables that limit, so tests explicitly restore it.
export function installProductionCryptoLimit() {
  const subtle = globalThis.crypto.subtle;
  const original = subtle.deriveBits;
  let rejected = 0;
  subtle.deriveBits = function (algorithm, ...arguments_) {
    if (typeof algorithm === 'object' && algorithm.name.toUpperCase() === 'PBKDF2' && algorithm.iterations > 100000) {
      rejected++;
      return Promise.reject(new DOMException('PBKDF2 iteration count exceeds production limit', 'NotSupportedError'));
    }
    return original.call(this, algorithm, ...arguments_);
  };
  return { get rejected() { return rejected; }, restore() { subtle.deriveBits = original; } };
}
