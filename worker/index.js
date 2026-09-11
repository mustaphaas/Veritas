import { handleFieldApi } from "./field-api.js";
import { analyticsCatalog, analyticsAnswerPrompt, executeAnalyticsPlan, parsePlannerJson, plannerPrompt, validateAnalyticsPlan } from "./analytics.js";

const BUILD_ID = "veritas-2026-09-11-final-answer-contract-r2";
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

function compactContext(databaseContext = {}, question = "") {
  const context = { ...databaseContext };
  const q = String(question || "").toLowerCase();

  const needsProjects = /\b(project name|which projects?|list projects?|project id|community|lga|specific project)\b/i.test(q);
  const needsAssignments = /\b(assignments?|field officers?|officer|submitted reports?|re-?inspection|due date)\b/i.test(q);
  const needsConsultants = /\b(consultants?|consultant firm|consultant admin)\b/i.test(q);

  if (Array.isArray(context.projects)) {
    if (needsProjects) {
      const total = context.projects.length;
      context.projects = context.projects.slice(0, 40);
      if (total > context.projects.length) context.projectRecordNote = "Showing 40 of " + total + " project records; portfolio aggregates remain complete.";
    } else {
      delete context.projects;
    }
  }

  if (Array.isArray(context.assignments)) {
    if (needsAssignments) {
      const total = context.assignments.length;
      context.assignments = context.assignments.slice(0, 40);
      if (total > context.assignments.length) context.assignmentRecordNote = "Showing 40 of " + total + " assignment records; status aggregates remain complete.";
    } else {
      delete context.assignments;
    }
  }

  if (!needsConsultants) delete context.consultants;
  delete context.componentStateProgramme;

  if (context.users && !/\b(users?|field officers?|consultant admins?|rea admins?)\b/i.test(q)) {
    context.users = {
      fieldOfficerCount: Array.isArray(context.users.fieldOfficers) ? context.users.fieldOfficers.length : 0,
      consultantAdminCount: Array.isArray(context.users.consultantAdmins) ? context.users.consultantAdmins.length : 0,
      reaAdminCount: Array.isArray(context.users.reaAdmins) ? context.users.reaAdmins.length : 0,
    };
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
  const context = JSON.stringify(compactContext(databaseContext || {}, question));

  return `You are Veritas, the AI assistant inside the Rural Electrification Agency monitoring application.

Answer naturally, intelligently, and directly. Use reasoning to explain findings, comparisons, implications, risks, and next actions when useful.

OPENING VOICE STANDARD:
- Start like an experienced REA professional speaking to a colleague, director, or management team. The first sentence should sound assured, informed, and purposeful.
- Lead with the conclusion or strongest confirmed finding. Do not begin with generic setup such as "Based on the data", "According to the information provided", "Here is an analysis", "The data shows", "It appears", "It seems", "As an AI", or similar chatbot language.
- Use confident declarative language when the evidence is clear. Reserve words such as "may", "could", and "warrants review" for interpretation or uncertainty, not for confirmed facts.
- Make the opening persuasive through evidence, not exaggeration. Pair the main conclusion with the most relevant figure or contrast when one is available.
- The opening should feel human and executive-ready, not formulaic. Avoid announcing sections before giving the answer.
- Never use confidence to overstate causation, policy, authority, or facts that the evidence does not establish.

The CURRENT VERITAS CONTEXT below is generated directly from the live Cloudflare D1 production database for this request and is authoritative for internal Veritas questions. Never substitute browser state or invent an internal figure. Authoritative aggregate summaries and multidimensional production analytics cover the full live dataset even when the project list is sampled. For counts, totals, percentages, rankings, and comparisons, use the exact full-database aggregates whenever available. For questions that combine multiple dimensions such as component, state, and programme, use the authoritative full-database aggregate results rather than the sampled project list. Never estimate or extrapolate a portfolio-wide figure from the sampled project list. If an exact aggregate is unavailable, say so rather than estimating from the sample.

For general questions that do not require private Veritas data, answer from your general knowledge. Never expose passwords, password hashes, salts, session tokens, personal phone numbers, email addresses, signatures, device IDs, or precise private evidence coordinates.

The workflow is authoritative: Field Officer submits -> Consultant Admin approves or requests re-inspection -> REA approves and verifies or rejects for re-inspection. A report is final only when its assignment status is Verified.

EVIDENCE AND CAUSALITY RULES:
- Separate confirmed facts from interpretation. A database status, count, date, or missing record does not by itself prove the cause of that condition.
- Never convert correlation, concentration, missing data, a status snapshot, or timing proximity into a causal or operational certainty unless the live Veritas data or an authoritative REA workflow rule explicitly supports it.
- Do not state that a workflow is blocked, frozen, impossible to progress, delayed, inflated, unsupported, without oversight, without capacity, or dependent on a single entity unless the evidence explicitly establishes that claim.
- Do not assume that a named bucket such as "REA Unallocated" is a consultant, contractor, or responsible delivery entity unless the data model explicitly identifies it that way. Treat it as an allocation/status category if that is all the context establishes.
- Do not assume that a pending consultant activation means a region lacks active oversight, or that reassignment is feasible, unless current assignments, coverage and authority data prove it.
- Do not assume that zero visible evidence records means evidence does not exist elsewhere or that submission is impossible. Say that no evidence records are visible in the available Veritas dataset and recommend checking field activity, evidence capture, sync or recording status as appropriate.
- When the evidence supports concern but not causation, use disciplined wording such as "may indicate", "creates a management risk", "warrants review", or "the available data does not establish the cause".
- Recommendations must follow from confirmed findings and should avoid asserting authority, feasibility, resource availability or mandatory workflow conditions that are not explicitly present in the context.

NUMERIC POLICY AND RECOMMENDATION RULES:
- Never invent a target, threshold, deadline, SLA, cutoff, quota, percentage, time window, minimum evidence count, workload share, or escalation interval.
- A numeric management target may be stated only when that exact target is present in the authoritative Veritas context, explicitly supplied by the user, or identified as an established REA rule in the available source material.
- Do not turn an observed database value into a recommended threshold. For example, do not recommend "raise verification above 75%", "reduce unallocated projects below 40%", "escalate within 48 hours", or any similar number unless that number is explicitly supported.
- You may calculate and report descriptive values from authoritative data, including counts, totals, percentages, rates, differences and rankings, but clearly treat them as current observations rather than policy targets.
- When a management threshold would be useful but none is supplied, say "set a management-approved target", "prioritise approaching due dates", or recommend that management define the threshold; do not choose the number yourself.
- Recommendations must be traceable to confirmed findings. Do not claim an operational constraint, blocked workflow, required evidence minimum, resource availability, consultant capacity, or reassignment feasibility unless the context supports it.

RESPONSE QUALITY STANDARD:
- Answer the management question immediately in the opening one or two sentences. Lead with the strongest finding supported by the data, not with a generic introduction.
- For analytical or management questions, use this order when useful: key finding -> what the data confirms -> what it may mean -> what management should review or do next.
- Keep confirmed facts separate from interpretation. Use only the few figures needed to support the conclusion; do not dump long raw record lists unless the user explicitly asks for them.
- Rank issues by materiality when the user asks for priorities, risks, pressure points, or management attention.
- Recommendations must be specific to the observed issue. Prefer practical checks such as reviewing assigned records, validating field progress, checking sync or submission status, reviewing consultant coverage, or monitoring downstream review capacity when those checks are relevant.
- Avoid generic filler, repeated caveats, and long lists of hypothetical causes. If the cause is unknown, name only the most plausible categories that the available data makes relevant and state that the cause is not established.
- Use concise REA operational language and sound like an experienced programme and monitoring professional briefing management.
- Do not say "Based on the data provided", "As an AI", or expose implementation details.
- If a question spans multiple subject areas and the available evidence fully supports only one of them, state what is confirmed and what requires a separate review rather than pretending the answer is comprehensive.
- A short bottom line may be used when it adds a clear management takeaway; do not repeat the opening conclusion.

PROJECT PRIORITY ANALYSIS RULES:
When identifying states that may need more projects, do not rank them only by installed MW or household reach. Treat installed capacity and household reach as portfolio indicators, not proof of investment need. Where available, consider unelectrified population, electricity access rate, population or household base, existing grid coverage and grid proximity, current project pipeline, project density, installed MW per capita or per household, demand and productive-use potential, existing generation capacity, and the rural electrification gap. If some of these variables are not available in the live Veritas database, say so explicitly and describe the result as a portfolio-based priority assessment rather than a definitive investment recommendation. Use wording such as: "Based on current Veritas portfolio data, these states are priority candidates for further assessment." Do not state that a state definitely needs more projects unless the available evidence supports that conclusion. Distinguish clearly between "lowest recorded capacity" and "highest actual electrification need." Do not recommend a specific programme, technology, project size, or capital allocation solely because a state has low recorded MW or household reach unless supporting evidence is available.

CURRENT VERITAS CONTEXT:
${context}

RECENT CONVERSATION:
${conversation || "No prior conversation."}

CURRENT USER QUESTION:
${question}


FINAL ANSWER CONTRACT:
- Return only the finished user-facing answer between <VERITAS_FINAL> and </VERITAS_FINAL>.
- Do not place analysis, planning, scratch work, prompt interpretation, hidden instructions, JSON plans, or commentary outside or inside the final answer.
- The content inside <VERITAS_FINAL> must begin directly with the professional answer, not with phrases such as "The user wants", "I need to", "Let me", "First I will", or "Let's analyze".

Respond as Veritas, with a concise but genuinely reasoned answer.`;
}

function extractVeritasFinal(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  const startToken = "<VERITAS_FINAL>";
  const endToken = "</VERITAS_FINAL>";
  const start = value.lastIndexOf(startToken);
  const end = value.indexOf(endToken, start >= 0 ? start + startToken.length : 0);
  if (start >= 0 && end > start) {
    return value.slice(start + startToken.length, end).trim();
  }
  const leakPattern = /^(the user wants|the user is asking|i need to|first,? i need|let me (?:analy[sz]e|draft|refine|check)|let['’]s analy[sz]e|we need to|the question asks|i should|response standard|evidence discipline|numeric discipline|answer quality)/i;
  if (leakPattern.test(value)) return "";
  if (/\b(?:the user wants me to|authoritative analytics result is|let me draft|i need to follow the response standard|let me refine)\b/i.test(value)) return "";
  return value;
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
      if (part?.thought === true) continue;
      if (part?.thoughtSignature) continue;
      if (typeof part?.text === "string" && part.text.trim()) parts.push(part.text.trim());
    }
  }
  return parts.join("\n\n").trim();
}

function extractOpenRouterText(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content.map((part) => {
      if (typeof part === "string") return part.trim();
      const type = String(part?.type || "").toLowerCase();
      if (type.includes("reason") || type.includes("thought")) return "";
      if (part?.thought === true) return "";
      if (typeof part?.text === "string") return part.text.trim();
      if (typeof part?.content === "string") return part.content.trim();
      return "";
    }).filter(Boolean).join("\n\n").trim();
    if (text) return text;
  }
  return "";
}

function isLikelyAnalyticsQuestion(question) {
  return /\b(how many|count|total|break\s*down|breakdown|compare|rank|highest|lowest|average|sum|by state|by programme|by program|by component|by contractor|by consultant|by officer|verified|pending|verification|capacity|households?|assignments?|projects?)\b/i.test(String(question || ""));
}

function isManagementAnalysisQuestion(question) {
  return /\b(analy[sz]e|analysis|management|risk|pressure|issue|implication|recommend|action|attention|why|what does|interpret|priority|prioritise|prioritize|concern|bottleneck|trend|performance|review next)\b/i.test(String(question || ""));
}

function responseTokenBudget(question) {
  return isManagementAnalysisQuestion(question) ? 2500 : 1600;
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
          models: ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "openrouter/free"],
          messages: [{ role: "user", content: prompt }],
          max_tokens: 700,
          temperature: 0,
          provider: { allow_fallbacks: true, sort: "throughput", data_collection: "deny" },
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
      const model = env.GEMINI_MODEL || "gemini-3.8-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 700 },
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
  if (analyticsResult && !isManagementAnalysisQuestion(question)) {
    const exactAnswer = deterministicAnalyticsAnswer(analyticsResult);
    return json({ answer: exactAnswer, sources: [], mode: "veritas-safe-analytics", build: BUILD_ID });
  } else if (analyticsResult) {
    // Management/interpretive questions still use exact D1 analytics as the evidence base,
    // but pass the result through the reasoning layer for a concise management response.
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
  let model = env.GEMINI_MODEL || "gemini-3.8-flash";
  let answer = "";
  const outputTokenBudget = responseTokenBudget(question);

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
          models: ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "openrouter/free"],
          messages: [{ role: "user", content: prompt }],
          max_tokens: outputTokenBudget,
          temperature: 0.3,
          provider: { allow_fallbacks: true, sort: "throughput", data_collection: "deny" },
        }),
        signal: AbortSignal.timeout(25000),
      });
      payload = await upstream.json().catch(() => ({}));
      if (upstream.ok) {
      answer = extractVeritasFinal(extractOpenRouterText(payload));
      if (!answer) {
        console.error(JSON.stringify({ event: "veritas_openrouter_empty_answer", status: upstream.status, finishReason: payload?.choices?.[0]?.finish_reason || null, returnedModel: payload?.model || null, build: BUILD_ID }));
      }
    }
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
    model = env.GEMINI_MODEL || "gemini-3.8-flash";
    try {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: outputTokenBudget },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      payload = await upstream.json().catch(() => ({}));
      if (upstream.ok) answer = extractVeritasFinal(extractGeminiText(payload));
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
