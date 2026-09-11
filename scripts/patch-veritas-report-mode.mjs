import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-report-mode-r1";');

// Add LGA-level full-database aggregates for geographic reports.
if (!s.includes('lgaPerformance: aggregateBy(projects, "lga"')) {
  const anchor = '    statePerformance: aggregateBy(projects, "state", (label, group) => projectSummary(label, group, "state")),\n';
  if (!s.includes(anchor)) throw new Error('statePerformance anchor not found');
  s = s.replace(anchor, `${anchor}    lgaPerformance: aggregateBy(projects, "lga", (label, group) => projectSummary(label, group, "lga")),\n`);
}

// Report requests should use the broad authoritative live snapshot rather than a single analytics plan.
if (!s.includes('function isReportRequest(question)')) {
  const anchor = 'function isManagementAnalysisQuestion(question) {\n';
  const index = s.indexOf(anchor);
  if (index < 0) throw new Error('management detector anchor not found');
  const end = s.indexOf('\n}\n', index);
  if (end < 0) throw new Error('management detector end not found');
  const insertionPoint = end + 3;
  const helper = `\nfunction isReportRequest(question) {\n  return /\\b(generate|create|prepare|produce|write|draft|compile|build)\\b[\\s\\S]{0,80}\\b(report|brief|briefing|management report|monthly report|performance report|verification report)\\b|\\b(report|brief|briefing)\\b[\\s\\S]{0,80}\\b(generate|create|prepare|produce|write|draft|compile|build)\\b/i.test(String(question || ""));\n}\n`;
  s = s.slice(0, insertionPoint) + helper + s.slice(insertionPoint);
}

// Give reports more room, while keeping ordinary and management questions economical.
s = s.replace(
  /function responseTokenBudget\(question\) \{[\s\S]*?\n\}/,
  `function responseTokenBudget(question) {\n  if (isReportRequest(question)) return 4500;\n  return isManagementAnalysisQuestion(question) ? 2500 : 1600;\n}`,
);

// Do not force a report into the one-dataset analytics planner.
s = s.replace(
  '  if (isLikelyAnalyticsQuestion(question)) {',
  '  if (isLikelyAnalyticsQuestion(question) && !isReportRequest(question)) {',
);

// Add a dedicated professional report-writing standard to the broad live-data prompt.
if (!s.includes('REPORT GENERATION STANDARD:')) {
  const anchor = '\nPROJECT PRIORITY ANALYSIS RULES:\n';
  if (!s.includes(anchor)) throw new Error('project priority anchor not found');
  const rules = `\nREPORT GENERATION STANDARD:\n- When the user asks to generate, prepare, create, produce, compile or write a report, switch from normal chat style to a complete formal REA management report.\n- Use only the CURRENT VERITAS CONTEXT as factual evidence for internal figures. Never invent a project count, verification figure, contractor result, consultant status, state result, LGA result, assignment status, date, target, deadline or cause.\n- State the reporting scope or period at the top. If no explicit period is supplied, say that the report reflects the current live Veritas production snapshot and do not invent a month or reporting period.\n- Use this default structure unless the user asks for another format: Report Title; Reporting Scope; Executive Summary; Portfolio Overview; Performance Analysis; Verification & QA; Geographic Performance; Programme Performance; Consultant/Contractor Observations when supported; Key Risks & Exceptions; Confirmed Facts; Interpretation; Data Gaps; Management Actions; Conclusion.\n- For State/LGA performance reports, prioritise statePerformance and lgaPerformance. Compare project volume, installed capacity, households reached, verified projects, pending projects and descriptive verification shares where the source values support calculation. Do not infer actual electrification need from Veritas portfolio size alone.\n- For programme reports, prioritise programmePerformance. For contractor reports, prioritise contractorPerformance. For consultant reports, distinguish consultantPerformance project aggregates from consultant status records and do not treat an allocation bucket as a consultant unless explicitly identified as one.\n- For verification reports, use portfolio verification totals, assignmentStatusCounts and supported programme/state/LGA/contractor/consultant breakdowns. Do not claim a bottleneck, delay, capacity shortage or weak management unless the evidence establishes it.\n- Put the most decision-relevant findings in the Executive Summary. Do not dump every row. Rank material issues only when the evidence supports a meaningful comparison.\n- Separate confirmed facts from interpretation. A current status difference can justify management attention without proving the reason for the difference.\n- Management Actions must be evidence-led checks or decisions that logically follow from confirmed findings. Never invent a numeric target, deadline, SLA, staffing requirement or budget.\n- Data Gaps should identify only information genuinely missing for the requested conclusion; do not use boilerplate caveats.\n- Write in formal, concise REA language suitable for a Director or Managing Director. The report should be detailed enough to stand alone and later be rendered into the approved REA PDF template.\n`;
  s = s.replace(anchor, `${rules}${anchor}`);
}

// If a provider returns the opening final marker but is cut before the closing marker,
// strip the marker and preserve the usable answer instead of surfacing a wrapper or empty response.
const oldExtractor = `  if (start >= 0 && end > start) {\n    return value.slice(start + startToken.length, end).trim();\n  }`;
const newExtractor = `  if (start >= 0) {\n    if (end > start) return value.slice(start + startToken.length, end).trim();\n    return value.slice(start + startToken.length).trim();\n  }`;
if (s.includes(oldExtractor)) s = s.replace(oldExtractor, newExtractor);

fs.writeFileSync(workerPath, s);
console.log('Applied Veritas report mode with State/LGA aggregates and 4500-token report budget');
