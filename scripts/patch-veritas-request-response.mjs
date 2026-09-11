import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-compact-reasoning-r1";');

const compactStart = s.indexOf('function compactContext(databaseContext = {}) {');
const compactEnd = s.indexOf('\n}\n\nfunction aggregateBy', compactStart);
if (compactStart < 0 || compactEnd < 0) throw new Error('compactContext block not found');

const compactReplacement = `function compactContext(databaseContext = {}, question = "") {
  const context = { ...databaseContext };
  const q = String(question || "").toLowerCase();

  // Management/reasoning questions should use authoritative summaries first.
  // Detailed records are included only when the question explicitly needs them.
  const needsProjects = /\\b(project name|which projects?|list projects?|project id|community|lga|specific project)\\b/i.test(q);
  const needsAssignments = /\\b(assignments?|field officers?|officer|submitted reports?|re-?inspection|due date)\\b/i.test(q);
  const needsConsultants = /\\bconsultants?|consultant firm|consultant admin)\\b/i.test(q);

  if (Array.isArray(context.projects)) {
    if (needsProjects) {
      const total = context.projects.length;
      context.projects = context.projects.slice(0, 40);
      if (total > context.projects.length) context.projectRecordNote = \\`Showing 40 of ${'${total}'} project records; portfolio aggregates remain complete.\\`;
    } else {
      delete context.projects;
    }
  }

  if (Array.isArray(context.assignments)) {
    if (needsAssignments) {
      const total = context.assignments.length;
      context.assignments = context.assignments.slice(0, 40);
      if (total > context.assignments.length) context.assignmentRecordNote = \\`Showing 40 of ${'${total}'} assignment records; status aggregates remain complete.\\`;
    } else {
      delete context.assignments;
    }
  }

  if (!needsConsultants) delete context.consultants;

  // Internal implementation structures are never needed in the LLM prompt.
  delete context.componentStateProgramme;

  // Keep user summaries but avoid large rosters unless explicitly requested.
  if (context.users && !/\\b(users?|field officers?|consultant admins?|rea admins?)\\b/i.test(q)) {
    context.users = {
      fieldOfficerCount: Array.isArray(context.users.fieldOfficers) ? context.users.fieldOfficers.length : 0,
      consultantAdminCount: Array.isArray(context.users.consultantAdmins) ? context.users.consultantAdmins.length : 0,
      reaAdminCount: Array.isArray(context.users.reaAdmins) ? context.users.reaAdmins.length : 0,
    };
  }

  return context;
}`.replaceAll('\\`', '`');
s = s.slice(0, compactStart) + compactReplacement + s.slice(compactEnd + 2);

s = s.replace(
  'const context = JSON.stringify(compactContext(databaseContext || {}));',
  'const context = JSON.stringify(compactContext(databaseContext || {}, question));',
);

// Keep reasoning answers management-ready and reduce needless output cost.
s = s.replaceAll('max_tokens: 3000,', 'max_tokens: 1600,');
s = s.replaceAll('generationConfig: { maxOutputTokens: 3000 },', 'generationConfig: { maxOutputTokens: 1600 },');

// Improve OpenRouter response extraction for text and typed content blocks.
const extractStart = s.indexOf('function extractOpenRouterText(payload) {');
const extractEnd = s.indexOf('\n}\n\nfunction isLikelyAnalyticsQuestion', extractStart);
if (extractStart < 0 || extractEnd < 0) throw new Error('extractOpenRouterText block not found');
const extractReplacement = `function extractOpenRouterText(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (typeof part?.text === "string") return part.text.trim();
        if (typeof part?.content === "string") return part.content.trim();
        return "";
      })
      .filter(Boolean)
      .join("\\n\\n")
      .trim();
    if (text) return text;
  }
  if (typeof message?.reasoning === "string" && message.reasoning.trim()) return message.reasoning.trim();
  return "";
}`;
s = s.slice(0, extractStart) + extractReplacement + s.slice(extractEnd + 2);

// Preserve useful upstream details in logs without exposing secrets to users.
s = s.replace(
  'if (upstream.ok) answer = extractOpenRouterText(payload);',
  `if (upstream.ok) {
      answer = extractOpenRouterText(payload);
      if (!answer) {
        console.error(JSON.stringify({
          event: "veritas_openrouter_empty_answer",
          status: upstream.status,
          finishReason: payload?.choices?.[0]?.finish_reason || null,
          returnedModel: payload?.model || null,
          build: BUILD_ID,
        }));
      }
    }`,
);

fs.writeFileSync(workerPath, s);

const clientPath = 'client/components/VeritasAssistant.tsx';
let c = fs.readFileSync(clientPath, 'utf8');

// Server is authoritative; do not transmit the large browser-computed context.
c = c.replace(/,\n\s*databaseContext,\n\s*\}\),/, '\n        }),');

// Send only recent conversational turns; 6 is enough for continuity and cuts request size.
c = c.replace('.slice(-10)', '.slice(-6)');

fs.writeFileSync(clientPath, c);
console.log('Optimized Veritas request construction and response handling');
