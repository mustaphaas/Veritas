import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const patch = fs.readFileSync('scripts/patch-veritas-gemini-resilience.mjs', 'utf8');

test('Gemini resilience patch retries empty HTTP 200 completions', () => {
  assert.match(patch, /veritas_gemini_model_empty_completion/);
  assert.match(patch, /continue;/);
});

test('Gemini resilience patch preserves visible text parts with thought signatures', () => {
  assert.match(patch, /thoughtSignature/);
  assert.doesNotMatch(patch, /if \(part\?\.thoughtSignature\) continue/);
});

test('Gemini resilience patch configures built-in model fallbacks and low thinking', () => {
  assert.match(patch, /gemini-3\.8-flash/);
  assert.match(patch, /gemini-3\.7-flash/);
  assert.match(patch, /thinkingLevel: \\"low\\"/);
});
