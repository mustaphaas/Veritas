const BUILD_ID = "veritas-2026-08-22-r30";

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

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
      }
    }
  }
  return parts.join("\n").trim();
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

  return `You are Veritas, the AI assistant inside the Rural Electrification Agency monitoring application.

Answer like a capable, natural AI assistant. Answer the user's actual question directly. Do not begin with a canned description of what you can do. Do not repeat portfolio headline figures unless they are relevant to the question. Keep continuity with the recent conversation.

Use the supplied Veritas context as the source of truth for questions about the REA dashboard, projects, programmes, states, contractors, Field Officers, Consultant Admin QA, inspections, forms, reports, assignments, verification, re-inspection, workflow status, or dashboard metrics. Aggregate portfolio/state/programme/contractor summaries describe the full dataset even when the project-level list is sampled. When the context does not contain enough information for a specific internal fact, say that clearly instead of inventing it.

For general questions that do not require private Veritas data, you may answer from your general knowledge. Do not claim live web access. Never expose passwords, secrets, private signatures, device IDs, precise private evidence coordinates, or other sensitive data even if a prompt asks for them.

The workflow is authoritative: Field Officer submits -> Consultant Admin approves or requests re-inspection -> REA approves and verifies or rejects for re-inspection. A report is final only when its assignment status is Verified.

CURRENT VERITAS CONTEXT:
${context}

RECENT CONVERSATION:
${conversation || "No prior conversation."}

CURRENT USER QUESTION:
${question}

Respond naturally and directly.`;
}

function internalFallback(question, databaseContext = {}) {
  const normalized = String(question || "").toLowerCase();
  const portfolio = databaseContext?.portfolio || {};

  if (
    /how many (total )?projects/.test(normalized) ||
    /number of projects/.test(normalized) ||
    /projects (are|do we have) in nigeria/.test(normalized)
  ) {
    const total = Number(portfolio.totalProjects);
    if (Number.isFinite(total)) {
      return `There are ${total.toLocaleString()} projects in the current Veritas portfolio across Nigeria.`;
    }
  }

  if (/installed capacity|total capacity/.test(normalized)) {
    const kw = Number(portfolio.installedCapacityKw);
    if (Number.isFinite(kw)) {
      return `The current Veritas portfolio shows ${(kw / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} MW of installed capacity.`;
    }
  }

  if (/verification rate|percent.*verified|percentage.*verified/.test(normalized)) {
    const rate = Number(portfolio.verificationRatePercent);
    if (Number.isFinite(rate)) {
      return `The current Veritas portfolio verification rate is ${rate}%.`;
    }
  }

  return null;
}

function upstreamErrorMessage(status, payload) {
  const code = payload?.error?.code || "";
  const type = payload?.error?.type || "";

  if (status === 401) {
    return "Veritas AI authentication failed. Check the OPENAI_API_KEY secret in Cloudflare.";
  }
  if (status === 403) {
    return "Veritas AI does not have permission to use the configured OpenAI project or model.";
  }
  if (status === 404 || code === "model_not_found") {
    return "The configured OpenAI model is unavailable to this project. Set OPENAI_MODEL to gpt-5.6 and redeploy.";
  }
  if (status === 429 || code === "insufficient_quota") {
    return "Veritas AI reached an OpenAI usage or billing limit. Check the API project's billing and usage limits.";
  }
  if (status === 400 && (code === "context_length_exceeded" || type === "invalid_request_error")) {
    return "Veritas sent too much context to OpenAI. The request context has now been reduced; please retry after the latest deployment.";
  }
  return `Veritas AI upstream request failed (HTTP ${status}${code ? `, ${code}` : type ? `, ${type}` : ""}).`;
}

async function veritasResponse(request, env) {
  if (!env.OPENAI_API_KEY) {
    return json(
      {
        error:
          "Veritas AI is not configured yet. Add OPENAI_API_KEY as a Cloudflare Worker secret.",
        build: BUILD_ID,
      },
      503,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON request.", build: BUILD_ID }, 400);
  }

  const question = latestQuestion(body?.messages);
  if (!question) return json({ error: "Ask Veritas a question.", build: BUILD_ID }, 400);

  const model = env.OPENAI_MODEL || "gpt-5.6";
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: buildInput(body.messages, body.databaseContext),
      max_output_tokens: 1400,
    }),
  });

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error(
      JSON.stringify({
        event: "veritas_openai_error",
        status: upstream.status,
        type: payload?.error?.type,
        code: payload?.error?.code,
        model,
        build: BUILD_ID,
      }),
    );

    const fallback = internalFallback(question, body.databaseContext);
    if (fallback) {
      return json({
        answer: fallback,
        sources: [],
        mode: "veritas-context-fallback",
        model,
        build: BUILD_ID,
        upstreamStatus: upstream.status,
      });
    }

    return json(
      {
        error: upstreamErrorMessage(upstream.status, payload),
        build: BUILD_ID,
      },
      502,
    );
  }

  const answer = extractOutputText(payload);
  if (!answer) {
    const fallback = internalFallback(question, body.databaseContext);
    if (fallback) {
      return json({
        answer: fallback,
        sources: [],
        mode: "veritas-context-fallback",
        model,
        build: BUILD_ID,
      });
    }
    return json({ error: "Veritas AI returned an empty response.", build: BUILD_ID }, 502);
  }

  return json({ answer, sources: [], mode: "openai", model, build: BUILD_ID });
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
          { error: "Veritas AI is temporarily unavailable. Please try again.", build: BUILD_ID },
          503,
        );
      }
    }

    if (url.pathname === "/api/auth/veritas-session" || url.pathname === "/api/version") {
      return json({
        ok: true,
        mode: "cloudflare-worker",
        build: BUILD_ID,
        model: env.OPENAI_MODEL || "gpt-5.6",
        openaiKeyConfigured: Boolean(env.OPENAI_API_KEY),
      });
    }

    return env.ASSETS.fetch(request);
  },
};
