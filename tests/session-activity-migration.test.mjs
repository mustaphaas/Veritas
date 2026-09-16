import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = fs.readFileSync("migrations/0006_user_session_activity.sql", "utf8");

test("session activity migration creates durable history", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_session_history/);
  assert.match(migration, /user_id TEXT NOT NULL REFERENCES users\(id\)/);
  assert.match(migration, /login_at TEXT NOT NULL/);
  assert.match(migration, /last_seen_at TEXT NOT NULL/);
  assert.match(migration, /duration_seconds INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /end_reason TEXT/);
  assert.match(migration, /user_agent TEXT/);
  assert.match(migration, /device_family TEXT/);
  assert.match(migration, /ALTER TABLE sessions ADD COLUMN history_id TEXT/);
  assert.match(migration, /idx_session_history_user_time/);
  assert.match(migration, /idx_session_history_status_time/);
});
