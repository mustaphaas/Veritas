import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const claimsApi = await readFile(new URL('../worker/claims-api.js', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.js', import.meta.url), 'utf8');

test('claim assignment propagates consultant ownership to the referenced project', () => {
  assert.match(claimsApi, /UPDATE projects SET consultant_firm=\?/);
  assert.match(claimsApi, /project_id/);
});

test('consultant portfolio includes assigned claims whose project is not present in projects table', () => {
  assert.match(claimsApi, /consultantProjectsFromClaims/);
  assert.match(claimsApi, /FROM claims/);
  assert.match(claimsApi, /consultant_firm=\?/);
  assert.match(claimsApi, /claimProject/);
  assert.match(entry, /handleClaimsApi/);
});
