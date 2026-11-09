import { installProductionCryptoLimit } from '../production-crypto-limit.mjs';
installProductionCryptoLimit();
export default {
  async fetch(request, env, context) {
    const { default: production } = await import('../../worker/index.mjs');
    return production.fetch(request, env, context);
  }
};
