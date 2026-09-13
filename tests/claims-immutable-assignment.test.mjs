import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../worker/claims-api.js', import.meta.url), 'utf8');
const component = await readFile(new URL('../client/components/ReaClaimsManagement.tsx', import.meta.url), 'utf8');

test('claims assignment is immutable at the database boundary', () => {
  assert.match(api, /allocationStatus === 'Assigned'/);
  assert.match(api, /cannot be reassigned/);
  assert.match(api, /WHERE id=\? AND allocation_status='Unassigned' AND consultant_id IS NULL AND consultant_firm IS NULL/);
  assert.doesNotMatch(api, /consultant_id=NULL/);
});

test('claim imports start unassigned and are persisted to D1', () => {
  assert.match(api, /'Unassigned','Uploaded'/);
  assert.match(api, /env\.DB\.batch/);
  assert.match(api, /source_reference/);
});

test('claims UI must not use localStorage as claims authority', () => {
  assert.doesNotMatch(component, /veritas-rea-dares-claims-v2/);
  assert.doesNotMatch(component, /localStorage\.setItem\(storageKey/);
  assert.match(component, /listClaimsApi/);
  assert.match(component, /assignClaimApi/);
});
