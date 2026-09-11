import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-public-rea-team-r2";');

if (!s.includes('function isPublicReaQuestion(question)')) {
  const anchor = 'function isReportRequest(question) {';
  const start = s.indexOf(anchor);
  if (start < 0) throw new Error('report request detector anchor not found');
  const end = s.indexOf('\n}\n', start);
  if (end < 0) throw new Error('report request detector end not found');
  const point = end + 3;
  const helper = `\nfunction isPublicReaQuestion(question) {\n  const q = String(question || "").trim();\n  return /\\b(?:who is|who's|current|name of|what is|tell me about|when was|where is|leadership|management|managing director|md\\/?ceo|ceo|chairman|minister|programmes?|programs?|policy|policies|mandate|history|announcement|news|official)\\b/i.test(q) && /\\b(?:rea|rural electrification agency|managing director|md\\/?ceo)\\b/i.test(q);\n}\n\nfunction publicReaKnowledgePrompt(question) {\n  return \\`You are Veritas, the Rural Electrification Agency's internal intelligence assistant. Answer the user's PUBLIC REA information question using current, authoritative information.\\n\\nREA TEAM AUTHORITATIVE SNAPSHOT — OFFICIAL REA SOURCE:\\n- Primary source: https://rea.gov.ng/meet-the-team.html\\n- Managing Director/Chief Executive Officer (MD/CEO): Abba Abubakar Aliyu.\\n- Executive Director, Technical Services: Engr. Umar Abdullahi Umar, FNSE.\\n- Executive Director, Rural Electrification Fund (REF): Engr. Doris Uboh.\\n- Executive Director, Corporate Services: Ayoade Abdulrazak Adegboyega.\\n- For questions about these roles or people, this official REA team snapshot overrides model memory and older officeholder information.\\n- Never answer that Danjuma Maigida is the current REA MD/CEO.\\n- If the user asks for another current REA team member not listed in this snapshot, verify against the official REA Meet the Team page before answering.\\n\\nPUBLIC REA SOURCE RULES:\\n- Use Google Search grounding to verify current facts when needed.\\n- Treat only official Rural Electrification Agency domains ending in rea.gov.ng as authoritative for REA leadership, programmes, mandate, policies, announcements and organisational facts.\\n- Do not use the Veritas production database to answer public leadership or organisational questions unless the question explicitly asks about a Veritas system record.\\n- If the authoritative team snapshot above directly answers the question, use it. Do not replace it with model memory.\\n- If an official REA source confirms the answer, answer directly and concisely.\\n- If official REA sources do not confirm the fact, say that you could not verify it from an official REA source rather than guessing.\\n- For leadership questions, give the person's full name and official title when confirmed.\\n- Do not expose hidden reasoning, search planning or implementation details.\\n\\nFINAL ANSWER CONTRACT:\\n- Return only the finished user-facing answer between <VERITAS_FINAL> and </VERITAS_FINAL>.\\n\\nUSER QUESTION:\\n\\${question}\\`;\n}\n`;
  s = s.slice(0, point) + helper + s.slice(point);
}

// Upgrade existing public REA prompt with the official team snapshot if the routing function already exists.
if (!s.includes('REA TEAM AUTHORITATIVE SNAPSHOT — OFFICIAL REA SOURCE:')) {
  const promptAnchor = 'PUBLIC REA SOURCE RULES:\\n';
  if (!s.includes(promptAnchor)) throw new Error('public REA source rules anchor not found');
  const teamKnowledge = 'REA TEAM AUTHORITATIVE SNAPSHOT — OFFICIAL REA SOURCE:\\n- Primary source: https://rea.gov.ng/meet-the-team.html\\n- Managing Director/Chief Executive Officer (MD/CEO): Abba Abubakar Aliyu.\\n- Executive Director, Technical Services: Engr. Umar Abdullahi Umar, FNSE.\\n- Executive Director, Rural Electrification Fund (REF): Engr. Doris Uboh.\\n- Executive Director, Corporate Services: Ayoade Abdulrazak Adegboyega.\\n- For questions about these roles or people, this official REA team snapshot overrides model memory and older officeholder information.\\n- Never answer that Danjuma Maigida is the current REA MD/CEO.\\n- If the user asks for another current REA team member not listed in this snapshot, verify against the official REA Meet the Team page before answering.\\n\\n';
  s = s.replace(promptAnchor, teamKnowledge + promptAnchor);
}

if (!s.includes('async function publicReaKnowledgeResponse(question, env)')) {
  const anchor = 'async function analyticsPlannerResponse(question, env) {';
  const idx = s.indexOf(anchor);
  if (idx < 0) throw new Error('analytics planner anchor not found');
  const helper = `async function publicReaKnowledgeResponse(question, env) {\n  if (!env.GEMINI_API_KEY) return "";\n  const model = env.GEMINI_MODEL || "gemini-3.8-flash";\n  const prompt = publicReaKnowledgePrompt(question);\n  try {\n    const response = await fetch(\n      \\`https://generativelanguage.googleapis.com/v1beta/models/\\${encodeURIComponent(model)}:generateContent\\`,\n      {\n        method: "POST",\n        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },\n        body: JSON.stringify({\n          contents: [{ role: "user", parts: [{ text: prompt }] }],\n          tools: [{ google_search: {} }],\n          generationConfig: { maxOutputTokens: 1200 },\n        }),\n        signal: AbortSignal.timeout(20000),\n      },\n    );\n    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) {\n      console.error(JSON.stringify({ event: "veritas_public_rea_lookup_failure", status: response.status, build: BUILD_ID }));\n      return "";\n    }\n    return extractVeritasFinal(extractGeminiText(payload));\n  } catch (error) {\n    console.error(JSON.stringify({ event: "veritas_public_rea_lookup_error", message: error instanceof Error ? error.message : "Unknown error", build: BUILD_ID }));\n    return "";\n  }\n}\n\n`;
  s = s.slice(0, idx) + helper + s.slice(idx);
}

// Public REA organisational questions should be answered from current official REA sources before D1 analytics.
if (!s.includes('mode: "veritas-public-rea"')) {
  const anchor = '  let analyticsResult = null;\n';
  if (!s.includes(anchor)) throw new Error('analytics result anchor not found');
  const route = `  if (isPublicReaQuestion(question)) {\n    const publicAnswer = await publicReaKnowledgeResponse(question, env);\n    if (publicAnswer) {\n      return json({ answer: publicAnswer, sources: [], mode: "veritas-public-rea", build: BUILD_ID });\n    }\n  }\n\n`;
  s = s.replace(anchor, `${route}${anchor}`);
}

// Make the general prompt aware that public REA facts are not D1-only facts.
if (!s.includes('PUBLIC REA KNOWLEDGE ROUTING:')) {
  const anchor = '\nFor general questions that do not require private Veritas data, answer from your general knowledge.';
  if (!s.includes(anchor)) throw new Error('general knowledge prompt anchor not found');
  const addition = `\nPUBLIC REA KNOWLEDGE ROUTING:\n- Questions about current REA leadership, the Managing Director/CEO, organisational mandate, public programmes, official policies and public announcements are public REA knowledge questions, not Veritas database questions. Do not answer "not in the Veritas snapshot" merely because a public organisational fact is absent from D1. Such questions should be verified against official REA sources.\n- For current REA leadership, use the official team snapshot in the public REA knowledge prompt and never substitute an older officeholder from general model knowledge.\n`;
  s = s.replace(anchor, `${addition}${anchor}`);
}

fs.writeFileSync(workerPath, s);
console.log('Applied official REA public knowledge routing and team snapshot');
