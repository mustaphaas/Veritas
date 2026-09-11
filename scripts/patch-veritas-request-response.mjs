import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-ai-diagnostics-r1";');

const oldCompactSignature = 'function compactContext(databaseContext = {}) {';
const newCompactSignature = 'function compactContext(databaseContext = {}, question = "") {';
const compactStart = s.includes(oldCompactSignature)
  ? s.indexOf(oldCompactSignature)
  : s.indexOf(newCompactSignature);
const compactEnd = compactStart >= 0 ? s.indexOf('\n}\n\nfunction aggregateBy', compactStart) : -1;

if (compactStart >= 0 && compactEnd >= 0) {
  const compactReplacement = [
    'function compactContext(databaseContext = {}, question = "") {',
    '  const context = { ...databaseContext };',
    '  const q = String(question || "").toLowerCase();',
    '',
    '  const needsProjects = /\\b(project name|which projects?|list projects?|project id|community|lga|specific project)\\b/i.test(q);',
    '  const needsAssignments = /\\b(assignments?|field officers?|officer|submitted reports?|re-?inspection|due date)\\b/i.test(q);',
    '  const needsConsultants = /\\b(consultants?|consultant firm|consultant admin)\\b/i.test(q);',
    '',
    '  if (Array.isArray(context.projects)) {',
    '    if (needsProjects) {',
    '      const total = context.projects.length;',
    '      context.projects = context.projects.slice(0, 40);',
    '      if (total > context.projects.length) context.projectRecordNote = "Showing 40 of " + total + " project records; portfolio aggregates remain complete.";',
    '    } else {',
    '      delete context.projects;',
    '    }',
    '  }',
    '',
    '  if (Array.isArray(context.assignments)) {',
    '    if (needsAssignments) {',
    '      const total = context.assignments.length;',
    '      context.assignments = context.assignments.slice(0, 40);',
    '      if (total > context.assignments.length) context.assignmentRecordNote = "Showing 40 of " + total + " assignment records; status aggregates remain complete.";',
    '    } else {',
    '      delete context.assignments;',
    '    }',
    '  }',
    '',
    '  if (!needsConsultants) delete context.consultants;',
    '  delete context.componentStateProgramme;',
    '',
    '  if (context.users && !/\\b(users?|field officers?|consultant admins?|rea admins?)\\b/i.test(q)) {',
    '    context.users = {',
    '      fieldOfficerCount: Array.isArray(context.users.fieldOfficers) ? context.users.fieldOfficers.length : 0,',
    '      consultantAdminCount: Array.isArray(context.users.consultantAdmins) ? context.users.consultantAdmins.length : 0,',
    '      reaAdminCount: Array.isArray(context.users.reaAdmins) ? context.users.reaAdmins.length : 0,',
    '    };',
    '  }',
    '',
    '  return context;',
    '}'
  ].join('\n');
  s = s.slice(0, compactStart) + compactReplacement + s.slice(compactEnd + 2);
} else if (!s.includes(newCompactSignature)) {
  throw new Error('compactContext block not found');
}

s = s.replace('const context = JSON.stringify(compactContext(databaseContext || {}));', 'const context = JSON.stringify(compactContext(databaseContext || {}, question));');
s = s.replaceAll('max_tokens: 3000,', 'max_tokens: 1600,');
s = s.replaceAll('generationConfig: { maxOutputTokens: 3000 },', 'generationConfig: { maxOutputTokens: 1600 },');

const extractStart = s.indexOf('function extractOpenRouterText(payload) {');
const extractEnd = extractStart >= 0 ? s.indexOf('\n}\n\nfunction isLikelyAnalyticsQuestion', extractStart) : -1;
if (extractStart >= 0 && extractEnd >= 0) {
  const extractReplacement = [
    'function extractOpenRouterText(payload) {',
    '  const message = payload?.choices?.[0]?.message;',
    '  const content = message?.content;',
    '  if (typeof content === "string" && content.trim()) return content.trim();',
    '  if (Array.isArray(content)) {',
    '    const text = content.map((part) => {',
    '      if (typeof part === "string") return part.trim();',
    '      const type = String(part?.type || "").toLowerCase();',
    '      if (type.includes("reason") || type.includes("thought")) return "";',
    '      if (part?.thought === true) return "";',
    '      if (typeof part?.text === "string") return part.text.trim();',
    '      if (typeof part?.content === "string") return part.content.trim();',
    '      return "";',
    '    }).filter(Boolean).join("\\n\\n").trim();',
    '    if (text) return text;',
    '  }',
    '  return "";',
    '}'
  ].join('\n');
  s = s.slice(0, extractStart) + extractReplacement + s.slice(extractEnd + 2);
} else {
  throw new Error('extractOpenRouterText block not found');
}

if (!s.includes('function isGeneralCapabilityQuestion(question)')) {
  const anchor = 'function responseTokenBudget(question) {';
  const idx = s.indexOf(anchor);
  if (idx < 0) throw new Error('response token budget anchor not found');
  const helper = [
    'function isGeneralCapabilityQuestion(question) {',
    '  return /^(?:what can you do|what do you do|how can you help|help me|capabilities|your capabilities|what are your capabilities)[?.! ]*$/i.test(String(question || "").trim());',
    '}',
    '',
  ].join('\n');
  s = s.slice(0, idx) + helper + s.slice(idx);
}

const liveContextBlock = [
  '  } else {',
  '    databaseContext = await liveDatabaseContext(env);',
  '    const exactCrossTabAnswer = typeof exactComponentStateProgrammeAnswer === "function" ? exactComponentStateProgrammeAnswer(question, databaseContext) : "";',
  '    if (exactCrossTabAnswer) {',
  '      return json({ answer: exactCrossTabAnswer, sources: [], mode: "veritas-live-d1-exact", build: BUILD_ID });',
  '    }',
  '    prompt = buildInput(body.messages, databaseContext);',
  '  }'
].join('\n');

if (s.includes(liveContextBlock)) {
  const replacement = [
    '  } else {',
    '    if (isGeneralCapabilityQuestion(question)) {',
    '      databaseContext = {',
    '        generatedAt: new Date().toISOString(),',
    '        source: "General Veritas capability request",',
    '        dataScope: "No live D1 query required for this general AI capability question.",',
    '      };',
    '    } else {',
    '      try {',
    '        databaseContext = await liveDatabaseContext(env);',
    '      } catch (error) {',
    '        console.error(JSON.stringify({',
    '          event: "veritas_d1_context_failure",',
    '          message: error instanceof Error ? error.message : "Unknown error",',
    '          build: BUILD_ID,',
    '        }));',
    '        return json({',
    '          error: "Veritas could not load the current production data required for this request.",',
    '          code: "VERITAS_D1_CONTEXT_UNAVAILABLE",',
    '          build: BUILD_ID,',
    '        }, 503);',
    '      }',
    '    }',
    '    const exactCrossTabAnswer = typeof exactComponentStateProgrammeAnswer === "function" ? exactComponentStateProgrammeAnswer(question, databaseContext) : "";',
    '    if (exactCrossTabAnswer) {',
    '      return json({ answer: exactCrossTabAnswer, sources: [], mode: "veritas-live-d1-exact", build: BUILD_ID });',
    '    }',
    '    prompt = buildInput(body.messages, databaseContext);',
    '  }'
  ].join('\n');
  s = s.replace(liveContextBlock, replacement);
} else if (!s.includes('VERITAS_D1_CONTEXT_UNAVAILABLE')) {
  throw new Error('live D1 context block not found');
}

const geminiSuccess = '      if (upstream.ok) answer = extractVeritasFinal(extractGeminiText(payload));';
if (s.includes(geminiSuccess)) {
  s = s.replace(geminiSuccess, [
    '      if (upstream.ok) {',
    '        answer = extractVeritasFinal(extractGeminiText(payload));',
    '        if (!answer) {',
    '          console.error(JSON.stringify({',
    '            event: "veritas_direct_gemini_empty_answer",',
    '            status: upstream.status,',
    '            finishReason: payload?.candidates?.[0]?.finishReason || null,',
    '            blockReason: payload?.promptFeedback?.blockReason || null,',
    '            model,',
    '            build: BUILD_ID,',
    '          }));',
    '        }',
    '      } else {',
    '        console.error(JSON.stringify({',
    '          event: "veritas_direct_gemini_http_failure",',
    '          status: upstream.status,',
    '          model,',
    '          upstreamMessage: String(payload?.error?.message || payload?.error || ""),',
    '          build: BUILD_ID,',
    '        }));',
    '      }'
  ].join('\n'));
}

const allFailedReturn = '    return json({ error: publicVeritasError(upstream?.status || 503), build: BUILD_ID }, upstream?.status === 429 ? 429 : 503);';
if (s.includes(allFailedReturn)) {
  s = s.replace(allFailedReturn, [
    '    return json({',
    '      error: publicVeritasError(upstream?.status || 503),',
    '      code: "VERITAS_AI_PROVIDERS_FAILED",',
    '      attemptedProviders: {',
    '        openrouter: Boolean(env.OPENROUTER_API_KEY),',
    '        gemini: Boolean(env.GEMINI_API_KEY),',
    '      },',
    '      build: BUILD_ID,',
    '    }, upstream?.status === 429 ? 429 : 503);'
  ].join('\n'));
}

if (!s.includes('veritas_direct_gemini_http_failure')) throw new Error('Gemini HTTP diagnostics missing');
if (!s.includes('VERITAS_D1_CONTEXT_UNAVAILABLE')) throw new Error('D1 diagnostics missing');
if (!s.includes('VERITAS_AI_PROVIDERS_FAILED')) throw new Error('provider failure diagnostic code missing');
if (!s.includes('isGeneralCapabilityQuestion(question)')) throw new Error('general capability routing missing');

fs.writeFileSync(workerPath, s);

const clientPath = 'client/components/VeritasAssistant.tsx';
let c = fs.readFileSync(clientPath, 'utf8');
c = c.replace(/,\n\s*databaseContext,\n\s*\}\),/, '\n        }),');
c = c.replace('.slice(-10)', '.slice(-6)');
fs.writeFileSync(clientPath, c);

console.log('Optimized Veritas request construction and added D1/provider diagnostics');
