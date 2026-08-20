// Route handling lives in ../_lib/api.ts so it can be shared between the
// Cloudflare Pages Functions convention (this file) and the Workers
// entry point used by Workers Builds (worker/index.ts).
import { dispatch, type Bindings } from "../_lib/api";
import { fail } from "../_lib/http";

// PagesFunction is an ambient type normally supplied by
// @cloudflare/workers-types; typed loosely here since that package isn't
// a project dependency (this pre-dates today's change).
export const onRequest = async ({
  request,
  env,
}: {
  request: Request;
  env: Bindings;
}) => {
  try {
    return await dispatch(request, env);
  } catch (error) {
    return fail(error);
  }
};
