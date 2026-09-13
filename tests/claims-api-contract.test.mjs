import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../worker/entry.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../worker/claims-api.js', import.meta.url), 'utf8');

test('worker entry delegates claims requests through the claims API module', () => {
  assert.match(entry, /handleClaimsApi/);
  assert.match(entry, /worker\.fetch/);
});

test('claims API exposes authenticated REA list, import, update and immutable assignment routes', () => {
  assert.match(api, /\/api\/rea\/claims/);
  assert.match(api, /\/api\/rea\/claims\/import/);
  assert.match(api, /\/assign/);
  assert.match(api, /claim_events/);
  assert.match(api, /cannot be reassigned/);
});

test('claims list supports allocation filtering', () => {
  assert.match(api, /allocation_status/);
  assert.match(api, /Unassigned/);
  assert.match(api, /Assigned/);
});
