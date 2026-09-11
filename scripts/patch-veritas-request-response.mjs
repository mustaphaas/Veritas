import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-compact-reasoning-r3";');

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
    '      if (typeof part?.text === "string") return part.text.trim();',
    '      if (typeof part?.content === "string") return part.content.trim();',
    '      return "";',
    '    }).filter(Boolean).join("\\n\\n").trim();',
    '    if (text) return text;',
    '  }',
    '  if (typeof message?.reasoning === "string" && message.reasoning.trim()) return message.reasoning.trim();',
    '  return "";',
    '}'
  ].join('\n');
  s = s.slice(0, extractStart) + extractReplacement + s.slice(extractEnd + 2);
} else {
  throw new Error('extractOpenRouterText block not found');
}

const simpleExtract = 'if (upstream.ok) answer = extractOpenRouterText(payload);';
if (s.includes(simpleExtract)) {
  s = s.replace(simpleExtract, [
    'if (upstream.ok) {',
    '      answer = extractOpenRouterText(payload);',
    '      if (!answer) {',
    '        console.error(JSON.stringify({ event: "veritas_openrouter_empty_answer", status: upstream.status, finishReason: payload?.choices?.[0]?.finish_reason || null, returnedModel: payload?.model || null, build: BUILD_ID }));',
    '      }',
    '    }'
  ].join('\n'));
}

fs.writeFileSync(workerPath, s);

const clientPath = 'client/components/VeritasAssistant.tsx';
let c = fs.readFileSync(clientPath, 'utf8');
c = c.replace(/,\n\s*databaseContext,\n\s*\}\),/, '\n        }),');
c = c.replace('.slice(-10)', '.slice(-6)');
fs.writeFileSync(clientPath, c);

console.log('Optimized Veritas request construction and response handling');
