import fs from 'node:fs';

const path = 'worker/index.js';
let s = fs.readFileSync(path, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-openrouter-model-fallbacks-r1";');

const primary = 'model: env.OPENROUTER_MODEL || "google/gemini-3.8-flash",';
const fallback = `${primary}\n          models: ["google/gemini-3.6-flash", "anthropic/claude-sonnet-4.6"],`;

let replacements = 0;
let idx = 0;
while ((idx = s.indexOf(primary, idx)) !== -1) {
  const after = s.slice(idx, idx + fallback.length + 100);
  if (!after.includes('models: ["google/gemini-3.6-flash", "anthropic/claude-sonnet-4.6"]')) {
    s = s.slice(0, idx) + fallback + s.slice(idx + primary.length);
    idx += fallback.length;
    replacements += 1;
  } else {
    idx += primary.length;
  }
}

const variableModel = '          model,\n          messages: [{ role: "user", content: prompt }],';
const variableFallback = '          model,\n          models: ["google/gemini-3.6-flash", "anthropic/claude-sonnet-4.6"],\n          messages: [{ role: "user", content: prompt }],';
if (s.includes(variableModel) && !s.includes(variableFallback)) {
  s = s.replace(variableModel, variableFallback);
  replacements += 1;
}

s = s.replaceAll(
  'provider: { allow_fallbacks: true, sort: "throughput" },',
  'provider: { allow_fallbacks: true, sort: "throughput", data_collection: "deny" },',
);

if (!s.includes('models: ["google/gemini-3.6-flash", "anthropic/claude-sonnet-4.6"]')) {
  throw new Error('OpenRouter model fallbacks were not inserted');
}

fs.writeFileSync(path, s);
console.log(`Applied OpenRouter fallback changes: ${replacements}`);
