import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const enhancer = fs.readFileSync('client/components/ConsultantCoverageMapEnhancer.tsx', 'utf8');
const mapData = fs.readFileSync('client/lib/rea-project-map-data.ts', 'utf8');
const dashboardData = fs.readFileSync('client/lib/dashboard-data.ts', 'utf8');

test('consultant coverage enhancer consumes all owned non-draft assignments plus allocated projects', () => {
  assert.match(enhancer, /const \{ ownedAssignments, unallocatedProjects \} = useConsultantPortfolio\(\)/);
  assert.match(enhancer, /ownedAssignments\.filter\(\(item\) => item\.status !== "Draft"\)/);
  assert.match(enhancer, /const mapAssignments = useMemo/);
  assert.match(enhancer, /unallocatedProjects[\s\S]*?\.map\(\(project\)/);
  assert.match(enhancer, /return \[\.\.\.allocated, \.\.\.assignments\]/);
  assert.match(enhancer, /<ConsultantCoverageMap assignments=\{mapAssignments\}/);
});

test('dashboard project conversion preserves map identity and location metadata', () => {
  assert.match(dashboardData, /id\?: string/);
  assert.match(dashboardData, /lga\?: string/);
  assert.match(dashboardData, /community\?: string/);
  assert.match(mapData, /id: record\.id/);
  assert.match(mapData, /lga: record\.lga/);
  assert.match(mapData, /community: record\.community/);
});
