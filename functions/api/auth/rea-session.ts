import {
  clearReaSessionCookie,
  createReaSessionToken,
  REA_DEMO_EMAIL,
  REA_DEMO_PASSWORD,
  reaSessionCookie,
} from "../../../shared/rea-server-auth";

type PagesContext = {
  request: Request;
  env: { REA_AUTH_SECRET?: string };
};

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export async function onRequestPost(context: PagesContext) {
  if (!context.env.REA_AUTH_SECRET || context.env.REA_AUTH_SECRET.length < 32) {
    return new Response(
      JSON.stringify({ error: "REA server authentication is not configured." }),
      { status: 503, headers },
    );
  }
  try {
    const body = (await context.request.json()) as {
      email?: string;
      password?: string;
    };
    if (
      body.email?.trim().toLowerCase() !== REA_DEMO_EMAIL ||
      body.password !== REA_DEMO_PASSWORD
    ) {
      return new Response(JSON.stringify({ error: "Invalid credentials." }), {
        status: 401,
        headers,
      });
    }
    const token = await createReaSessionToken(
      context.env.REA_AUTH_SECRET,
      REA_DEMO_EMAIL,
    );
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, "Set-Cookie": reaSessionCookie(token) },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers,
    });
  }
}

export async function onRequestDelete() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...headers, "Set-Cookie": clearReaSessionCookie() },
  });
}
