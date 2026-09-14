import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const patch = spawnSync(process.execPath, ['scripts/patch-consultant-assignment-normalized-identity.mjs'], { encoding: 'utf8' });
assert.equal(patch.status, 0, patch.stderr || patch.stdout || 'consultant assignment normalization patch failed');
const fieldApi = fs.readFileSync('worker/field-api.js', 'utf8');

test('consultant assignment listing normalizes consultant firm matching', () => {
  assert.match(fieldApi, /lower\(trim\(p\.consultant_firm\)\)=lower\(trim\(\?\)\)/);
});

test('consultant assigned-record lookup normalizes consultant firm matching', () => {
  assert.match(fieldApi, /user\.role === "consultant_admin" \? "AND lower\(trim\(p\.consultant_firm\)\)=lower\(trim\(\?\)\)"/);
});
