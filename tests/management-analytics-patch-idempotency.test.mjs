import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('scripts/patch-veritas-management-analytics.mjs', 'utf8');

test('management analytics patch recognizes an already-applied routing shape', () => {
  assert.match(source, /isManagementAnalysisQuestion\(question\)/);
  assert.match(source, /analytics response routing block not found/);
  assert.match(source, /analyticsResult && !isManagementAnalysisQuestion\(question\)/);
});
