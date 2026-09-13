import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../client/pages/ConsultantAdminDashboard.tsx', import.meta.url), 'utf8');

test('consultant Projects workspace renders REA-allocated projects before field-officer assignment', () => {
  assert.match(dashboard, /function ConsultantWorkspace\([\s\S]*unallocatedProjects/);
  assert.match(dashboard, /view === \\"Projects\\"[\s\S]*unallocatedProjects\.map/);
  assert.match(dashboard, /Awaiting field officer/);
  assert.match(dashboard, /unallocatedProjects=\{unallocatedProjects\}/);
});

test('consultant portfolio metric counts allocated projects even before field assignment', () => {
  assert.match(dashboard, /portfolioProjectCount/);
  assert.match(dashboard, /value=\{portfolioProjectCount\}/);
});
