// Entry point for Cloudflare Workers Builds (npx wrangler versions upload /
// npx wrangler deploy). Static assets are served directly by the "assets"
// binding configured in wrangler.jsonc; only requests matching
// run_worker_first (/api/*) reach this fetch handler. Route logic itself
// lives in functions/_lib/api.ts and is shared with the legacy Cloudflare
// Pages Functions entry (functions/api/[[path]].ts) so nothing is
// duplicated between the two deploy paths.
import { dispatch, type Bindings } from "../functions/_lib/api";
import { fail } from "../functions/_lib/http";

// ASSETS is typed loosely (rather than via @cloudflare/workers-types,
// which isn't a project dependency) since this handler never calls it
// directly - static requests are routed to it by Cloudflare before ever
// reaching this Worker.
export interface Env extends Bindings {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await dispatch(request, env);
    } catch (error) {
      return fail(error);
    }
  },
};
