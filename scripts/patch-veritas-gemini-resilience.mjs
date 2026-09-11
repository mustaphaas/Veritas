import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

// Do not discard a normal text part merely because Gemini attached a thought signature.
s = s.replace('      if (part?.thoughtSignature) continue;\n', '');

// Always retain production-safe Gemini fallbacks, even when GEMINI_MODEL is explicitly configured.
const modelsStart = s.indexOf('function geminiModelsToTry(env) {');
const modelsEnd = modelsStart >= 0 ? s.indexOf('\n}\n\n// Calls Gemini', modelsStart) : -1;
if (modelsStart < 0 || modelsEnd < 0) throw new Error('geminiModelsToTry block not found');
const modelsReplacement = [
  'function geminiModelsToTry(env) {',
  '  const primary = env.GEMINI_MODEL || "gemini-3.8-flash";',
  '  const configuredFallbacks = String(env.GEMINI_MODEL_FALLBACKS || "")',
  '    .split(",")',
  '    .map((m) => m.trim())',
  '    .filter(Boolean);',
  '  const builtInFallbacks = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];',
  '  return [...new Set([primary, ...configuredFallbacks, ...builtInFallbacks])];',
  '}',
].join('\n');
s = s.slice(0, modelsStart) + modelsReplacement + s.slice(modelsEnd + 2);

// A Gemini HTTP 200 is not a successful completion unless it contains visible text.
const okBlock = [
  '      if (response.ok) {',
  '        return { ok: true, model, payload };',
  '      }',
].join('\n');
if (!s.includes(okBlock)) throw new Error('Gemini success block not found');
const resilientOkBlock = [
  '      if (response.ok) {',
  '        const visibleText = extractGeminiText(payload);',
  '        if (visibleText) return { ok: true, model, payload };',
  '        lastStatus = 200;',
  '        const finishReason = payload?.candidates?.[0]?.finishReason || null;',
  '        const blockReason = payload?.promptFeedback?.blockReason || null;',
  '        lastMessage = "Gemini returned HTTP 200 without visible answer text.";',
  '        console.error(JSON.stringify({',
  '          event: "veritas_gemini_model_empty_completion",',
  '          model,',
  '          status: 200,',
  '          finishReason,',
  '          blockReason,',
  '          candidateCount: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,',
  '          build: BUILD_ID,',
  '        }));',
  '        continue;',
  '      }',
].join('\n');
s = s.replace(okBlock, resilientOkBlock);

// Reduce hidden reasoning consumption so report requests reliably leave room for visible output.
s = s.replaceAll(
  'generationConfig: { maxOutputTokens: outputTokenBudget },',
  'generationConfig: { maxOutputTokens: outputTokenBudget, thinkingConfig: { thinkingLevel: "low" } },',
);

if (s.includes('if (part?.thoughtSignature) continue;')) throw new Error('Gemini text parser still drops thoughtSignature text parts');
if (!s.includes('veritas_gemini_model_empty_completion')) throw new Error('Gemini empty completion fallback missing');
if (!s.includes('builtInFallbacks = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"]')) throw new Error('Gemini built-in fallback list missing');
if (!s.includes('thinkingConfig: { thinkingLevel: "low" }')) throw new Error('Gemini low-thinking report configuration missing');

fs.writeFileSync(workerPath, s);
console.log('Applied Gemini empty-response resilience and model fallback handling');
