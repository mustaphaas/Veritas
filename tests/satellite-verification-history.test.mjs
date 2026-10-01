import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  analyticsCatalog,
  validateAnalyticsPlan,
  compileAnalyticsPlan,
} from "../worker/analytics.js";

const migration = fs.readFileSync("migrations/0015_satellite_verification_history.sql", "utf8");
const worker = fs.readFileSync("worker/satellite-verify.js", "utf8");
const index = fs.readFileSync("worker/index.js", "utf8");
const client = fs.readFileSync("client/lib/rea-project-map-data.ts", "utf8");

test("migration creates append-only satellite verification history and backfills latest cached results", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS satellite_verification_history/);
  assert.match(migration, /project_id TEXT NOT NULL REFERENCES projects/);
  assert.match(migration, /verdict_status TEXT/);
  assert.match(migration, /imagery_date TEXT/);
  assert.match(migration, /image_url TEXT/);
  assert.match(migration, /checked_at TEXT NOT NULL/);
  assert.match(migration, /INSERT OR IGNORE INTO satellite_verification_history/);
  assert.match(migration, /'legacy-' \|\| p\.id/);
  assert.match(migration, /p\.satellite_verification_checked_at IS NOT NULL/);
});

test("every completed satellite re-check appends history atomically with the latest cache", () => {
  assert.match(worker, /const historyId = crypto\.randomUUID\(\)/);
  assert.match(worker, /await env\.DB\.batch\(\[/);
  assert.match(worker, /UPDATE projects SET/);
  assert.match(worker, /INSERT INTO satellite_verification_history/);
  assert.match(worker, /verdict\.status/);
  assert.match(worker, /verdict\.modelStatus/);
  assert.match(worker, /verdict\.evidenceLocation/);
  assert.match(worker, /imagerySource/);
  assert.match(worker, /imageryDate/);
  assert.match(worker, /analysisMethod/);
  assert.match(worker, /imageUrl/);
  assert.match(worker, /historyId,/);
});

test("history API is routed and available to the project-map client", () => {
  assert.match(index, /satellite-verification-history/);
  assert.match(index, /handleSatelliteVerificationHistory/);
  assert.match(client, /SatelliteVerificationHistoryEntry/);
  assert.match(client, /fetchProjectSatelliteVerificationHistory/);
  assert.match(client, /satellite-verification-history\?limit=/);
});

test("Veritas analytics can reason over seen, not-seen and inconclusive verification history", () => {
  const catalog = analyticsCatalog();
  assert.ok(catalog.satelliteVerifications);
  assert.ok(catalog.satelliteVerifications.dimensions.includes("projectName"));
  assert.ok(catalog.satelliteVerifications.dimensions.includes("verdictStatus"));
  assert.ok(catalog.satelliteVerifications.dimensions.includes("checkedAt"));
  assert.ok(catalog.satelliteVerifications.measures.includes("verificationCount"));
  assert.ok(catalog.satelliteVerifications.measures.includes("seenCount"));
  assert.ok(catalog.satelliteVerifications.measures.includes("notSeenCount"));
  assert.ok(catalog.satelliteVerifications.measures.includes("inconclusiveCount"));

  const plan = validateAnalyticsPlan({
    mode: "analytics",
    dataset: "satelliteVerifications",
    dimensions: ["projectName", "verdictStatus"],
    measures: ["verificationCount", "averageConfidence"],
    filters: [{ field: "state", op: "eq", value: "Ogun" }],
    limit: 100,
  });
  assert.ok(plan);
  const { sql } = compileAnalyticsPlan(plan);
  assert.match(sql, /satellite_verification_history h JOIN projects p/);
  assert.match(sql, /h\.verdict_status/);
  assert.match(sql, /COUNT\(\*\)/);
});
