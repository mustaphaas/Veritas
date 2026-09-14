import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const patch = spawnSync(process.execPath, ['scripts/patch-consultant-coverage-map-full-portfolio.mjs'], { encoding: 'utf8' });
assert.equal(patch.status, 0, patch.stderr || patch.stdout || 'coverage map patch failed');

const enhancer = fs.readFileSync('client/components/ConsultantCoverageMapEnhancer.tsx', 'utf8');

test('allocated consultant project map records expose an awaiting-field-officer display state', () => {
  assert.match(enhancer, /officer: "Awaiting field officer"/);
  assert.match(enhancer, /mapDisplayStatus: "Awaiting field officer"/);
});

test('map status rendering prefers explicit consultant allocation display state', () => {
  assert.match(enhancer, /function assignmentStatusLabel/);
  assert.match(enhancer, /mapDisplayStatus \?\? getAssignmentDisplayStatus\(item\.status\)/);
});
