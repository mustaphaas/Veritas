import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const patch = fs.readFileSync("scripts/patch-user-session-activity.mjs", "utf8");

test("Veritas AI receives grounded session activity context", () => {
  assert.match(patch, /sessionActivity/);
  assert.match(patch, /recentSessions/);
  assert.match(patch, /observed session span/i);
  assert.match(patch, /does not prove/i);
  assert.match(patch, /misconduct|non-performance|account compromise/i);
});
