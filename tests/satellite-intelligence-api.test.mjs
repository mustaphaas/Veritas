import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const apiPath = "worker/satellite-api.js";

test("satellite api uses authoritative D1 project coordinates", () => {
  assert.equal(fs.existsSync(apiPath), true, `${apiPath} must exist`);
  const source = fs.readFileSync(apiPath, "utf8");
  assert.match(source, /SELECT[\s\S]*latitude[\s\S]*longitude[\s\S]*FROM projects[\s\S]*WHERE id=\?/);
  assert.match(source, /validProjectCoordinate/);
  assert.doesNotMatch(source, /body\.latitude|body\.longitude/);
});

test("satellite api supports current and historical Esri imagery", () => {
  const source = fs.readFileSync(apiPath, "utf8");
  assert.match(source, /World_Imagery\/MapServer\/tile/);
  assert.match(source, /waybackconfig\.json/);
  assert.match(source, /metadataLayerUrl/);
  assert.match(source, /SRC_DATE2/);
  assert.match(source, /releaseDate/);
  assert.match(source, /captureDate/);
});

test("satellite api persists auditable findings without changing verification state", () => {
  const source = fs.readFileSync(apiPath, "utf8");
  assert.match(source, /INSERT INTO satellite_analysis_runs/);
  assert.match(source, /satellite-analysis-run/);
  assert.match(source, /satellite-analysis-reviewed/);
  assert.match(source, /manual review/i);
  assert.doesNotMatch(source, /UPDATE projects SET verified/);
  assert.doesNotMatch(source, /UPDATE assignments SET status='Verified'/);
});

test("satellite api exposes role-safe routes and multimodal analysis", () => {
  const source = fs.readFileSync(apiPath, "utf8");
  assert.match(source, /\/api\/projects\/.*satellite-analysis/);
  assert.match(source, /historical_compare/);
  assert.match(source, /consultant_admin/);
  assert.match(source, /rea_admin/);
  assert.match(source, /field_officer/);
  assert.match(source, /GEMINI_API_KEY/);
  assert.match(source, /OPENROUTER_API_KEY/);
  assert.match(source, /inlineData|image_url/);
});
