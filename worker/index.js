import { handleFieldApi } from "./field-api.js";

const BUILD_ID = "veritas-2026-09-11-live-d1-ai-r1";

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

  return `You are Veritas, the Gemini-powered AI assistant inside the Rural Electrification Agency monitoring application.

Answer naturally, intelligently, and directly. Use reasoning to explain findings, comparisons, implications, risks, and next actions when useful.

The CURRENT VERITAS CONTEXT below is generated directly from the live Cloudflare D1 production database for this request and is authoritative for internal Veritas questions. Never substitute browser state or invent an internal figure. Aggregate portfolio/state/programme/contractor/consultant summaries cover the full live dataset even when the project list is sampled.

For general questions that do not require private Veritas data, answer from your general knowledge. Never expose passwords, password hashes, salts, session tokens, personal phone numbers, email addresses, signatures, device IDs, or precise private evidence coordinates.

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
  if (status === 401 || status === 403) return "Veritas Gemini authentication failed. Check the GEMINI_API_KEY secret in Cloudflare.";
  if (status === 404) return "The configured Gemini model is unavailable. Check GEMINI_MODEL and redeploy.";
  if (status === 429) return "Veritas reached the Gemini API rate or quota limit. Please try again after the Gemini quota resets or increase the Gemini API quota.";
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
  if (!env.GEMINI_API_KEY) {
    return json({
      error: "Veritas is configured to use Gemini, but GEMINI_API_KEY is not available in this Cloudflare deployment.",
      provider: "gemini",
      build: BUILD_ID,
    }, 503);
  }

  const databaseContext = await liveDatabaseContext(env);
  const model = env.GEMINI_MODEL || "gemini-3.6-flash";
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildInput(body.messages, databaseContext) }] }],
        generationConfig: { maxOutputTokens: 1800, temperature: 0.45 },
      }),
    },
  );

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error(JSON.stringify({ event: "veritas_gemini_error", status: upstream.status, model, build: BUILD_ID }));
    return json({ error: geminiErrorMessage(upstream.status, payload), provider: "gemini", model, build: BUILD_ID }, 502);
  }

  const answer = extractGeminiText(payload);
  if (!answer) return json({ error: "Veritas Gemini returned an empty response.", provider: "gemini", model, build: BUILD_ID }, 502);

  return json({ answer, sources: [], mode: "gemini-live-d1", provider: "gemini", model, build: BUILD_ID });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
        return json({ error: "Veritas Gemini is temporarily unavailable. Please try again.", provider: "gemini", build: BUILD_ID }, 503);
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
        geminiPrimary: true,
        aiDatabaseSource: "cloudflare-d1-live",
        localFreeMode: false,
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
