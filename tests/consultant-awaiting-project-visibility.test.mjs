import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const patch = spawnSync(process.execPath, ['scripts/patch-consultant-coverage-map-full-portfolio.mjs'], { encoding: 'utf8' });
assert.equal(patch.status, 0, patch.stderr || patch.stdout || 'coverage-map patch failed');
const enhancer = fs.readFileSync('client/components/ConsultantCoverageMapEnhancer.tsx', 'utf8');

test('awaiting field-officer projects remain in the coverage list even without GPS', () => {
  assert.doesNotMatch(enhancer, /unallocatedProjects\s*\.filter\(\(project\) => Number\.isFinite\(project\.latitude\)/);
  assert.match(enhancer, /unallocatedProjects\s*\.map\(\(project\) =>/);
  assert.match(enhancer, /mapDisplayStatus: "Awaiting field officer"/);
});

test('map dots independently suppress records without valid coordinates', () => {
  assert.match(enhancer, /const coordinate = resolveCoordinate\(item\);\s*if \(!coordinate\) return null;/);
});
