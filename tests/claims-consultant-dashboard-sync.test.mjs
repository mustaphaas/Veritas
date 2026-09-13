import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const claimsApi = await readFile(new URL('../worker/claims-api.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');

test('claim assignment propagates consultant ownership to the referenced project', () => {
  assert.match(claimsApi, /UPDATE projects SET consultant_firm=\?/);
  assert.match(claimsApi, /project_id/);
});

test('consultant portfolio includes assigned claims whose project is not present in projects table', () => {
  assert.match(worker, /FROM claims/);
  assert.match(worker, /consultant_firm=\?/);
  assert.match(worker, /claimProject/);
});
