import worker from './index.js';
import { handleClaimsApi } from './claims-api.js';

export default {
  async fetch(request, env, ctx) {
    const claimsResponse = await handleClaimsApi(request, env);
    if (claimsResponse) return claimsResponse;
    return worker.fetch(request, env, ctx);
  },
};
