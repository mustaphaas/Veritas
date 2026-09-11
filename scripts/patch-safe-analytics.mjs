import fs from 'node:fs';

const path = 'worker/index.js';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('from "./analytics.js"')) {
  s = s.replace(
    'import { handleFieldApi } from "./field-api.js";\n',
    'import { handleFieldApi } from "./field-api.js";\nimport { analyticsCatalog, analyticsAnswerPrompt, executeAnalyticsPlan, parsePlannerJson, plannerPrompt, validateAnalyticsPlan } from "./analytics.js";\n',
  );
}

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-safe-dynamic-analytics-r1";');

const marker = 'async function veritasResponse(request, env) {\n';
const helpers = `function isLikelyAnalyticsQuestion(question) {
  return /\\b(how many|count|total|break\\s*down|breakdown|compare|rank|highest|lowest|average|sum|by state|by programme|by program|by component|by contractor|by consultant|by officer|verified|pending|verification|capacity|households?|assignments?|projects?)\\b/i.test(String(question || ""));
}

async function analyticsPlannerResponse(question, env) {
  const prompt = plannerPrompt(question, analyticsCatalog());

  if (env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${env.OPENROUTER_API_KEY}\`,
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
        \`https://generativelanguage.googleapis.com/v1beta/models/\${encodeURIComponent(model)}:generateContent\`,
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
  const lines = rows.map((row) => Object.entries(row).map(([key, value]) => \`\${key}: \${value ?? "—"}\`).join(" | "));
  const limitNote = result.truncated ? "\\n\\nThe result reached the configured row limit, so it may not include every matching group." : "";
  return \`Authoritative Veritas production database result (\${rows.length} row\${rows.length === 1 ? "" : "s"}):\\n\\n\${lines.join("\\n")}\${limitNote}\`;
}

`;

if (!s.includes('function isLikelyAnalyticsQuestion(')) {
  if (!s.includes(marker)) throw new Error('veritasResponse marker not found');
  s = s.replace(marker, helpers + marker);
}

let old = `  const databaseContext = await liveDatabaseContext(env);\n  const exactCrossTabAnswer = exactComponentStateProgrammeAnswer(question, databaseContext);\n  if (exactCrossTabAnswer) {\n    return json({ answer: exactCrossTabAnswer, sources: [], mode: "veritas-live-d1-exact", build: BUILD_ID });\n  }\n  const prompt = buildInput(body.messages, databaseContext);\n`;
if (!s.includes(old)) {
  old = `  const databaseContext = await liveDatabaseContext(env);\n  const prompt = buildInput(body.messages, databaseContext);\n`;
}

const replacement = `  let analyticsResult = null;\n  if (isLikelyAnalyticsQuestion(question)) {\n    const plannerText = await analyticsPlannerResponse(question, env);\n    const rawPlan = parsePlannerJson(plannerText);\n    const plan = validateAnalyticsPlan(rawPlan);\n    if (plan) {\n      try {\n        analyticsResult = await executeAnalyticsPlan(env, plan);\n      } catch (error) {\n        console.error(JSON.stringify({ event: "veritas_analytics_execution_failure", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));\n      }\n    }\n  }\n\n  let databaseContext = null;\n  let prompt;\n  if (analyticsResult) {\n    prompt = analyticsAnswerPrompt(question, analyticsResult);\n  } else {\n    databaseContext = await liveDatabaseContext(env);\n    const exactCrossTabAnswer = typeof exactComponentStateProgrammeAnswer === "function" ? exactComponentStateProgrammeAnswer(question, databaseContext) : "";\n    if (exactCrossTabAnswer) {\n      return json({ answer: exactCrossTabAnswer, sources: [], mode: "veritas-live-d1-exact", build: BUILD_ID });\n    }\n    prompt = buildInput(body.messages, databaseContext);\n  }\n`;

if (!s.includes(replacement)) {
  if (!s.includes(old)) throw new Error('prompt setup block not found');
  s = s.replace(old, replacement);
}

const failureMarker = `  if (!answer) {\n    console.error(JSON.stringify({\n      event: "veritas_all_ai_routes_failed",`;
if (!s.includes('if (!answer && analyticsResult)')) {
  if (!s.includes(failureMarker)) throw new Error('AI failure marker not found');
  s = s.replace(failureMarker, `  if (!answer && analyticsResult) {\n    answer = deterministicAnalyticsAnswer(analyticsResult);\n  }\n\n${failureMarker}`);
}

s = s.replace(
  'return json({ answer, sources: [], mode: "veritas-live-d1", build: BUILD_ID });',
  'return json({ answer, sources: [], mode: analyticsResult ? "veritas-safe-analytics" : "veritas-live-d1", build: BUILD_ID });',
);

fs.writeFileSync(path, s);
