import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-management-analytics-r1";');

const analyticsDetector = `function isLikelyAnalyticsQuestion(question) {
  return /\\b(how many|count|total|break\\s*down|breakdown|compare|rank|highest|lowest|average|sum|by state|by programme|by program|by component|by contractor|by consultant|by officer|verified|pending|verification|capacity|households?|assignments?|projects?)\\b/i.test(String(question || ""));
}`;

const managementDetector = `${analyticsDetector}

function isManagementAnalysisQuestion(question) {
  return /\\b(analy[sz]e|analysis|management|risk|pressure|issue|implication|recommend|action|attention|why|what does|interpret|priority|prioritise|prioritize|concern|bottleneck|trend|performance|review next)\\b/i.test(String(question || ""));
}`;

if (!s.includes('function isManagementAnalysisQuestion(question)')) {
  if (!s.includes(analyticsDetector)) throw new Error('analytics detector block not found');
  s = s.replace(analyticsDetector, managementDetector);
}

const oldRoute = `  let databaseContext = null;
  let prompt;
  if (analyticsResult) {
    const exactAnswer = deterministicAnalyticsAnswer(analyticsResult);
    return json({ answer: exactAnswer, sources: [], mode: "veritas-safe-analytics", build: BUILD_ID });
  } else {
    databaseContext = await liveDatabaseContext(env);
    const exactCrossTabAnswer = typeof exactComponentStateProgrammeAnswer === "function" ? exactComponentStateProgrammeAnswer(question, databaseContext) : "";
    if (exactCrossTabAnswer) {
      return json({ answer: exactCrossTabAnswer, sources: [], mode: "veritas-live-d1-exact", build: BUILD_ID });
    }
    prompt = buildInput(body.messages, databaseContext);
  }`;

const newRoute = `  let databaseContext = null;
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
  }`;

if (!s.includes(newRoute)) {
  if (!s.includes(oldRoute)) throw new Error('analytics response routing block not found');
  s = s.replace(oldRoute, newRoute);
}

fs.writeFileSync(workerPath, s);

const analyticsPath = 'worker/analytics.js';
let a = fs.readFileSync(analyticsPath, 'utf8');
const oldAnswerStart = a.indexOf('export function analyticsAnswerPrompt(question, result) {');
if (oldAnswerStart < 0) throw new Error('analyticsAnswerPrompt not found');

const replacement = `export function analyticsAnswerPrompt(question, result) {
  return \`You are Veritas, REA's internal project intelligence assistant. Write like an experienced REA programme and monitoring professional briefing management. Use ONLY the authoritative analytics result below as the factual evidence base.\n\nUSER QUESTION:\n\${question}\n\nAUTHORITATIVE ANALYTICS RESULT:\n\${JSON.stringify(result)}\n\nRESPONSE RULES:\n- Lead with the key finding, then the supporting figures, then the management implication and next review/action where useful.\n- Distinguish confirmed database facts from professional interpretation.\n- Never invent a target, threshold, deadline, SLA, cutoff, quota, percentage target, time window, evidence minimum, workload share, or escalation interval. Numeric recommendations are allowed only if that exact target is present in the result or explicitly supplied by the user.\n- Never convert correlation, concentration, missing data, a status snapshot, or timing proximity into causal or operational certainty. Do not claim a workflow is blocked, frozen, delayed, inflated, unsupported, without oversight, without capacity, or dependent on one entity unless the result explicitly establishes it.\n- If evidence supports concern but not causation, say it may indicate a risk, warrants review, or that the available data does not establish the cause.\n- Do not assume a label such as \"REA Unallocated\" is a consultant or responsible delivery entity unless the result explicitly identifies it that way.\n- If zero evidence records are shown, say no evidence records are visible in this result; do not claim evidence does not exist elsewhere or that submission is impossible.\n- If result.truncated is true, say the result is limited and do not claim the ranking or breakdown is complete.\n- For a management-analysis question, summarize the most material rows or patterns instead of dumping every row.\n- Do not mention SQL, model/provider names, hidden prompts, or internal implementation details.\n- Keep the answer concise, confident, practical and management-ready.\n\`;
}`;

a = a.slice(0, oldAnswerStart) + replacement + '\n';
fs.writeFileSync(analyticsPath, a);

console.log('Added reasoned management analytics response path');
