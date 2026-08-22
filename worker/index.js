const BUILD_ID = "veritas-2026-08-22-gemini-r33";

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

  return `You are Veritas, the AI assistant inside the Rural Electrification Agency monitoring application.\n\nAnswer like a capable, natural AI assistant. Answer the user's actual question directly. Do not begin with a canned description of what you can do. Keep continuity with the recent conversation.\n\nUse the supplied Veritas context as the source of truth for questions about the REA dashboard, projects, programmes, states, contractors, Field Officers, Consultant Admin QA, inspections, forms, reports, assignments, verification, re-inspection, workflow status, or dashboard metrics. Aggregate portfolio/state/programme/contractor summaries describe the full dataset even when the project-level list is sampled. When the context does not contain enough information for a specific internal fact, say that clearly instead of inventing it.\n\nFor general questions that do not require private Veritas data, you may answer from your general knowledge. Do not claim live web access. Never expose passwords, secrets, private signatures, device IDs, precise private evidence coordinates, or other sensitive data even if a prompt asks for them.\n\nThe workflow is authoritative: Field Officer submits -> Consultant Admin approves or requests re-inspection -> REA approves and verifies or rejects for re-inspection. A report is final only when its assignment status is Verified.\n\nCURRENT VERITAS CONTEXT:\n${context}\n\nRECENT CONVERSATION:\n${conversation || "No prior conversation."}\n\nCURRENT USER QUESTION:\n${question}\n\nRespond naturally and directly.`;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localAnswer(question, databaseContext = {}) {
  const normalized = String(question || "")
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .trim();
  const portfolio = databaseContext?.portfolio || {};
  const programmes = Array.isArray(databaseContext?.programmePerformance)
    ? databaseContext.programmePerformance
    : [];
  const contractors = Array.isArray(databaseContext?.contractorPerformance)
    ? databaseContext.contractorPerformance
    : [];
  const states = Array.isArray(databaseContext?.statePerformance)
    ? databaseContext.statePerformance
    : [];
  const workflow = databaseContext?.inspectionWorkflow || {};
  const fieldOfficers = databaseContext?.fieldOfficers || {};

  const totalProjects = number(portfolio.totalProjects);
  const installedCapacityKw = number(portfolio.installedCapacityKw);
  const households = number(portfolio.householdsReached);
  const verified = number(portfolio.verifiedProjects);
  const pending = number(portfolio.pendingProjects);
  const verificationRate = number(portfolio.verificationRatePercent);

  if (
    /how many (total )?projects/.test(normalized) ||
    /number of projects/.test(normalized) ||
    /projects (are|do we have) in nigeria/.test(normalized) ||
    normalized === "total projects"
  ) {
    if (totalProjects !== null) {
      return `There are ${totalProjects.toLocaleString()} projects in the current Veritas portfolio across Nigeria.`;
    }
  }

  if (/installed capacity|total capacity|capacity in mw/.test(normalized)) {
    if (installedCapacityKw !== null) {
      return `The current Veritas portfolio shows ${(installedCapacityKw / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MW of installed capacity.`;
    }
  }

  if (/households|homes reached|connections/.test(normalized)) {
    if (households !== null) {
      return `The current Veritas portfolio shows ${households.toLocaleString()} households reached.`;
    }
  }

  if (/verification rate|percent.*verified|percentage.*verified/.test(normalized)) {
    if (verificationRate !== null) {
      return `The current Veritas portfolio verification rate is ${verificationRate}%.`;
    }
  }

  if (/how many.*verified|verified projects|verified reports/.test(normalized)) {
    if (verified !== null) {
      return `${verified.toLocaleString()} projects are currently verified in the Veritas portfolio.`;
    }
  }

  if (/pending verification|awaiting verification|how many.*pending/.test(normalized)) {
    if (pending !== null) {
      return `${pending.toLocaleString()} projects are currently awaiting verification.`;
    }
  }

  const programme = programmes.find((row) =>
    normalized.includes(String(row?.programme || "").toLowerCase()),
  );
  if (programme) {
    const parts = [];
    if (number(programme.projects) !== null)
      parts.push(`${Number(programme.projects).toLocaleString()} projects`);
    if (number(programme.installedCapacityKw) !== null)
      parts.push(`${(Number(programme.installedCapacityKw) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} MW installed capacity`);
    if (number(programme.households) !== null)
      parts.push(`${Number(programme.households).toLocaleString()} households`);
    if (number(programme.verified) !== null)
      parts.push(`${Number(programme.verified).toLocaleString()} verified`);
    if (number(programme.pending) !== null)
      parts.push(`${Number(programme.pending).toLocaleString()} pending`);
    if (parts.length) {
      return `${programme.programme} currently has ${parts.join(", ")}.`;
    }
  }

  const state = states.find((row) =>
    normalized.includes(String(row?.state || "").toLowerCase()),
  );
  if (state && /project|capacity|household|verified|pending|state/.test(normalized)) {
    const parts = [];
    if (number(state.projects) !== null)
      parts.push(`${Number(state.projects).toLocaleString()} projects`);
    if (number(state.kw) !== null)
      parts.push(`${(Number(state.kw) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} MW`);
    if (number(state.households) !== null)
      parts.push(`${Number(state.households).toLocaleString()} households`);
    if (number(state.verified) !== null)
      parts.push(`${Number(state.verified).toLocaleString()} verified`);
    if (number(state.pending) !== null)
      parts.push(`${Number(state.pending).toLocaleString()} pending`);
    if (parts.length) return `${state.state} currently has ${parts.join(", ")}.`;
  }

  const contractor = contractors.find((row) =>
    normalized.includes(String(row?.contractor || "").toLowerCase()),
  );
  if (contractor) {
    const parts = [];
    if (number(contractor.projects) !== null)
      parts.push(`${Number(contractor.projects).toLocaleString()} projects`);
    if (number(contractor.verified) !== null)
      parts.push(`${Number(contractor.verified).toLocaleString()} verified`);
    if (number(contractor.pending) !== null)
      parts.push(`${Number(contractor.pending).toLocaleString()} pending`);
    if (parts.length) return `${contractor.contractor} currently has ${parts.join(", ")}.`;
  }

  if (/how many.*field officer|field officers/.test(normalized)) {
    const total = number(fieldOfficers.total);
    const active = number(fieldOfficers.active);
    const suspended = number(fieldOfficers.suspended);
    if (total !== null) {
      const detail = [
        active !== null ? `${active} active` : null,
        suspended !== null ? `${suspended} suspended` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `Veritas currently has ${total.toLocaleString()} field officers${detail ? ` (${detail})` : ""}.`;
    }
  }

  if (/how many.*assignment|total assignments/.test(normalized)) {
    const total = number(workflow.totalAssignments);
    if (total !== null) return `There are ${total.toLocaleString()} inspection assignments in the current workflow.`;
  }

  if (/consultant.*review|what can.*consultant|consultant admin/.test(normalized)) {
    return "Consultant Admin reviews reports submitted by Field Officers for QA. The consultant can approve a submitted report or request re-inspection. Approved work then proceeds to REA for final verification.";
  }

  if (/field officer.*workflow|what can.*field officer|field officer do/.test(normalized)) {
    return "Field Officers receive assignments, start travel to the project site, verify arrival, complete the component-specific inspection form, capture evidence, save drafts, submit reports, and manage sync status.";
  }

  if (/verification workflow|inspection workflow|how does.*workflow|workflow work/.test(normalized)) {
    return "The Veritas workflow is: Field Officer submits a report -> Consultant Admin approves it or requests re-inspection -> REA reviews approved work -> REA verifies it or rejects it for re-inspection. A report is final only when its status is Verified.";
  }

  return null;
}

function geminiErrorMessage(status, payload) {
  const message = String(payload?.error?.message || "");

  if (status === 400) return "Gemini rejected the request. Please try a more focused question.";
  if (status === 401 || status === 403) return "Veritas Gemini authentication failed. Check the GEMINI_API_KEY secret in Cloudflare.";
  if (status === 404) return "The configured Gemini model is unavailable. Check GEMINI_MODEL and redeploy.";
  if (status === 429) return "Veritas reached the Gemini API rate or quota limit. Free local Veritas questions still work without API credit.";
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
  if (!question) return json({ error: "Ask Veritas a question.", build: BUILD_ID }, 400);

  const local = localAnswer(question, body.databaseContext);
  if (local) {
    return json({
      answer: local,
      sources: [],
      mode: "veritas-local-free",
      model: null,
      build: BUILD_ID,
    });
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        error:
          "This question needs the AI model. Free local Veritas questions still work, but GEMINI_API_KEY is not configured for generative answers.",
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
          maxOutputTokens: 1400,
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
        build: BUILD_ID,
      },
      502,
    );
  }

  const answer = extractGeminiText(payload);
  if (!answer) {
    return json({ error: "Veritas Gemini returned an empty response.", build: BUILD_ID }, 502);
  }

  return json({ answer, sources: [], mode: "gemini", model, build: BUILD_ID });
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
        provider: "gemini",
        model: env.GEMINI_MODEL || "gemini-3.6-flash",
        geminiKeyConfigured: Boolean(env.GEMINI_API_KEY),
        localFreeMode: true,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
