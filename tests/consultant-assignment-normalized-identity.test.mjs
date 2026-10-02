import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Static guard. Behavioural coverage lives in tenant-fail-closed.test.mjs and assignment-tenant-isolation.test.mjs.
// (This file used to spawn scripts/patch-consultant-assignment-normalized-identity.mjs, a one-shot migration
// whose anchors no longer exist now that scoping is centralised in assignmentScope().)
const fieldApi = fs.readFileSync('worker/field-api.js', 'utf8');

test('consultant assignment scoping normalizes consultant firm matching', () => {
  assert.match(fieldApi, /lower\(trim\(p\.consultant_firm\)\)=lower\(trim\(\?\)\)/);
});

test('assignment reads share one deny-by-default scope used by both list and by-id lookups', () => {
  assert.match(fieldApi, /function assignmentScope\(user\)/);
  assert.match(fieldApi, /async function assignedRecord[\s\S]*?assignmentScope\(user\)[\s\S]*?if \(!scope\) return null/);
  assert.match(fieldApi, /async function listAssignments[\s\S]*?assignmentScope\(user\)[\s\S]*?if \(!scope\) return response\(/);
});
