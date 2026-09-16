import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const patch = fs.readFileSync("scripts/patch-user-session-activity.mjs", "utf8");

test("Veritas AI receives grounded session activity context", () => {
  assert.match(patch, /sessionActivity/);
  assert.match(patch, /schemaAvailable/);
  assert.match(patch, /trackingStatus/);
  assert.match(patch, /perUser/);
  assert.match(patch, /auditLatestLogin/);
  assert.match(patch, /latestAuditActivity/);
  assert.match(patch, /historicalAuditLoginCount/);
  assert.match(patch, /usersWithoutRecordedLogin/);
  assert.match(patch, /inactivityClassification/);
  assert.match(patch, /Never recorded/);
  assert.match(patch, /recentSessions/);
  assert.match(patch, /observed session span/i);
  assert.match(patch, /does not prove/i);
  assert.match(patch, /misconduct|non-performance|account compromise/i);
  assert.match(patch, /must not say.*schema.*absent/i);
});
