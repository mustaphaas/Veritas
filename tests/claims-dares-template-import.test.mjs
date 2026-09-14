import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../client/lib/claims-import.ts', import.meta.url), 'utf8');

const expectedMappings = [
  "externalidserialno:'claimId'",
  "locationstate:'state'",
  "locationlga:'lga'",
  "contractordeveloper:'contractor'",
  "retailcostofsystemngn:'claimAmount'",
  "paymentdate:'claimDate'",
];

for (const mapping of expectedMappings) {
  test(`supports DARES header mapping ${mapping}`, () => {
    assert.ok(source.includes(mapping), `Missing DARES import mapping: ${mapping}`);
  });
}
