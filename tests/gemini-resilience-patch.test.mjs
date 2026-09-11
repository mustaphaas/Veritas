import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const patch = fs.readFileSync('scripts/patch-veritas-gemini-resilience.mjs', 'utf8');

test('Gemini resilience patch retries empty HTTP 200 completions', () => {
  assert.match(patch, /veritas_gemini_model_empty_completion/);
  assert.match(patch, /visibleText/);
  assert.match(patch, /continue;/);
});

test('Gemini resilience patch removes the worker rule that drops thought-signature text', () => {
  assert.match(patch, /s = s\.replace\('      if \(part\?\.thoughtSignature\) continue;/);
  assert.match(patch, /Gemini text parser still drops thoughtSignature text parts/);
});

test('Gemini resilience patch configures built-in model fallbacks and low thinking', () => {
  assert.match(patch, /builtInFallbacks/);
  assert.match(patch, /gemini-3\.8-flash/);
  assert.match(patch, /gemini-3\.7-flash/);
  assert.match(patch, /thinkingConfig: \{ thinkingLevel: "low" \}/);
});
