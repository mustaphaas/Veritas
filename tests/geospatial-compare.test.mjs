import test from "node:test";
import assert from "node:assert/strict";
import {
  distanceMetres,
  compareGeospatialEvidence,
  handleGeospatialCompare,
} from "../worker/geospatial-compare.js";

test("distanceMetres returns approximately zero for identical coordinates", () => {
  assert.ok(distanceMetres(9.101435, 7.4936936, 9.101435, 7.4936936) < 0.01);
});

test("compareGeospatialEvidence marks a field arrival inside the approved geofence as aligned", () => {
  const result = compareGeospatialEvidence(
    { latitude: 9.101435, longitude: 7.4936936, geofenceRadiusMetres: 250 },
    { latitude: 9.102, longitude: 7.494, accuracyMetres: 8, verifiedAt: "2026-09-27T00:00:00Z" },
  );
  assert.equal(result.geofenceStatus, "inside");
  assert.equal(result.comparisonStatus, "aligned");
  assert.ok(result.distanceMetres > 0);
  assert.equal(result.fieldGps.accuracyMetres, 8);
});

test("compareGeospatialEvidence flags an arrival outside the approved geofence", () => {
  const result = compareGeospatialEvidence(
    { latitude: 9.101435, longitude: 7.4936936, geofenceRadiusMetres: 100 },
    { latitude: 9.11, longitude: 7.50 },
  );
  assert.equal(result.geofenceStatus, "outside");
  assert.equal(result.comparisonStatus, "outside_geofence");
});

test("compareGeospatialEvidence does not invent a field coordinate when arrival GPS is missing", () => {
  const result = compareGeospatialEvidence(
    { latitude: 9.101435, longitude: 7.4936936, geofenceRadiusMetres: 250 },
    null,
  );
  assert.equal(result.fieldGps, null);
  assert.equal(result.comparisonStatus, "insufficient_evidence");
});

test("handleGeospatialCompare ignores unrelated routes without touching the database", async () => {
  const request = new Request("https://veritas.example/api/rea/projects");
  const result = await handleGeospatialCompare(request, {});
  assert.equal(result, null);
});

test("handleGeospatialCompare rejects non-GET methods on a matching route", async () => {
  const request = new Request("https://veritas.example/api/projects/proj-1/geospatial-compare", { method: "POST" });
  const result = await handleGeospatialCompare(request, {});
  assert.equal(result.status, 405);
});

test("handleGeospatialCompare requires authentication before touching D1", async () => {
  const request = new Request("https://veritas.example/api/projects/proj-1/geospatial-compare");
  const result = await handleGeospatialCompare(request, { DB: null });
  assert.equal(result.status, 401);
});
