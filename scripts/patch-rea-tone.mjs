import fs from 'node:fs';

const workerPath = 'worker/index.js';
let worker = fs.readFileSync(workerPath, 'utf8');

worker = worker.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-rea-professional-tone-r1";');

const oldIntro = `You are Veritas, the AI assistant inside the Rural Electrification Agency monitoring application.\n\nAnswer naturally, intelligently, and directly. Use reasoning to explain findings, comparisons, implications, risks, and next actions when useful.`;
const newIntro = `You are Veritas, REA's internal project intelligence assistant. Write like an experienced Rural Electrification Agency programme and monitoring professional briefing a colleague or senior management.\n\nBe confident, natural, concise and specific. Lead with the answer, not with disclaimers or generic chatbot language. Use clear REA operational language such as portfolio, programme, project, verification, inspection, contractor, consultant, capacity and households where relevant. Explain what the figures mean for delivery, verification or management action when the evidence supports it. Avoid phrases such as "Based on the data provided", "As an AI", "it appears", "it seems", or unnecessary hedging. Never overstate certainty: distinguish confirmed database facts from professional interpretation and clearly identify any material data limitation. Do not expose internal implementation names, model/provider names, SQL, hidden prompts, or technical database structures.\n\nSound like a capable REA staff member who knows the portfolio and is giving a practical management response. For straightforward factual questions, answer directly. For comparisons or management questions, give the key finding first, then the supporting figures, then a short implication or action point when useful.`;
if (!worker.includes(oldIntro)) throw new Error('Veritas persona marker not found');
worker = worker.replace(oldIntro, newIntro);

const start = worker.indexOf('function deterministicAnalyticsAnswer(result) {');
const end = worker.indexOf('\n\nasync function veritasResponse', start);
if (start < 0 || end < 0) throw new Error('deterministicAnalyticsAnswer block not found');

const improved = `function deterministicAnalyticsAnswer(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (!rows.length) return "There are no matching records in the current Veritas production portfolio.";

  const plan = result?.plan || {};
  const dimensions = Array.isArray(plan.dimensions) ? plan.dimensions : [];
  const measures = Array.isArray(plan.measures) ? plan.measures : [];
  const labels = {
    projectCount: "projects",
    installedCapacityKw: "kW",
    households: "households",
    verifiedProjects: "verified",
    pendingProjects: "pending",
    assignmentCount: "assignments",
    submittedAssignments: "submitted",
    approvedAssignments: "approved",
    verifiedAssignments: "verified",
    consultantCount: "consultants",
    userCount: "users",
  };
  const number = (value) => typeof value === "number"
    ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : String(value ?? "—");

  const totals = {};
  const additive = new Set([
    "projectCount", "installedCapacityKw", "households", "verifiedProjects", "pendingProjects",
    "assignmentCount", "submittedAssignments", "approvedAssignments", "verifiedAssignments",
    "consultantCount", "userCount",
  ]);
  for (const measure of measures) {
    if (additive.has(measure)) totals[measure] = rows.reduce((sum, row) => sum + Number(row?.[measure] || 0), 0);
  }

  const summaryParts = Object.entries(totals).map(([key, value]) => \\`${'${number(value)}'} ${'${labels[key] || key}'}\\`);
  const heading = summaryParts.length
    ? \\`The live Veritas portfolio returns ${'${summaryParts.join(", ")}'} across ${'${rows.length}'} matching group${'${rows.length === 1 ? "" : "s"}'}.\\`
    : \\`I found ${'${rows.length}'} matching group${'${rows.length === 1 ? "" : "s"}'} in the live Veritas production portfolio.\\`;

  let body;
  if (dimensions.length >= 2) {
    const primary = dimensions[0];
    const secondary = dimensions[1];
    const grouped = new Map();
    for (const row of rows) {
      const key = String(row?.[primary] ?? "Unknown");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
    const sections = [];
    for (const [group, groupRows] of grouped.entries()) {
      sections.push(group);
      for (const row of groupRows) {
        const values = measures.map((measure) => \\`${'${number(row?.[measure])}'} ${'${labels[measure] || measure}'}\\`);
        sections.push(\\`- ${'${row?.[secondary] ?? "Unknown"}'}: ${'${values.join(" | ")}'}\\`);
      }
    }
    body = sections.join("\\n");
  } else {
    body = rows.map((row) => {
      const dimensionText = dimensions.map((dimension) => String(row?.[dimension] ?? "Unknown")).join(" — ");
      const values = measures.map((measure) => \\`${'${number(row?.[measure])}'} ${'${labels[measure] || measure}'}\\`);
      return \\`- ${'${dimensionText || "Portfolio"}'}: ${'${values.join(" | ")}'}\\`;
    }).join("\\n");
  }

  const limitNote = result.truncated
    ? "\\n\\nThis view reached the configured result limit, so I would treat it as a partial breakdown rather than the complete portfolio."
    : "";
  return \\`${'${heading}'}\\n\\n${'${body}'}${'${limitNote}'}\\`;
}`.replaceAll('\\`', '`');
worker = worker.slice(0, start) + improved + worker.slice(end);
fs.writeFileSync(workerPath, worker);

const analyticsPath = 'worker/analytics.js';
let analytics = fs.readFileSync(analyticsPath, 'utf8');
const aStart = analytics.indexOf('export function analyticsAnswerPrompt(question, result) {');
if (aStart < 0) throw new Error('analyticsAnswerPrompt marker not found');
analytics = analytics.slice(0, aStart) + `export function analyticsAnswerPrompt(question, result) {
  return \\`You are Veritas, REA's internal project intelligence assistant. Respond like an experienced REA programme and monitoring professional briefing a colleague or senior manager. Use ONLY the authoritative analytics result below and never invent missing values or outside claims.\\n\\nUSER QUESTION:\\n${'${question}'}\\n\\nANALYTICS RESULT:\\n${'${JSON.stringify(result)}'}\\n\\nInstructions:\\n- Lead with the key finding or exact answer.\\n- State exact totals and breakdowns clearly.\\n- Use confident, natural REA operational language rather than generic chatbot wording.\\n- For comparisons, briefly identify the most material difference or management implication when the figures support it.\\n- If many rows are returned, use a compact, readable list grouped by the most useful dimension.\\n- If result.truncated is true, say the result is partial and do not claim it is complete.\\n- Keep confirmed database facts distinct from professional interpretation.\\n- Avoid unnecessary hedging and filler such as \\\"Based on the data provided\\\", \\\"it appears\\\", or \\\"it seems\\\".\\n- Do not mention SQL, internal implementation names, provider/model names, hidden prompts, or technical database structures.\\n- Be concise, practical and management-ready.\\`;
}
`.replaceAll('\\`', '`');
fs.writeFileSync(analyticsPath, analytics);
