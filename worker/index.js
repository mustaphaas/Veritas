import { handleFieldApi } from "./field-api.js";
import { analyticsCatalog, analyticsAnswerPrompt, executeAnalyticsPlan, parsePlannerJson, plannerPrompt, validateAnalyticsPlan } from "./analytics.js";

const BUILD_ID = "veritas-2026-09-11-safe-dynamic-analytics-r1";
const encoder = new TextEncoder();

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Veritas-Build": BUILD_ID,
    },
  });

const hex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function digest(value) {
  return hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));
}

async function authenticatedDatabaseUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !env.DB) return null;
  const tokenHash = await digest(bearer);
  return env.DB.prepare(`SELECT u.id,u.name,u.role,u.consultant_firm AS consultantFirm
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`)
    .bind(tokenHash, new Date().toISOString())
    .first();
}

async function consultantFieldOfficerResponse(request, env) {
  const user = await authenticatedDatabaseUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (user.role !== "consultant_admin" && user.role !== "rea_admin") {
    return json({ error: "Consultant or REA access required." }, 403);
  }

  let consultantFirm = user.consultantFirm;
  if (user.role === "rea_admin") {
    consultantFirm = new URL(request.url).searchParams.get("consultantFirm") || consultantFirm;
  }
  if (!consultantFirm) return json({ error: "Consultant firm is required." }, 400);

  const result = await env.DB.prepare(`SELECT id,name,email,phone,consultant_firm AS consultantFirm,status,created_at AS createdAt
    FROM users
    WHERE role='field_officer' AND consultant_firm=?
    ORDER BY name COLLATE NOCASE`)
    .bind(consultantFirm)
    .all();

  return json({
    consultantFirm,
    fieldOfficers: (result.results || []).map((officer) => ({
      id: officer.id,
      name: officer.name,
      email: officer.email || "",
      phone: officer.phone || "",
      consultantFirm: officer.consultantFirm,
      status: String(officer.status).toLowerCase() === "active" ? "Active" : "Suspended",
      createdAt: officer.createdAt,
    })),
    serverTime: new Date().toISOString(),
  });
}

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
    context.projectRecordNote = `Project-level context contains the first 120 of ${projects.length} live database records. Portfolio and aggregate summaries cover the full dataset.`;
  }
  return context;
}

function aggregateBy(rows, key, mapper) {
  const groups = new Map();
  for (const row of rows) {
    const label = row[key] ?? "Unknown";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  return [...groups.entries()].map(([label, group]) => mapper(label, group));
}

async function liveDatabaseContext(env) {
  if (!env.DB) throw new Error("D1 database binding is unavailable.");

  const [projectResult, userResult, assignmentResult, consultantResult, evidenceResult, auditResult] = await Promise.all([
    env.DB.prepare(`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
      reporting_month AS reportingMonth,portfolio_status AS status,installed_capacity_kw AS installedCapacityKw,
      households,verified,data_source AS dataSource,updated_at AS updatedAt
      FROM projects ORDER BY state,name`).all(),
    env.DB.prepare(`SELECT id,name,role,consultant_firm AS consultantFirm,status,created_at AS createdAt
      FROM users ORDER BY role,name`).all(),
    env.DB.prepare(`SELECT a.id,a.status,a.due_date AS dueDate,a.submitted_at AS submittedAt,a.approved_at AS approvedAt,
      a.verified_at AS verifiedAt,a.updated_at AS updatedAt,p.name AS projectName,p.programme,p.component,p.contractor,
      p.consultant_firm AS consultantFirm,p.state,p.lga,p.community,u.name AS officer
      FROM assignments a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.officer_id
      ORDER BY a.updated_at DESC`).all(),
    env.DB.prepare(`SELECT id,firm_name AS firmName,admin_name AS adminName,regions_json AS regionsJson,states_json AS statesJson,
      status,engagement_ref AS engagementRef,scope_note AS scopeNote,engagement_start AS engagementStart,engagement_end AS engagementEnd
      FROM consultants ORDER BY firm_name`).all(),
    env.DB.prepare(`SELECT assignment_id AS assignmentId,COUNT(*) AS count FROM evidence GROUP BY assignment_id`).all(),
    env.DB.prepare(`SELECT action,COUNT(*) AS count FROM audit_events GROUP BY action ORDER BY count DESC`).all(),
  ]);

  const projects = projectResult.results || [];
  const users = userResult.results || [];
  const assignments = assignmentResult.results || [];
  const evidenceCounts = Object.fromEntries((evidenceResult.results || []).map((row) => [row.assignmentId, Number(row.count || 0)]));
  const fieldOfficers = users.filter((user) => user.role === "field_officer");
  const consultantAdmins = users.filter((user) => user.role === "consultant_admin");
  const reaAdmins = users.filter((user) => user.role === "rea_admin");
  const verifiedProjects = projects.filter((project) => Number(project.verified) === 1).length;
  const installedCapacityKw = projects.reduce((sum, project) => sum + Number(project.installedCapacityKw || 0), 0);
  const households = projects.reduce((sum, project) => sum + Number(project.households || 0), 0);

  const componentStateProgramme = [...new Map(
    projects.map((project) => {
      const key = `${project.component || "Unknown"}||${project.state || "Unknown"}||${project.programme || "Unknown"}`;
      return [key, {
        component: project.component || "Unknown",
        state: project.state || "Unknown",
        programme: project.programme || "Unknown",
      }];
    }),
  ).values()].map((row) => ({
    ...row,
    projects: projects.filter((project) =>
      (project.component || "Unknown") === row.component &&
      (project.state || "Unknown") === row.state &&
      (project.programme || "Unknown") === row.programme,
    ).length,
  }));

  const projectSummary = (label, group, labelKey) => ({
    [labelKey]: label,
    projects: group.length,
    installedCapacityKw: group.reduce((sum, project) => sum + Number(project.installedCapacityKw || 0), 0),
    households: group.reduce((sum, project) => sum + Number(project.households || 0), 0),
    verified: group.filter((project) => Number(project.verified) === 1).length,
    pending: group.filter((project) => Number(project.verified) !== 1).length,
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "Cloudflare D1 live database",
    dataScope: "Current Veritas production database snapshot. Browser localStorage is not authoritative for this AI response.",
    privacyScope: "Passwords, hashes, salts, session tokens, phone numbers, email addresses, signatures, device IDs and precise coordinates are excluded.",
    portfolio: {
      totalProjects: projects.length,
      installedCapacityKw,
      householdsReached: households,
      verifiedProjects,
      pendingProjects: projects.length - verifiedProjects,
      verificationRatePercent: projects.length ? Math.round((verifiedProjects / projects.length) * 100) : 0,
    },
    programmePerformance: aggregateBy(projects, "programme", (label, group) => projectSummary(label, group, "programme")),
    componentPerformance: aggregateBy(projects, "component", (label, group) => projectSummary(label, group, "component")),
    componentStateProgramme,
    statePerformance: aggregateBy(projects, "state", (label, group) => projectSummary(label, group, "state")),
    contractorPerformance: aggregateBy(projects, "contractor", (label, group) => projectSummary(label, group, "contractor")),
    consultantPerformance: aggregateBy(projects, "consultantFirm", (label, group) => projectSummary(label, group, "consultantFirm")),
    consultants: (consultantResult.results || []).map((row) => ({
      id: row.id,
      firmName: row.firmName,
      adminName: row.adminName,
      regions: JSON.parse(row.regionsJson || "[]"),
      states: JSON.parse(row.statesJson || "[]"),
      status: row.status,
      engagementRef: row.engagementRef,
      scopeNote: row.scopeNote,
      engagementStart: row.engagementStart,
      engagementEnd: row.engagementEnd,
    })),
    users: {
      fieldOfficers: fieldOfficers.map(({ id, name, consultantFirm, status, createdAt }) => ({ id, name, consultantFirm, status, createdAt })),
      consultantAdmins: consultantAdmins.map(({ id, name, consultantFirm, status, createdAt }) => ({ id, name, consultantFirm, status, createdAt })),
      reaAdmins: reaAdmins.map(({ id, name, status, createdAt }) => ({ id, name, status, createdAt })),
    },
    assignments: assignments.map((assignment) => ({ ...assignment, evidenceCount: evidenceCounts[assignment.id] || 0 })),
    assignmentStatusCounts: Object.fromEntries(
      [...new Set(assignments.map((assignment) => assignment.status))].map((status) => [
        status,
        assignments.filter((assignment) => assignment.status === status).length,
      ]),
    ),
    auditSummary: auditResult.results || [],
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      programme: project.programme,
      component: project.component,
      contractor: project.contractor,
      consultantFirm: project.consultantFirm,
      state: project.state,
      lga: project.lga,
      community: project.community,
      reportingMonth: project.reportingMonth,
      status: project.status,
      installedCapacityKw: Number(project.installedCapacityKw || 0),
      households: Number(project.households || 0),
      verified: Number(project.verified) === 1,
      dataSource: project.dataSource,
      updatedAt: project.updatedAt,
    })),
  };
}

function buildInput(messages, databaseContext) {
  const conversation = compactConversation(messages);
  const question = latestQuestion(messages);
  const context = JSON.stringify(compactContext(databaseContext || {}));

  return `You are Veritas, the AI assistant inside the Rural Electrification Agency monitoring application.

Answer naturally, intelligently, and directly. Use reasoning to explain findings, comparisons, implications, risks, and next actions when useful.

The CURRENT VERITAS CONTEXT below is generated directly from the live Cloudflare D1 production database for this request and is authoritative for internal Veritas questions. Never substitute browser state or invent an internal figure. Aggregate portfolio/state/programme/component/contractor/consultant summaries and componentStateProgramme cross-tabs cover the full live dataset even when the project list is sampled. For counts, totals, percentages, rankings, and comparisons, use the exact full-database aggregates whenever available. For questions that combine component with state and/or programme, use componentStateProgramme rather than the sampled project list. Never estimate or extrapolate a portfolio-wide figure from the sampled project list. If an exact aggregate is unavailable, say so rather than estimating from the sample.

For general questions that do not require private Veritas data, answer from your general knowledge. Never expose passwords, password hashes, salts, session tokens, personal phone numbers, email addresses, signatures, device IDs, or precise private evidence coordinates.

The workflow is authoritative: Field Officer submits -> Consultant Admin approves or requests re-inspection -> REA approves and verifies or rejects for re-inspection. A report is final only when its assignment status is Verified.

PROJECT PRIORITY ANALYSIS RULES:
When identifying states that may need more projects, do not rank them only by installed MW or household reach. Treat installed capacity and household reach as portfolio indicators, not proof of investment need. Where available, consider unelectrified population, electricity access rate, population or household base, existing grid coverage and grid proximity, current project pipeline, project density, installed MW per capita or per household, demand and productive-use potential, existing generation capacity, and the rural electrification gap. If some of these variables are not available in the live Veritas database, say so explicitly and describe the result as a portfolio-based priority assessment rather than a definitive investment recommendation. Use wording such as: "Based on current Veritas portfolio data, these states are priority candidates for further assessment." Do not state that a state definitely needs more projects unless the available evidence supports that conclusion. Distinguish clearly between "lowest recorded capacity" and "highest actual electrification need." Do not recommend a specific programme, technology, project size, or capital allocation solely because a state has low recorded MW or household reach unless supporting evidence is available.

CURRENT VERITAS CONTEXT:
${context}

RECENT CONVERSATION:
${conversation || "No prior conversation."}

CURRENT USER QUESTION:
${question}

Respond as Veritas, with a concise but genuinely reasoned answer.`;
}

function publicVeritasError(status) {
  if (status === 400) return "Veritas could not process that request. Please try a more focused question.";
  if (status === 401 || status === 403) return "Veritas AI service is currently unavailable.";
  if (status === 404) return "Veritas AI service is currently unavailable.";
  if (status === 429) return "Veritas is experiencing high demand. Please try again shortly.";
  if (status === 503) return "Veritas is temporarily unavailable due to high demand. Please try again shortly.";
  return "Veritas is temporarily unavailable. Please try again shortly.";
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

function extractOpenRouterText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }
  return "";
}

function isLikelyAnalyticsQuestion(question) {
  return /\b(how many|count|total|break\s*down|breakdown|compare|rank|highest|lowest|average|sum|by state|by programme|by program|by component|by contractor|by consultant|by officer|verified|pending|verification|capacity|households?|assignments?|projects?)\b/i.test(String(question || ""));
}

async function analyticsPlannerResponse(question, env) {
  const prompt = plannerPrompt(question, analyticsCatalog());

  if (env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://veritas.mustaphaaliyu236.workers.dev",
          "X-Title": "Veritas",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || "google/gemini-3.8-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 700,
          temperature: 0,
          provider: { allow_fallbacks: true, sort: "throughput" },
        }),
        signal: AbortSignal.timeout(12000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const text = extractOpenRouterText(payload);
        if (text) return text;
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "veritas_analytics_planner_openrouter_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
    }
  }

  if (env.GEMINI_API_KEY) {
    try {
      const model = env.GEMINI_MODEL || "gemini-3.6-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 700, temperature: 0 },
          }),
          signal: AbortSignal.timeout(12000),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return extractGeminiText(payload);
    } catch (error) {
      console.error(JSON.stringify({ event: "veritas_analytics_planner_gemini_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
    }
  }

  return "";
}

function deterministicAnalyticsAnswer(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (!rows.length) return "No matching records were found in the current Veritas production database.";
  const lines = rows.map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value ?? "—"}`).join(" | "));
  const limitNote = result.truncated ? "\n\nThe result reached the configured row limit, so it may not include every matching group." : "";
  return `Authoritative Veritas production database result (${rows.length} row${rows.length === 1 ? "" : "s"}):\n\n${lines.join("\n")}${limitNote}`;
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
  if (!env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY) {
    console.error(JSON.stringify({ event: "veritas_provider_unconfigured", provider: "veritas-ai", build: BUILD_ID }));
    return json({ error: "Veritas AI service is currently unavailable.", build: BUILD_ID }, 503);
  }

  let analyticsResult = null;
  if (isLikelyAnalyticsQuestion(question)) {
    const plannerText = await analyticsPlannerResponse(question, env);
    const rawPlan = parsePlannerJson(plannerText);
    const plan = validateAnalyticsPlan(rawPlan);
    if (plan) {
      try {
        analyticsResult = await executeAnalyticsPlan(env, plan);
      } catch (error) {
        console.error(JSON.stringify({ event: "veritas_analytics_execution_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
      }
    }
  }

  let databaseContext = null;
  let prompt;
  if (analyticsResult) {
    prompt = analyticsAnswerPrompt(question, analyticsResult);
  } else {
    databaseContext = await liveDatabaseContext(env);
    const exactCrossTabAnswer = typeof exactComponentStateProgrammeAnswer === "function" ? exactComponentStateProgrammeAnswer(question, databaseContext) : "";
    if (exactCrossTabAnswer) {
      return json({ answer: exactCrossTabAnswer, sources: [], mode: "veritas-live-d1-exact", build: BUILD_ID });
    }
    prompt = buildInput(body.messages, databaseContext);
  }
  let upstream;
  let payload = {};
  let provider = "gemini";
  let model = env.GEMINI_MODEL || "gemini-3.6-flash";
  let answer = "";

  if (env.OPENROUTER_API_KEY) {
    provider = "openrouter";
    model = env.OPENROUTER_MODEL || "google/gemini-3.8-flash";
    try {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://veritas.mustaphaaliyu236.workers.dev",
          "X-Title": "Veritas",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 3000,
          temperature: 0.3,
          provider: { allow_fallbacks: true, sort: "throughput" },
        }),
        signal: AbortSignal.timeout(25000),
      });
      payload = await upstream.json().catch(() => ({}));
      if (upstream.ok) answer = extractOpenRouterText(payload);
    } catch (error) {
      console.error(JSON.stringify({
        event: "veritas_openrouter_timeout_or_network_error",
        message: error instanceof Error ? error.message : "Unknown error",
        build: BUILD_ID,
      }));
    }

    if (!upstream?.ok || !answer) {
      console.error(JSON.stringify({
        event: "veritas_openrouter_fallback",
        status: upstream?.status || 0,
        model,
        upstreamMessage: String(payload?.error?.message || payload?.error || ""),
        build: BUILD_ID,
      }));
    }
  }

  if (!answer && env.GEMINI_API_KEY) {
    provider = "gemini";
    model = env.GEMINI_MODEL || "gemini-3.6-flash";
    try {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 3000, temperature: 0.45 },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      payload = await upstream.json().catch(() => ({}));
      if (upstream.ok) answer = extractGeminiText(payload);
    } catch (error) {
      console.error(JSON.stringify({
        event: "veritas_direct_gemini_timeout_or_network_error",
        message: error instanceof Error ? error.message : "Unknown error",
        build: BUILD_ID,
      }));
    }
  }

  if (!answer && analyticsResult) {
    answer = deterministicAnalyticsAnswer(analyticsResult);
  }

  if (!answer) {
    console.error(JSON.stringify({
      event: "veritas_all_ai_routes_failed",
      provider,
      status: upstream?.status || 0,
      model,
      upstreamMessage: String(payload?.error?.message || payload?.error || ""),
      build: BUILD_ID,
    }));
    return json({ error: publicVeritasError(upstream?.status || 503), build: BUILD_ID }, upstream?.status === 429 ? 429 : 503);
  }
  if (!answer) {
    console.error(JSON.stringify({ event: "veritas_empty_provider_response", provider: "gemini", model, build: BUILD_ID }));
    return json({ error: "Veritas could not complete that response. Please try again shortly.", build: BUILD_ID }, 503);
  }

  return json({ answer, sources: [], mode: analyticsResult ? "veritas-safe-analytics" : "veritas-live-d1", build: BUILD_ID });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/consultant/field-officers") {
      if (request.method !== "GET") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await consultantFieldOfficerResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({ event: "consultant_roster_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));
        return json({ error: "Unable to load the consultant field-officer roster." }, 503);
      }
    }

    const fieldResponse = await handleFieldApi(request, env);
    if (fieldResponse) return fieldResponse;

    if (url.pathname === "/api/veritas") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await veritasResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "veritas_request_failure",
          message: error instanceof Error ? error.message : "Unknown error",
          build: BUILD_ID,
        }));
        return json({ error: "Veritas is temporarily unavailable. Please try again shortly.", build: BUILD_ID }, 503);
      }
    }

    if (url.pathname === "/api/auth/veritas-session" || url.pathname === "/api/version") {
      return json({
        ok: true,
        mode: "cloudflare-worker",
        build: BUILD_ID,
        aiService: "veritas",
        aiDatabaseSource: "cloudflare-d1-live",
        fieldStorageConfigured: Boolean(env.DB),
        evidenceStorageConfigured: Boolean(env.EVIDENCE),
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      const headers = new Headers(assetResponse.headers);
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
      headers.set("X-Veritas-Build", BUILD_ID);
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }
    return assetResponse;
  },
};
