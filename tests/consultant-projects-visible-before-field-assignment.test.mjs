import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const patch = spawnSync(process.execPath, ['scripts/patch-consultant-projects-visible.mjs'], { encoding: 'utf8' });
assert.equal(patch.status, 0, patch.stderr || patch.stdout || 'consultant project visibility patch failed');
const dashboard = fs.readFileSync('client/pages/ConsultantAdminDashboard.tsx', 'utf8');

test('consultant Projects workspace renders REA-allocated projects before field-officer assignment', () => {
  assert.match(dashboard, /function ConsultantWorkspace\([\s\S]*unallocatedProjects/);
  assert.match(dashboard, /view === "Projects"[\s\S]*unallocatedProjects\.map/);
  assert.match(dashboard, /Awaiting field officer/);
  assert.match(dashboard, /unallocatedProjects=\{unallocatedProjects\}/);
});

test('consultant portfolio metric counts allocated projects even before field assignment', () => {
  assert.match(dashboard, /portfolioProjectCount/);
  assert.match(dashboard, /value=\{portfolioProjectCount\}/);
});
