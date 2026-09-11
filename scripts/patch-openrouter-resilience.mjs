import fs from 'node:fs';

const path = 'worker/index.js';
let s = fs.readFileSync(path, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-openrouter-gemini38-r2";');

s = s.replaceAll(
  'models: ["google/gemini-3.6-flash", "anthropic/claude-sonnet-4.6"]',
  'models: ["google/gemini-3.7-flash", "google/gemini-3.6-flash", "openrouter/free"]',
);

s = s.replaceAll(
  'model = env.GEMINI_MODEL || "gemini-3.6-flash";',
  'model = env.GEMINI_MODEL || "gemini-3.8-flash";',
);
s = s.replaceAll(
  'const model = env.GEMINI_MODEL || "gemini-3.6-flash";',
  'const model = env.GEMINI_MODEL || "gemini-3.8-flash";',
);

s = s.replaceAll(
  'generationConfig: { maxOutputTokens: 700, temperature: 0 },',
  'generationConfig: { maxOutputTokens: 700 },',
);
s = s.replaceAll(
  'generationConfig: { maxOutputTokens: 3000, temperature: 0.45 },',
  'generationConfig: { maxOutputTokens: 3000 },',
);

s = s.replaceAll(
  'provider: { allow_fallbacks: true, sort: "throughput" },',
  'provider: { allow_fallbacks: true, sort: "throughput", data_collection: "deny" },',
);

if (s.includes('anthropic/claude-sonnet-4.6')) throw new Error('Paid Claude fallback still present');
if (!s.includes('openrouter/free')) throw new Error('Free router fallback missing');
if (!s.includes('gemini-3.8-flash')) throw new Error('Gemini 3.8 fallback missing');

fs.writeFileSync(path, s);
console.log('Updated OpenRouter and Gemini fallback compatibility');
