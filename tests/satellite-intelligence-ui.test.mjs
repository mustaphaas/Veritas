import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const mapPath = "client/components/ProjectMapSatelliteEnhancer.tsx";
const clientPath = "client/lib/satellite-intelligence.ts";

test("project map exposes satellite intelligence panel", () => {
  assert.equal(fs.existsSync(clientPath), true, `${clientPath} must exist`);
  const source = fs.readFileSync(mapPath, "utf8");
  const client = fs.readFileSync(clientPath, "utf8");
  assert.match(source, /Satellite Intelligence/);
  assert.match(source, /Analyse latest imagery/);
  assert.match(source, /Compare historical imagery/);
  assert.match(source, /Manual review required/);
  assert.match(source, /selectedSatelliteProject/);
  assert.match(client, /fetchSatelliteAnalyses/);
  assert.match(client, /runSatelliteAnalysis/);
  assert.match(client, /compareSatelliteImagery/);
  assert.match(client, /reviewSatelliteAnalysis/);
});

test("satellite intelligence UI shows provenance and confidence", () => {
  const source = fs.readFileSync(mapPath, "utf8");
  assert.match(source, /capture date/i);
  assert.match(source, /release date/i);
  assert.match(source, /confidence/i);
  assert.match(source, /provider/i);
  assert.doesNotMatch(source, /Verify project from satellite|Reject project from satellite/i);
});
