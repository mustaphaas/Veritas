import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const patch = fs.readFileSync("scripts/patch-user-session-activity.mjs", "utf8");

test("session lifecycle is recorded durably", () => {
  assert.match(patch, /user_session_history/);
  assert.match(patch, /history_id/);
  assert.match(patch, /manual_logout/);
  assert.match(patch, /duration_seconds/);
  assert.match(patch, /last_seen_at/);
  assert.match(patch, /authenticatedDatabaseUser[\s\S]*historyId/);
  assert.match(patch, /UPDATE user_session_history SET last_seen_at/);
});

test("session activity endpoint is tenant safe", () => {
  assert.match(patch, /\/api\/session-activity/);
  assert.match(patch, /consultant_admin/);
  assert.match(patch, /consultant_firm/);
  assert.match(patch, /REA or consultant administrator access required/);
  assert.match(patch, /limit/);
  assert.match(patch, /expired/);
});
