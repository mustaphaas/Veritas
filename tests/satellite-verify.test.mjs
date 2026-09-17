import test from "node:test";
import assert from "node:assert/strict";
import {
  bboxAround,
  esriExportUrl,
  parseVerdict,
  handleSatelliteVerify,
} from "../worker/satellite-verify.js";

test("bboxAround produces a symmetric box that widens longitude away from the equator", () => {
  const equator = bboxAround(0, 8, 150);
  const dLonEquator = equator[2] - equator[0];

  const farNorth = bboxAround(60, 8, 150);
  const dLonFarNorth = farNorth[2] - farNorth[0];

  assert.ok(dLonFarNorth > dLonEquator, "longitude span should widen at higher latitude for the same metre radius");
  assert.ok(equator[3] - equator[1] > 0, "latitude span should be positive");
});

test("esriExportUrl targets the Esri World Imagery MapServer export endpoint", () => {
  const url = esriExportUrl(9.05, 7.4, 150);
  assert.match(url, /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export\?/);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("f"), "image");
  assert.equal(parsed.searchParams.get("bboxSR"), "4326");
  assert.equal(parsed.searchParams.get("format"), "png32");
  assert.ok(parsed.searchParams.get("bbox").split(",").length === 4);
});

test("parseVerdict reads a clean JSON verdict and clamps confidence to [0,1]", () => {
  const verdict = parseVerdict(
    '{"infrastructureDetected":"present","imageQuality":"clear","confidence":1.4,"estimatedNearbyHouses":12.6,"notes":"Solar array and poles visible."}',
  );
  assert.deepEqual(verdict, {
    status: "present",
    imageQuality: "clear",
    confidence: 1,
    estimatedNearbyHouses: 13,
    notes: "Solar array and poles visible.",
  });
});

test("parseVerdict strips markdown fences and stray text around the JSON object", () => {
  const verdict = parseVerdict('Here you go:\n```json\n{"infrastructureDetected":"absent","imageQuality":"clear","confidence":0.2,"estimatedNearbyHouses":0,"notes":"No structures visible."}\n```');
  assert.equal(verdict.status, "absent");
  assert.equal(verdict.confidence, 0.2);
  assert.equal(verdict.estimatedNearbyHouses, 0);
});

test("parseVerdict falls back to inconclusive for an unrecognised status value", () => {
  const verdict = parseVerdict('{"infrastructureDetected":"maybe","imageQuality":"clear","confidence":0.5,"estimatedNearbyHouses":3,"notes":""}');
  assert.equal(verdict.status, "inconclusive");
});

test("parseVerdict defaults to degraded when imageQuality is missing or unrecognised", () => {
  const verdict = parseVerdict('{"infrastructureDetected":"present","confidence":0.6,"estimatedNearbyHouses":4,"notes":""}');
  assert.equal(verdict.imageQuality, "degraded");
});

test("parseVerdict forces inconclusive whenever the image is unusable, regardless of the claimed status", () => {
  const verdict = parseVerdict(
    '{"infrastructureDetected":"present","imageQuality":"unusable","confidence":0.9,"estimatedNearbyHouses":5,"notes":"Heavy cloud cover obscures the area."}',
  );
  assert.equal(verdict.status, "inconclusive");
  assert.equal(verdict.imageQuality, "unusable");
});

test("parseVerdict returns null when there is no JSON object to parse", () => {
  assert.equal(parseVerdict("I could not analyse this image."), null);
});

test("handleSatelliteVerify ignores requests outside its route without touching env", async () => {
  const request = new Request("https://veritas.example/api/rea/projects");
  const result = await handleSatelliteVerify(request, {});
  assert.equal(result, null);
});

test("handleSatelliteVerify rejects non-POST methods on a matching route", async () => {
  const request = new Request("https://veritas.example/api/projects/proj-1/satellite-verify", { method: "GET" });
  const result = await handleSatelliteVerify(request, {});
  assert.equal(result.status, 405);
});

test("handleSatelliteVerify requires authentication before touching Gemini or D1", async () => {
  const request = new Request("https://veritas.example/api/projects/proj-1/satellite-verify", { method: "POST" });
  const result = await handleSatelliteVerify(request, { DB: null, GEMINI_API_KEY: "test-key" });
  assert.equal(result.status, 401);
});
