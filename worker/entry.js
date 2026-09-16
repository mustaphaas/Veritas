import worker from './index.js';
import { handleClaimsApi } from './claims-api.js';
import { handleSatelliteApi } from './satellite-api.js';

export default {
  async fetch(request, env, ctx) {
    const claimsResponse = await handleClaimsApi(request, env);
    if (claimsResponse) return claimsResponse;
    const satelliteResponse = await handleSatelliteApi(request, env);
    if (satelliteResponse) return satelliteResponse;
    return worker.fetch(request, env, ctx);
  },
};
