import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const patch = fs.readFileSync("scripts/patch-user-session-activity.mjs", "utf8");

test("REA Audit Trail exposes login session history", () => {
  assert.match(patch, /Login Sessions/);
  assert.match(patch, /Last activity/);
  assert.match(patch, /Observed duration/);
  assert.match(patch, /Consultant/);
  assert.match(patch, /Device/);
  assert.match(patch, /\/api\/session-activity/);
});
