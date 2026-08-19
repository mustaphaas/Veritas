import { answerReaQuestion, type ReaAiRequest } from "../../shared/rea-ai";
import {
  cookieValue,
  verifyReaSessionToken,
} from "../../shared/rea-server-auth";

type PagesContext = {
  request: Request;
  env: {
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    REA_AUTH_SECRET?: string;
  };
};

const responseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export async function onRequestPost(context: PagesContext) {
  const authenticated = await verifyReaSessionToken(
    cookieValue(context.request.headers.get("Cookie")),
    context.env.REA_AUTH_SECRET,
  );
  if (!authenticated) {
    return new Response(JSON.stringify({ error: "REA access is required." }), {
      status: 401,
      headers: responseHeaders,
    });
  }

  try {
    const body = (await context.request.json()) as ReaAiRequest;
    const result = await answerReaQuestion(body, context.env);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: responseHeaders,
    });
  }
}
