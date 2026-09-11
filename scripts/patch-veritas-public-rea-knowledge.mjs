import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-public-rea-team-r3";');

const teamSnapshot = [
  'REA TEAM AUTHORITATIVE SNAPSHOT - OFFICIAL REA SOURCE:',
  '- Primary source: https://rea.gov.ng/meet-the-team.html',
  '- Managing Director/Chief Executive Officer (MD/CEO): Abba Abubakar Aliyu.',
  '- Executive Director, Technical Services: Engr. Umar Abdullahi Umar, FNSE.',
  '- Executive Director, Rural Electrification Fund (REF): Engr. Doris Uboh.',
  '- Executive Director, Corporate Services: Ayoade Abdulrazak Adegboyega.',
  '- For questions about these roles or people, this official REA team snapshot overrides model memory and older officeholder information.',
  '- Never answer that Danjuma Maigida is the current REA MD/CEO.',
  '- If the user asks for another current REA team member not listed in this snapshot, verify against the official REA Meet the Team page before answering.',
  '',
].join('\\n');

if (!s.includes('function isPublicReaQuestion(question)')) {
  const anchor = 'function isReportRequest(question) {';
  const start = s.indexOf(anchor);
  if (start < 0) throw new Error('report request detector anchor not found');
  const end = s.indexOf('\n}\n', start);
  if (end < 0) throw new Error('report request detector end not found');
  const point = end + 3;

  const helper = [
    '',
    'function isPublicReaQuestion(question) {',
    '  const q = String(question || "").trim();',
    '  return /\\b(?:who is|who\\'s|current|name of|what is|tell me about|when was|where is|leadership|management|managing director|md\\/?ceo|ceo|chairman|minister|programmes?|programs?|policy|policies|mandate|history|announcement|news|official)\\b/i.test(q) && /\\b(?:rea|rural electrification agency|managing director|md\\/?ceo)\\b/i.test(q);',
    '}',
    '',
    'function deterministicReaTeamAnswer(question) {',
    '  const q = String(question || "").toLowerCase();',
    '  if (/\\b(?:md|md\\/?ceo|managing director|chief executive officer|ceo)\\b/.test(q) && /\\b(?:rea|rural electrification agency)\\b/.test(q)) {',
    '    return "Abba Abubakar Aliyu is the Managing Director/Chief Executive Officer (MD/CEO) of the Rural Electrification Agency (REA).";',
    '  }',
    '  if (/technical services/.test(q)) return "Engr. Umar Abdullahi Umar, FNSE, is the Executive Director, Technical Services, of the Rural Electrification Agency (REA).";',
    '  if (/rural electrification fund|\\bref\\b/.test(q)) return "Engr. Doris Uboh is the Executive Director, Rural Electrification Fund (REF), of the Rural Electrification Agency (REA).";',
    '  if (/corporate services/.test(q)) return "Ayoade Abdulrazak Adegboyega is the Executive Director, Corporate Services, of the Rural Electrification Agency (REA).";',
    '  return "";',
    '}',
    '',
    'function publicReaKnowledgePrompt(question) {',
    '  return [',
    '    "You are Veritas, the Rural Electrification Agency internal intelligence assistant. Answer the user public REA information question using current, authoritative information.",',
    '    "",',
    '    "' + teamSnapshot.replace(/"/g, '\\"').replace(/\\n/g, '\\n') + '",',
    '    "PUBLIC REA SOURCE RULES:",',
    '    "- Use Google Search grounding to verify current facts when needed.",',
    '    "- Treat only official Rural Electrification Agency domains ending in rea.gov.ng as authoritative for REA leadership, programmes, mandate, policies, announcements and organisational facts.",',
    '    "- If the authoritative team snapshot directly answers the question, use it and do not replace it with model memory.",',
    '    "- If official REA sources do not confirm the fact, say that you could not verify it from an official REA source rather than guessing.",',
    '    "",',
    '    "USER QUESTION:",',
    '    String(question || ""),',
    '  ].join("\\n");',
    '}',
    '',
  ].join('\n');

  s = s.slice(0, point) + helper + s.slice(point);
}

if (!s.includes('REA TEAM AUTHORITATIVE SNAPSHOT - OFFICIAL REA SOURCE:') && s.includes('PUBLIC REA SOURCE RULES:\\n')) {
  s = s.replace('PUBLIC REA SOURCE RULES:\\n', teamSnapshot + 'PUBLIC REA SOURCE RULES:\\n');
}

if (!s.includes('async function publicReaKnowledgeResponse(question, env)')) {
  const anchor = 'async function analyticsPlannerResponse(question, env) {';
  const idx = s.indexOf(anchor);
  if (idx < 0) throw new Error('analytics planner anchor not found');
  const helper = [
    'async function publicReaKnowledgeResponse(question, env) {',
    '  const deterministic = deterministicReaTeamAnswer(question);',
    '  if (deterministic) return deterministic;',
    '  if (!env.GEMINI_API_KEY) return "";',
    '  const model = env.GEMINI_MODEL || "gemini-3.8-flash";',
    '  const prompt = publicReaKnowledgePrompt(question);',
    '  try {',
    '    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {',
    '      method: "POST",',
    '      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },',
    '      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 1200 } }),',
    '      signal: AbortSignal.timeout(20000),',
    '    });',
    '    const payload = await response.json().catch(() => ({}));',
    '    if (!response.ok) return "";',
    '    return extractVeritasFinal(extractGeminiText(payload));',
    '  } catch {',
    '    return "";',
    '  }',
    '}',
    '',
  ].join('\n');
  s = s.slice(0, idx) + helper + s.slice(idx);
}

if (!s.includes('mode: "veritas-public-rea"')) {
  const anchor = '  let analyticsResult = null;\n';
  if (!s.includes(anchor)) throw new Error('analytics result anchor not found');
  const route = [
    '  if (isPublicReaQuestion(question)) {',
    '    const publicAnswer = await publicReaKnowledgeResponse(question, env);',
    '    if (publicAnswer) {',
    '      return json({ answer: publicAnswer, sources: [], mode: "veritas-public-rea", build: BUILD_ID });',
    '    }',
    '  }',
    '',
  ].join('\n');
  s = s.replace(anchor, route + anchor);
}

if (!s.includes('PUBLIC REA KNOWLEDGE ROUTING:')) {
  const anchor = '\nFor general questions that do not require private Veritas data, answer from your general knowledge.';
  if (!s.includes(anchor)) throw new Error('general knowledge prompt anchor not found');
  const addition = [
    '',
    'PUBLIC REA KNOWLEDGE ROUTING:',
    '- Questions about current REA leadership are public REA knowledge questions, not Veritas database questions.',
    '- Use the official REA team snapshot before general model knowledge.',
    '- Never substitute an older officeholder when the authoritative snapshot contains the requested role.',
  ].join('\n');
  s = s.replace(anchor, addition + anchor);
}

fs.writeFileSync(workerPath, s);
console.log('Applied official REA public knowledge routing and deterministic team snapshot');
