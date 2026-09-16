import worker from './index.js';
import { handleClaimsApi } from './claims-api.js';
import { handleReaUserActions } from './rea-user-actions.js';

export default {
  async fetch(request, env, ctx) {
    const reaUserResponse = await handleReaUserActions(request, env);
    if (reaUserResponse) return reaUserResponse;
    const claimsResponse = await handleClaimsApi(request, env);
    if (claimsResponse) return claimsResponse;
    return worker.fetch(request, env, ctx);
  },
};
