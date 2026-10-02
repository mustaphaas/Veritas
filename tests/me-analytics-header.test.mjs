import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = fs.readFileSync("client/pages/MEDashboard.tsx", "utf8");

test("M&E analytics header uses compact intelligence hierarchy", () => {
  assert.match(page, /M&E Intelligence/);
  assert.match(page, /Portfolio Analytics/);
  assert.match(page, /Assigned portfolio/);
  assert.match(page, /Filters update every chart and metric on this page/);
});

test("M&E analytics header uses icon-led animated metric cards", () => {
  assert.match(page, /analyticsSummary\.map/);
  assert.match(page, /metric\.progress/);
  assert.match(page, /group-hover:scale-105/);
  assert.match(page, /motion\.div/);
});

test("analytics summary metrics retain Verification, Completion and Re-Inspection", () => {
  assert.match(page, /label: "Verification"/);
  assert.match(page, /label: "Completion"/);
  assert.match(page, /label: "Re-Inspection"/);
});
