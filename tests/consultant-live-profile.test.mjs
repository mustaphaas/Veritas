import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const portfolio = await readFile(new URL('../client/lib/use-consultant-portfolio.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../client/lib/field-api.ts', import.meta.url), 'utf8');

test('consultant portfolio loads authenticated profile from D1 instead of requiring browser-local consultant data', () => {
  assert.match(api, /fetchConsultantProfile\s*=\s*\(\)\s*=>\s*consultantCall\("\/profile"\)/);
  assert.match(portfolio, /fetchConsultantProfile/);
  assert.match(portfolio, /liveConsultant/);
  assert.match(portfolio, /const consultant=liveConsultant\?\?/);
});
