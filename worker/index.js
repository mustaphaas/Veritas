const BUILD_ID = "veritas-2026-08-22-gemini-r36";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Veritas-Build": BUILD_ID,
    },
  });

function latestQuestion(messages = []) {
  return [...messages]
    .reverse()
    .find((message) => message?.role === "user")?.content?.trim() || "";
}

function compactConversation(messages = []) {
  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim(),
    )
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.trim()}`)
    .join("\n\n");
}

function compactContext(databaseContext = {}) {
  const context = { ...databaseContext };
  const projects = Array.isArray(context.projects) ? context.projects : [];

  if (projects.length > 120) {
    context.projects = projects.slice(0, 120);
    context.projectRecordNote = `Project-level context contains the first 120 of ${projects.length} records. Portfolio and aggregate summaries cover the full dataset.`;
  }

  return context;
}

function buildInput(messages, databaseContext) {
  const conversation = compactConversation(messages);
  const question = latestQuestion(messages);
  const context = JSON.stringify(compactContext(databaseContext || {}));

  return `You are Veritas, the Gemini-powered AI assistant inside the Rural Electrification Agency monitoring application.

Answer naturally, intelligently, and directly. Do not sound like a deterministic dashboard template. Use reasoning to explain findings, comparisons, implications, risks, and next actions when useful. Keep continuity with the recent conversation.

Use the supplied Veritas context as the source of truth for questions about the REA dashboard, projects, programmes, states, contractors, Field Officers, Consultant Admin QA, inspections, forms, reports, assignments, verification, re-inspection, workflow status, or dashboard metrics. Aggregate portfolio/state/programme/contractor summaries describe the full dataset even when the project-level list is sampled. Never invent an internal figure that is not supported by the supplied context.

For general questions that do not require private Veritas data, answer from your general knowledge. Do not claim live web access. Never expose passwords, secrets, private signatures, device IDs, precise private evidence coordinates, or other sensitive data.

The workflow is authoritative: Field Officer submits -> Consultant Admin approves or requests re-inspection -> REA approves and verifies or rejects for re-inspection. A report is final only when its assignment status is Verified.

CURRENT VERITAS CONTEXT:
${context}

RECENT CONVERSATION:
${conversation || "No prior conversation."}

CURRENT USER QUESTION:
${question}

Respond as Gemini-powered Veritas, with a concise but genuinely reasoned answer.`;
}

function geminiErrorMessage(status, payload) {
  const message = String(payload?.error?.message || "");

  if (status === 400) return "Gemini rejected the request. Please try a more focused question.";
  if (status === 401 || status === 403)
    return "Veritas Gemini authentication failed. Check the GEMINI_API_KEY secret in Cloudflare.";
  if (status === 404)
    return "The configured Gemini model is unavailable. Check GEMINI_MODEL and redeploy.";
  if (status === 429)
    return "Veritas reached the Gemini API rate or quota limit. Please try again after the Gemini quota resets or increase the Gemini API quota.";
  return `Gemini request failed (HTTP ${status}${message ? `: ${message}` : ""}).`;
}

function extractGeminiText(payload) {
  const parts = [];
  for (const candidate of payload?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === "string" && part.text.trim()) parts.push(part.text.trim());
    }
  }
  return parts.join("\n\n").trim();
}

async function veritasResponse(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON request.", build: BUILD_ID }, 400);
  }

  const question = latestQuestion(body?.messages);
  if (!question)
    return json({ error: "Ask Veritas a question.", build: BUILD_ID }, 400);

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "Veritas is configured to use Gemini, but GEMINI_API_KEY is not available in this Cloudflare deployment.",
        provider: "gemini",
        build: BUILD_ID,
      },
      503,
    );
  }

  const model = env.GEMINI_MODEL || "gemini-3.6-flash";
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildInput(body.messages, body.databaseContext) }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1800,
          temperature: 0.45,
        },
      }),
    },
  );

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error(
      JSON.stringify({
        event: "veritas_gemini_error",
        status: upstream.status,
        model,
        build: BUILD_ID,
      }),
    );

    return json(
      {
        error: geminiErrorMessage(upstream.status, payload),
        provider: "gemini",
        model,
        build: BUILD_ID,
      },
      502,
    );
  }

  const answer = extractGeminiText(payload);
  if (!answer) {
    return json(
      {
        error: "Veritas Gemini returned an empty response.",
        provider: "gemini",
        model,
        build: BUILD_ID,
      },
      502,
    );
  }

  return json({
    answer,
    sources: [],
    mode: "gemini",
    provider: "gemini",
    model,
    build: BUILD_ID,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/veritas") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      }
      try {
        return await veritasResponse(request, env);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "veritas_request_failure",
            message: error instanceof Error ? error.message : "Unknown error",
            build: BUILD_ID,
          }),
        );
        return json(
          {
            error: "Veritas Gemini is temporarily unavailable. Please try again.",
            provider: "gemini",
            build: BUILD_ID,
          },
          503,
        );
      }
    }

    if (
      url.pathname === "/api/auth/veritas-session" ||
      url.pathname === "/api/version"
    ) {
      return json({
        ok: true,
        mode: "cloudflare-worker",
        build: BUILD_ID,
        provider: "gemini",
        model: env.GEMINI_MODEL || "gemini-3.6-flash",
        geminiKeyConfigured: Boolean(env.GEMINI_API_KEY),
        geminiPrimary: true,
        localFreeMode: false,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
