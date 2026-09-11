import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-hide-reasoning-r1";');

const geminiStart = s.indexOf('function extractGeminiText(payload) {');
const geminiEnd = s.indexOf('\n}\n\nfunction extractOpenRouterText', geminiStart);
if (geminiStart < 0 || geminiEnd < 0) throw new Error('extractGeminiText block not found');
const geminiReplacement = [
  'function extractGeminiText(payload) {',
  '  const parts = [];',
  '  for (const candidate of payload?.candidates || []) {',
  '    for (const part of candidate?.content?.parts || []) {',
  '      if (part?.thought === true) continue;',
  '      if (part?.thoughtSignature) continue;',
  '      if (typeof part?.text === "string" && part.text.trim()) parts.push(part.text.trim());',
  '    }',
  '  }',
  '  return parts.join("\\n\\n").trim();',
  '}'
].join('\n');
s = s.slice(0, geminiStart) + geminiReplacement + s.slice(geminiEnd + 2);

const openStart = s.indexOf('function extractOpenRouterText(payload) {');
const openEnd = s.indexOf('\n}\n\nfunction isLikelyAnalyticsQuestion', openStart);
if (openStart < 0 || openEnd < 0) throw new Error('extractOpenRouterText block not found');
const openReplacement = [
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
s = s.slice(0, openStart) + openReplacement + s.slice(openEnd + 2);

fs.writeFileSync(workerPath, s);
console.log('Removed model reasoning/thought exposure from Veritas responses');
