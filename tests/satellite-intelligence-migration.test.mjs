import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migrationPath = "migrations/0007_satellite_intelligence.sql";

test("satellite intelligence migration defines durable analysis history", () => {
  assert.equal(fs.existsSync(migrationPath), true, `${migrationPath} must exist`);
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS satellite_analysis_runs/);
  assert.match(sql, /project_id TEXT NOT NULL REFERENCES projects\(id\)/);
  assert.match(sql, /requested_by_user_id TEXT REFERENCES users\(id\)/);
  assert.match(sql, /analysis_type TEXT NOT NULL/);
  assert.match(sql, /latitude_used REAL NOT NULL/);
  assert.match(sql, /longitude_used REAL NOT NULL/);
  assert.match(sql, /baseline_image_date TEXT/);
  assert.match(sql, /comparison_image_date TEXT/);
  assert.match(sql, /baseline_release_date TEXT/);
  assert.match(sql, /comparison_release_date TEXT/);
  assert.match(sql, /review_required INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /review_status TEXT NOT NULL DEFAULT 'unreviewed'/);
  assert.match(sql, /idx_satellite_analysis_project_time/);
  assert.match(sql, /idx_satellite_analysis_review/);
});
