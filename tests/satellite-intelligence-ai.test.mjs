import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const patchPath = "scripts/patch-satellite-intelligence-ai.mjs";

test("Veritas AI receives bounded satellite intelligence context", () => {
  assert.equal(fs.existsSync(patchPath), true, `${patchPath} must exist`);
  const source = fs.readFileSync(patchPath, "utf8");
  assert.match(source, /satelliteIntelligence/);
  assert.match(source, /manualReview/);
  assert.match(source, /averageConfidence/);
  assert.match(source, /recentFindings/);
  assert.match(source, /LIMIT 120/);
});

test("AI prompt separates recorded facts from model observations", () => {
  const source = fs.readFileSync(patchPath, "utf8");
  assert.match(source, /provider facts/i);
  assert.match(source, /model observations/i);
  assert.match(source, /human review/i);
  assert.match(source, /fraud/i);
  assert.match(source, /non-existence/i);
  assert.match(source, /completion/i);
});
