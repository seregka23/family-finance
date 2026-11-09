import { reqHandler } from '../dist/family-finance-worker/server/server.mjs';

export default {
  fetch(request, env) {
    return reqHandler(request, { DB: env.DB });
  }
};
