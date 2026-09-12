import fs from 'node:fs';

const workerPath = 'worker/index.js';
let s = fs.readFileSync(workerPath, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-gemini-output-r2";');

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
const alreadyResilient = s.includes('veritas_gemini_model_empty_completion');
if (s.includes(okBlock)) {
  const resilientOkBlock = [
    '      if (response.ok) {',
    '        const visibleText = extractGeminiText(payload);',
    '        if (visibleText) return { ok: true, model, payload };',
    '        lastStatus = 200;',
    '        lastFinishReason = payload?.candidates?.[0]?.finishReason || null;',
    '        lastBlockReason = payload?.promptFeedback?.blockReason || null;',
    '        lastMessage = "Gemini returned HTTP 200 without visible answer text.";',
    '        console.error(JSON.stringify({',
    '          event: "veritas_gemini_model_empty_completion",',
    '          model,',
    '          status: 200,',
    '          finishReason: lastFinishReason,',
    '          blockReason: lastBlockReason,',
    '          candidateCount: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,',
    '          usageMetadata: payload?.usageMetadata || null,',
    '          build: BUILD_ID,',
    '        }));',
    '        continue;',
    '      }',
  ].join('\n');
  s = s.replace(okBlock, resilientOkBlock);
} else if (alreadyResilient) {
  // The checked-in worker can already contain this patch. Never redeclare
  // diagnostic state when CI reapplies the patch before deployment.
  if (!s.includes('let lastFinishReason = null;')) {
    s = s.replace('  let lastMessage = "Veritas AI service is currently unavailable.";\n', '  let lastMessage = "Veritas AI service is currently unavailable.";\n  let lastFinishReason = null;\n  let lastBlockReason = null;\n');
  }
  s = s.replace('        const finishReason = payload?.candidates?.[0]?.finishReason || null;\n        const blockReason = payload?.promptFeedback?.blockReason || null;\n', '        lastFinishReason = payload?.candidates?.[0]?.finishReason || null;\n        lastBlockReason = payload?.promptFeedback?.blockReason || null;\n');
  s = s.replace('          finishReason,\n          blockReason,\n', '          finishReason: lastFinishReason,\n          blockReason: lastBlockReason,\n          usageMetadata: payload?.usageMetadata || null,\n');
} else {
  throw new Error('Gemini success block not found');
}

// Ensure diagnostic state exists for the resilient path.
if (!s.includes('let lastFinishReason = null;')) {
  s = s.replace('  let lastMessage = "Veritas AI service is currently unavailable.";\n', '  let lastMessage = "Veritas AI service is currently unavailable.";\n  let lastFinishReason = null;\n  let lastBlockReason = null;\n');
}

// Return completion diagnostics with the final fallback result.
s = s.replace(
  '  return { ok: false, model: models[models.length - 1], status: lastStatus, message: lastMessage };',
  '  return { ok: false, model: models[models.length - 1], status: lastStatus, message: lastMessage, finishReason: lastFinishReason, blockReason: lastBlockReason };',
);

// Give Gemini reports more visible-output headroom while keeping ordinary answers compact.
if (!s.includes('const geminiOutputTokenBudget =')) {
  s = s.replace(
    '  const outputTokenBudget = responseTokenBudget(question);',
    '  const outputTokenBudget = responseTokenBudget(question);\n  const geminiOutputTokenBudget = isReportRequest(question) ? 8192 : outputTokenBudget;',
  );
}
s = s.replaceAll(
  'generationConfig: { maxOutputTokens: outputTokenBudget },',
  'generationConfig: { maxOutputTokens: geminiOutputTokenBudget, thinkingConfig: { thinkingLevel: "low" } },',
);
s = s.replaceAll(
  'generationConfig: { maxOutputTokens: outputTokenBudget, thinkingConfig: { thinkingLevel: "low" } },',
  'generationConfig: { maxOutputTokens: geminiOutputTokenBudget, thinkingConfig: { thinkingLevel: "low" } },',
);

// Surface safe completion diagnostics in the final provider debug object when available.
if (!s.includes('const geminiFinishReason = result.finishReason || null;')) {
  s = s.replace(
    '    geminiMessage = result.ok ? "" : result.message;',
    '    geminiMessage = result.ok ? "" : result.message;\n    const geminiFinishReason = result.finishReason || null;\n    const geminiBlockReason = result.blockReason || null;',
  );
}
s = s.replace(
  '        gemini: { status: geminiStatus, message: geminiMessage, model },',
  '        gemini: { status: geminiStatus, message: geminiMessage, model, finishReason: typeof geminiFinishReason !== "undefined" ? geminiFinishReason : null, blockReason: typeof geminiBlockReason !== "undefined" ? geminiBlockReason : null },',
);

if (s.includes('if (part?.thoughtSignature) continue;')) throw new Error('Gemini text parser still drops thoughtSignature text parts');
if (!s.includes('veritas_gemini_model_empty_completion')) throw new Error('Gemini empty completion fallback missing');
if (!s.includes('builtInFallbacks = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"]')) throw new Error('Gemini built-in fallback list missing');
if (!s.includes('thinkingConfig: { thinkingLevel: "low" }')) throw new Error('Gemini low-thinking report configuration missing');
if (!s.includes('const geminiOutputTokenBudget = isReportRequest(question) ? 8192 : outputTokenBudget;')) throw new Error('Gemini report output budget missing');
if (!s.includes('lastFinishReason')) throw new Error('Gemini finishReason diagnostics missing');
if (!s.includes('lastBlockReason')) throw new Error('Gemini blockReason diagnostics missing');

fs.writeFileSync(workerPath, s);
console.log('Applied Gemini output-generation resilience, report budget, and completion diagnostics');