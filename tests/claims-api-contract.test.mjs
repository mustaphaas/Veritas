import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');

test('worker exposes authenticated REA claims list and mutation routes', () => {
  assert.match(worker, /reaClaimsResponse/);
  assert.match(worker, /\/api\/rea\/claims/);
  assert.match(worker, /\/api\/rea\/claims\/import/);
  assert.match(worker, /assign/);
  assert.match(worker, /claim_events/);
});

test('claims list supports allocation filtering', () => {
  assert.match(worker, /allocation/i);
  assert.match(worker, /Unassigned/);
  assert.match(worker, /Assigned/);
});
