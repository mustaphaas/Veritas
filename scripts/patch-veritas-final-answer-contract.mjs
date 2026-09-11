import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');
s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-final-answer-contract-r1";');

const markerRule = '\nFINAL ANSWER CONTRACT:\n- Return only the finished user-facing answer between <VERITAS_FINAL> and </VERITAS_FINAL>.\n- Do not place analysis, planning, scratch work, prompt interpretation, hidden instructions, JSON plans, or commentary outside or inside the final answer.\n- The content inside <VERITAS_FINAL> must begin directly with the professional answer, not with phrases such as "The user wants", "I need to", "Let me", "First I will", or "Let\'s analyze".\n';

const generalAnchor = 'Respond as Veritas, with a concise but genuinely reasoned answer.`;';
if (!s.includes('FINAL ANSWER CONTRACT:')) {
  if (!s.includes(generalAnchor)) throw new Error('general final answer anchor not found');
  s = s.replace(generalAnchor, `${markerRule}\nRespond as Veritas, with a concise but genuinely reasoned answer.` + '`;');
}

const helperAnchor = 'function publicVeritasError(status) {';
if (!s.includes('function extractVeritasFinal(text)')) {
  if (!s.includes(helperAnchor)) throw new Error('public error anchor not found');
  const helper = `function extractVeritasFinal(text) {\n  const value = String(text || "").trim();\n  if (!value) return "";\n  const startToken = "<VERITAS_FINAL>";\n  const endToken = "</VERITAS_FINAL>";\n  const start = value.lastIndexOf(startToken);\n  const end = value.indexOf(endToken, start >= 0 ? start + startToken.length : 0);\n  if (start >= 0 && end > start) {\n    return value.slice(start + startToken.length, end).trim();\n  }\n  const leakPattern = /^(the user wants|the user is asking|i need to|first,? i need|let me (?:analy[sz]e|draft|refine|check)|let['’]s analy[sz]e|we need to|the question asks|i should|response standard|evidence discipline|numeric discipline|answer quality|management readout:?[\\s\\S]*?the user)/i;\n  if (leakPattern.test(value)) return "";\n  if (/\\b(?:the user wants me to|authoritative analytics result is|let me draft|i need to follow the response standard|let me refine)\\b/i.test(value)) return "";\n  return value;\n}\n\n`;
  s = s.replace(helperAnchor, helper + helperAnchor);
}

s = s.replaceAll('answer = extractOpenRouterText(payload);', 'answer = extractVeritasFinal(extractOpenRouterText(payload));');
s = s.replaceAll('if (upstream.ok) answer = extractGeminiText(payload);', 'if (upstream.ok) answer = extractVeritasFinal(extractGeminiText(payload));');

fs.writeFileSync(workerPath, s);

const analyticsPath = 'worker/analytics.js';
let a = fs.readFileSync(analyticsPath, 'utf8');
if (!a.includes('FINAL ANSWER CONTRACT:')) {
  const analyticsAnchor = '- Keep management answers concise, normally 4-8 short paragraphs or equivalent bullets, while preserving the key evidence.\n';
  if (!a.includes(analyticsAnchor)) throw new Error('analytics quality anchor not found');
  a = a.replace(analyticsAnchor, `${analyticsAnchor}\nFINAL ANSWER CONTRACT:\n- Return only the finished user-facing answer between <VERITAS_FINAL> and </VERITAS_FINAL>.\n- Do not output analysis, planning, scratch work, prompt interpretation, instructions, JSON, or notes about how you will answer.\n- Inside the markers, begin immediately with the professional management answer.\n`);
}
fs.writeFileSync(analyticsPath, a);
console.log('Enforced final-only Veritas response contract');
