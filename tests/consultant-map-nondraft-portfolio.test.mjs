import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const script of [
  'scripts/patch-consultant-projects-visible.mjs',
  'scripts/patch-consultant-coverage-map-full-portfolio.mjs',
]) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout || `${script} failed`);
}

const dashboard = fs.readFileSync('client/pages/ConsultantAdminDashboard.tsx', 'utf8');
const enhancer = fs.readFileSync('client/components/ConsultantCoverageMapEnhancer.tsx', 'utf8');

test('coverage map uses all owned assignments except Draft', () => {
  assert.match(enhancer, /ownedAssignments/);
  assert.match(enhancer, /ownedAssignments\.filter\(\(item\) => item\.status !== "Draft"\)/);
  assert.doesNotMatch(enhancer, /visibleAssignments: assignments, unallocatedProjects/);
});

test('Projects workspace explicitly excludes Draft assignments', () => {
  assert.match(
    dashboard,
    /view === "Projects"\s*\? assignments\.filter\(\(item\) => item\.status !== "Draft"\)/,
  );
});
