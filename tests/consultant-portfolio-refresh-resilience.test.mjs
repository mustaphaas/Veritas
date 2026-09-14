import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('client/lib/use-consultant-portfolio.ts', 'utf8');

test('consultant live refresh isolates endpoint failures instead of clearing the whole portfolio', () => {
  assert.match(source, /Promise\.allSettled\(/);
  assert.match(source, /profileResult\.status === "fulfilled"/);
  assert.match(source, /projectsResult\.status === "fulfilled"/);
  assert.match(source, /assignmentsResult\.status === "fulfilled"/);
  assert.doesNotMatch(
    source,
    /\.catch\([^)]*=>\{[^}]*setLiveConsultant\(null\)[^}]*setLiveFieldOfficers\(null\)[^}]*setLiveAssignments\(null\)[^}]*setLiveProjects\(null\)/s,
  );
});

test('successful project refresh can update projects independently', () => {
  assert.match(source, /if\(projectsResult\.status === "fulfilled"\)setLiveProjects\(projectsResult\.value\)/);
});
