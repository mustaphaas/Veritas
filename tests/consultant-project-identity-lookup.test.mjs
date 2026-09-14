import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('worker/claims-api.js', 'utf8');

test('consultant project lookup derives a stable consultant id for the signed-in consultant', () => {
  assert.match(source, /consultantId/);
  assert.match(source, /FROM consultants c/);
  assert.match(source, /lower\(trim\(c\.firm_name\)\)=lower\(trim\(u\.consultant_firm\)\)/);
});

test('claim-backed consultant projects match by consultant id with normalized firm fallback', () => {
  assert.match(source, /consultant_id=\?/);
  assert.match(source, /lower\(trim\(consultant_firm\)\)=lower\(trim\(\?\)\)/);
});

test('canonical projects use normalized consultant firm matching', () => {
  assert.match(source, /FROM projects WHERE lower\(trim\(consultant_firm\)\)=lower\(trim\(\?\)\)/);
});
