import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = fs.readFileSync("client/pages/MEDashboard.tsx", "utf8");

test("M&E Analytics renders a visual intelligence workspace", () => {
  assert.match(page, /Portfolio Analytics/);
  assert.match(page, /Verification Progress/);
  assert.match(page, /Inspection Status/);
  assert.match(page, /Programme Performance/);
  assert.match(page, /Verification & Re-Inspection Trend/);
  assert.match(page, /State Performance/);
  assert.match(page, /Contractor Performance/);
});

test("M&E Analytics uses charts and restrained motion", () => {
  assert.match(page, /ResponsiveContainer/);
  assert.match(page, /PieChart/);
  assert.match(page, /BarChart/);
  assert.match(page, /AreaChart/);
  assert.match(page, /motion\.section/);
});

test("M&E Admin gets team performance while officers remain assignment scoped", () => {
  assert.match(page, /isMeAdmin && <AnalyticsPanel title="Team Performance"/);
  assert.match(page, /Analytics is limited to projects assigned to your M&E teams/);
});

test("Re-Inspection analytics counts actual re-inspection statuses", () => {
  assert.match(page, /\/re-\?inspection\/i\.test\(inspection\.status\)/);
  assert.doesNotMatch(page, /inspectionSummary\.flagged/);
});
