import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("client/components/ReaProjectMapProgramme.tsx", "utf8");

test("Project Map renders Map and Satellite controls inside the active map component", () => {
  assert.match(source, /Satellite/);
  assert.match(source, /Map \/ Satellite|Satellite imagery|imagery mode/i);
  assert.match(source, /server\.arcgisonline\.com|World_Imagery/);
});
