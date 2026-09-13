import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const visiblePatch = spawnSync(process.execPath, ['scripts/patch-consultant-projects-visible.mjs'], { encoding: 'utf8' });
assert.equal(visiblePatch.status, 0, visiblePatch.stderr || visiblePatch.stdout || 'consultant project visibility patch failed');
const mapPatch = spawnSync(process.execPath, ['scripts/patch-consultant-map-allocated-projects.mjs'], { encoding: 'utf8' });
assert.equal(mapPatch.status, 0, mapPatch.stderr || mapPatch.stdout || 'consultant map project patch failed');
const dashboard = fs.readFileSync('client/pages/ConsultantAdminDashboard.tsx', 'utf8');

test('consultant map includes REA-allocated projects before field assignment', () => {
  assert.match(dashboard, /const mapPortfolio = useMemo/);
  assert.match(dashboard, /unallocatedProjects\.map\(\(project\)/);
  assert.match(dashboard, /latitude: project\.latitude/);
  assert.match(dashboard, /longitude: project\.longitude/);
  assert.match(dashboard, /status: "Awaiting field officer"/);
});

test('consultant map marker is driven by selected portfolio project coordinates', () => {
  assert.match(dashboard, /mapPortfolio\.find\(\(item\) => item\.id === selectedMapProjectId\)/);
  assert.match(dashboard, /mapTarget\.longitude - 0\.045/);
  assert.match(dashboard, /mapTarget\.latitude - 0\.035/);
  assert.match(dashboard, /setSelectedMapProjectId\(item\.id\)/);
});
